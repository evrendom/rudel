import { ORPCError } from "@orpc/server";
import {
	type ClickHouseExecutor,
	getClickhouse,
	getSafeClickHouseTable,
} from "../clickhouse.js";
import { shouldUseUsageEventAnalytics } from "../lib/env.js";
import {
	buildEstimatedCostSql,
	getModelPricingCatalog,
	getModelPricingModifierCatalog,
	MODEL_LONG_CONTEXT_THRESHOLD_TOKENS,
} from "./pricing.service.js";

const USAGE_EVENTS_TABLE = "rudel.usage_events";
const SESSION_ANALYTICS_TABLE = "rudel.session_analytics";
const READY_TTL_MS = 60_000;
const DEGRADED_TTL_MS = 5_000;
const PROBE_TIMEOUT_MS = 2_000;

// session_analytics stores only the undivided cache-write total, so the legacy
// path must assume a tier. Sampled prod transcripts show ~89% of Claude Code
// cache-write tokens are 1-hour tier (Codex reports no cache writes at all),
// so the total is priced at the 1-hour rate: a small overcharge on the 5m
// minority instead of a 37.5% undercharge on the 1h majority. The events path
// needs no assumption: usage_events carries the real 5m/1h split.
const LEGACY_SESSION_COST_SQL = buildEstimatedCostSql({
	modelExpr: "sa.model_used",
	dateExpr: "sa.session_date",
	inputExpr:
		"(ifNull(sa.input_tokens, 0) - ifNull(sa.cache_read_input_tokens, 0) - ifNull(sa.cache_creation_input_tokens, 0))",
	outputExpr: "ifNull(sa.output_tokens, 0)",
	cacheReadInputExpr: "ifNull(sa.cache_read_input_tokens, 0)",
	cacheCreation1hInputExpr: "ifNull(sa.cache_creation_input_tokens, 0)",
});

const PRICEABLE_EVENT_SQL = `
	e.model_status = 'resolved'
	AND e.has_valid_timestamp = 1
	AND NOT has(e.quality_flags, 'service_tier_conflict')
	AND NOT has(e.quality_flags, 'unrecognized_service_tier')
	AND NOT has(e.quality_flags, 'model_provider_conflict')
	AND NOT has(e.quality_flags, 'provider_model_mismatch')
	AND NOT has(e.quality_flags, 'unrecognized_model_provider')
	AND NOT has(e.quality_flags, 'inference_speed_conflict')
	AND NOT has(e.quality_flags, 'unrecognized_inference_speed')
	AND NOT has(e.quality_flags, 'inference_geo_conflict')
	AND NOT has(e.quality_flags, 'unrecognized_inference_geo')
`;

type PricingModifierDimension =
	| "service_tier"
	| "inference_speed"
	| "inference_geo";

const EVENT_PRICING_RATE_CARD_SQL = buildEventPricingRateCardSql();
const EVENT_CANONICAL_PRICING_MODEL_SQL =
	buildCanonicalPricingModelSql("c.resolved_model");
const EVENT_LONG_CONTEXT_AVAILABLE_SQL = buildLongContextAvailableSql();
const EVENT_GROUP_COST_SQL = buildEventGroupCostSql();

function escapeSqlString(value: string): string {
	return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function buildEventPricingRateCardSql(): string {
	const catalog = getModelPricingCatalog();
	const rows = catalog.map((entry) => {
		return `tuple('${escapeSqlString(entry.model)}', '${entry.provider}', '${entry.contextBand}', toDate('${entry.effectiveFrom}'), toDate('${entry.effectiveTo ?? "2299-12-31"}'), toFloat64(${entry.inputPerMTok}), toFloat64(${entry.cacheReadPerMTok ?? -1}), toFloat64(${entry.cacheWrite5mPerMTok ?? -1}), toFloat64(${entry.cacheWrite1hPerMTok ?? -1}), toFloat64(${entry.outputPerMTok}))`;
	});

	return `
		SELECT
			rate.1 AS model,
			rate.2 AS provider,
			rate.3 AS context_band,
			rate.4 AS effective_from,
			rate.5 AS effective_to,
			rate.6 AS input_rate,
			rate.7 AS cache_read_rate,
			rate.8 AS cache_write_5m_rate,
			rate.9 AS cache_write_1h_rate,
			rate.10 AS output_rate
		FROM (
			SELECT arrayJoin([
				${rows.join(",\n\t\t\t\t")}
			]) AS rate
		)
	`;
}

function buildCanonicalPricingModelSql(modelExpr: string): string {
	const canonicalModelByPattern = new Map<string, string>();
	for (const entry of getModelPricingCatalog()) {
		for (const pattern of entry.match) {
			const existingModel = canonicalModelByPattern.get(pattern);
			if (existingModel !== undefined && existingModel !== entry.model) {
				throw new Error(
					`Pricing pattern ${pattern} maps to both ${existingModel} and ${entry.model}`,
				);
			}
			canonicalModelByPattern.set(pattern, entry.model);
		}
	}

	const clauses = [...canonicalModelByPattern.entries()].flatMap(
		([pattern, model]) => [
			`match(lowerUTF8(${modelExpr}), '${escapeSqlString(pattern)}')`,
			`'${escapeSqlString(model)}'`,
		],
	);
	return `multiIf(${clauses.join(", ")}, '')`;
}

function buildLongContextAvailableSql(): string {
	const clauses = getModelPricingCatalog()
		.filter((entry) => entry.contextBand === "long")
		.flatMap((entry) => [
			`g.pricing_model = '${escapeSqlString(entry.model)}'
				AND g.usage_date >= toDate('${entry.effectiveFrom}')
				AND g.usage_date <= toDate('${entry.effectiveTo ?? "2299-12-31"}')`,
			"toUInt8(1)",
		]);
	return `multiIf(${clauses.join(", ")}, toUInt8(0))`;
}

function buildEventGroupCostSql(): string {
	const modifierMultiplier = [
		buildModifierDimensionSql("service_tier", "g.service_tier"),
		buildModifierDimensionSql("inference_speed", "g.inference_speed"),
		buildModifierDimensionSql("inference_geo", "g.inference_geo"),
	]
		.map((expression) => `(${expression})`)
		.join(" * ");
	const components = [
		buildRateComponentSql("g.group_uncached_input_tokens", "r.input_rate"),
		buildRateComponentSql(
			"g.group_cache_read_input_tokens",
			"r.cache_read_rate",
		),
		buildRateComponentSql(
			"g.group_cache_write_5m_input_tokens",
			"r.cache_write_5m_rate",
		),
		buildRateComponentSql(
			"g.group_cache_write_1h_input_tokens",
			"r.cache_write_1h_rate",
		),
		buildRateComponentSql("g.group_output_tokens", "r.output_rate"),
	];

	return `if(
		g.group_uncached_input_tokens
			+ g.group_cache_read_input_tokens
			+ g.group_cache_write_5m_input_tokens
			+ g.group_cache_write_1h_input_tokens
			+ g.group_output_tokens = 0,
		toNullable(0.0),
		if(
			g.is_priceable = 1
				AND r.model != ''
				AND lowerUTF8(trimBoth(g.model_provider)) IN ('', r.provider),
			round((${components.join(" + ")}) * (${modifierMultiplier}), 12),
			CAST(NULL, 'Nullable(Float64)')
		)
	)`;
}

function buildRateComponentSql(tokensExpr: string, rateExpr: string): string {
	return `if(
		${tokensExpr} = 0,
		toNullable(0.0),
		if(
			${rateExpr} < 0,
			CAST(NULL, 'Nullable(Float64)'),
			toNullable(${tokensExpr} / 1000000.0 * ${rateExpr})
		)
	)`;
}

function buildModifierDimensionSql(
	dimension: PricingModifierDimension,
	valueExpr: string,
): string {
	const baseValues =
		dimension === "service_tier"
			? `if(
				r.provider = 'anthropic',
				['', 'auto', 'default', 'priority', 'standard'],
				['', 'auto', 'default', 'standard']
			)`
			: dimension === "inference_speed"
				? "['', 'standard']"
				: "['', 'global']";
	const clauses = getModelPricingModifierCatalog()
		.filter((rule) => rule.dimension === dimension)
		.flatMap((rule) => {
			const conditions = [
				`g.pricing_model = '${escapeSqlString(rule.model)}'`,
				`lowerUTF8(trimBoth(${valueExpr})) IN (${rule.values
					.map((value) => `'${escapeSqlString(value)}'`)
					.join(", ")})`,
				`g.usage_date >= toDate('${rule.effectiveFrom}')`,
			];
			if (rule.effectiveTo) {
				conditions.push(`g.usage_date <= toDate('${rule.effectiveTo}')`);
			}
			if (rule.contextBand) {
				conditions.push(`r.context_band = '${rule.contextBand}'`);
			}
			return [conditions.join(" AND "), `toNullable(${rule.multiplier})`];
		});

	return `multiIf(
		lowerUTF8(trimBoth(${valueExpr})) IN ${baseValues},
		toNullable(1.0),
		${clauses.join(",\n\t\t")},
		CAST(NULL, 'Nullable(Float64)')
	)`;
}

const SESSION_METADATA_COLUMNS = `
	sa.session_date AS session_date,
	sa.last_interaction_date AS last_interaction_date,
	sa.session_id AS session_id,
	sa.organization_id AS organization_id,
	sa.project_path AS project_path,
	sa.git_remote AS git_remote,
	sa.package_name AS package_name,
	sa.package_type AS package_type,
	sa.filter_version AS filter_version,
	sa.ingested_at AS ingested_at,
	sa.user_id AS user_id,
	sa.git_branch AS git_branch,
	sa.git_sha AS git_sha,
	sa.tag AS tag,
	sa.source AS source,
	sa.skills AS skills,
	sa.slash_commands AS slash_commands,
	sa.subagent_types AS subagent_types,
	sa.total_interactions AS total_interactions,
	sa.actual_duration_min AS actual_duration_min,
	sa.avg_period_sec AS avg_period_sec,
	sa.median_period_sec AS median_period_sec,
	sa.quick_responses AS quick_responses,
	sa.normal_responses AS normal_responses,
	sa.long_pauses AS long_pauses,
	sa.error_count AS error_count,
	sa.error_pattern AS error_pattern,
	sa.has_commit AS has_commit,
	sa.session_archetype AS session_archetype,
	sa.success_score AS success_score,
	sa.used_plan_mode AS used_plan_mode,
	sa.inference_duration_sec AS inference_duration_sec,
	sa.human_duration_sec AS human_duration_sec
`;

export interface UsageAnalyticsScope {
	readonly sessionIdParam?: string;
	readonly sourceParam?: string;
	readonly userIdParam?: string;
}

export interface UsageAnalyticsQueryContext {
	readonly cteDefinitions: string;
	readonly dailySessionsRelation: "usage_analytics_daily_sessions";
	readonly mode: "events" | "legacy";
	readonly sessionsRelation: "usage_analytics_sessions";
}

interface ReadinessState {
	checkedAt: number;
	status: "degraded" | "ready";
}

interface UsageEventAnalyticsReadinessGateOptions {
	readonly degradedTtlMs: number;
	readonly now?: () => number;
	readonly probe: () => Promise<void>;
	readonly readyTtlMs: number;
	readonly timeoutMs: number;
}

export function buildUsageCostSubtotalSql(
	estimatedCostExpression: string,
	precision: number,
): string {
	return `toNullable(round(sum(ifNull(${estimatedCostExpression}, 0)), ${precision}))`;
}

export class UsageEventAnalyticsReadinessGate {
	private readonly degradedTtlMs: number;
	private inFlight: Promise<ReadinessState> | null = null;
	private readonly now: () => number;
	private readonly probe: () => Promise<void>;
	private readonly readyTtlMs: number;
	private state: ReadinessState | null = null;
	private readonly timeoutMs: number;

	constructor(options: UsageEventAnalyticsReadinessGateOptions) {
		this.degradedTtlMs = options.degradedTtlMs;
		this.now = options.now ?? Date.now;
		this.probe = options.probe;
		this.readyTtlMs = options.readyTtlMs;
		this.timeoutMs = options.timeoutMs;
	}

	async assertReady(): Promise<void> {
		const ttl =
			this.state?.status === "ready" ? this.readyTtlMs : this.degradedTtlMs;
		if (this.state && this.now() - this.state.checkedAt < ttl) {
			if (this.state.status === "ready") return;
			throwAnalyticsUnavailable();
		}

		this.inFlight ??= this.runProbe().finally(() => {
			this.inFlight = null;
		});
		this.state = await this.inFlight;
		if (this.state.status !== "ready") throwAnalyticsUnavailable();
	}

	private async runProbe(): Promise<ReadinessState> {
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timeoutId = setTimeout(
				() =>
					reject(new Error("usage-event analytics readiness probe timed out")),
				this.timeoutMs,
			);
		});

		try {
			await Promise.race([this.probe(), timeout]);
			return { checkedAt: this.now(), status: "ready" };
		} catch {
			return { checkedAt: this.now(), status: "degraded" };
		} finally {
			if (timeoutId !== undefined) clearTimeout(timeoutId);
		}
	}
}

function buildUsageEventFilters(scope: UsageAnalyticsScope): string {
	const filters = ["organization_id = {orgId:String}"];
	if (scope.userIdParam) {
		filters.push(`user_id = {${scope.userIdParam}:String}`);
	}
	if (scope.sourceParam) {
		filters.push(`source = {${scope.sourceParam}:String}`);
	}
	if (scope.sessionIdParam) {
		filters.push(`session_id = {${scope.sessionIdParam}:String}`);
	}
	return filters.join("\n\t\t\t\t\tAND ");
}

export function buildUsageEventAnalyticsCte(
	scope: UsageAnalyticsScope = {},
): string {
	const usageEventFilters = buildUsageEventFilters(scope);
	// The organization/key filters follow the table's primary-key prefix, so FINAL
	// resolves exact ReplacingMergeTree state without scanning unrelated tenants.
	// Keep this pipeline single-pass: ClickHouse inlines repeated CTE references.
	return `
		latest_usage_records AS (
			SELECT *
			FROM ${getSafeClickHouseTable(USAGE_EVENTS_TABLE)} FINAL
			WHERE ${usageEventFilters}
		),
		usage_records_with_receipt AS (
			SELECT
				*,
				argMaxIf(event_version, event_version, record_kind = 'receipt') OVER usage_session_window AS receipt_generation,
				argMaxIf(receipt_event_count, event_version, record_kind = 'receipt') OVER usage_session_window AS latest_receipt_event_count,
				argMaxIf(receipt_is_complete, event_version, record_kind = 'receipt') OVER usage_session_window AS latest_receipt_is_complete,
				argMaxIf(is_deleted, event_version, record_kind = 'receipt') OVER usage_session_window AS latest_receipt_is_deleted
			FROM latest_usage_records
			WINDOW usage_session_window AS (
				PARTITION BY organization_id, user_id, source, session_id
			)
		),
		usage_records_with_consistency AS (
			SELECT
				*,
				countIf(
					record_kind = 'event'
					AND is_deleted = 0
					AND event_version = receipt_generation
				) OVER usage_session_window AS active_event_count
			FROM usage_records_with_receipt
			WINDOW usage_session_window AS (
				PARTITION BY organization_id, user_id, source, session_id
			)
		),
		consistent_usage_records AS (
			SELECT *
			FROM usage_records_with_consistency
			WHERE latest_receipt_is_deleted = 0
				AND latest_receipt_is_complete = 1
				AND active_event_count = latest_receipt_event_count
				AND event_version = receipt_generation
				AND is_deleted = 0
				AND record_kind IN ('event', 'receipt')
		),
		usage_records_with_display_model AS (
			SELECT
				*,
				argMaxIf(
					resolved_model,
					tuple(has_valid_timestamp, occurred_at, first_observed_line, event_id),
					record_kind = 'event'
						AND agent_id = 'main'
						AND model_status = 'resolved'
						AND resolved_model != ''
				) OVER usage_session_window AS latest_main_model,
				argMaxIf(
					resolved_model,
					tuple(has_valid_timestamp, occurred_at, first_observed_line, event_id),
					record_kind = 'event'
						AND model_status = 'resolved'
						AND resolved_model != ''
				) OVER usage_session_window AS latest_resolved_model
			FROM consistent_usage_records
			WINDOW usage_session_window AS (
				PARTITION BY organization_id, user_id, source, session_id
			)
		),
		usage_event_pricing_candidates AS (
			SELECT
				e.organization_id,
				e.user_id,
				e.source,
				e.session_id,
				e.record_kind,
				e.usage_date,
				e.resolved_model,
				e.model_provider,
				e.service_tier,
				e.inference_speed,
				e.inference_geo,
				if(
					e.context_input_tokens > ${MODEL_LONG_CONTEXT_THRESHOLD_TOKENS},
					'long',
					'base'
				) AS context_band,
				toUInt8(${PRICEABLE_EVENT_SQL}) AS is_priceable,
				toUInt8(has(e.quality_flags, 'inference_geo_not_available')) AS has_geo_gap,
				any(e.latest_main_model) AS latest_main_model,
				any(e.latest_resolved_model) AS latest_resolved_model,
				sum(e.uncached_input_tokens) AS group_uncached_input_tokens,
				sum(e.cache_read_input_tokens) AS group_cache_read_input_tokens,
				sum(e.cache_write_5m_input_tokens) AS group_cache_write_5m_input_tokens,
				sum(e.cache_write_1h_input_tokens) AS group_cache_write_1h_input_tokens,
				sum(e.output_tokens) AS group_output_tokens
			FROM usage_records_with_display_model AS e
			GROUP BY
				e.organization_id,
				e.user_id,
				e.source,
				e.session_id,
				e.record_kind,
				e.usage_date,
				e.resolved_model,
				e.model_provider,
				e.service_tier,
				e.inference_speed,
				e.inference_geo,
				context_band,
				is_priceable,
				has_geo_gap
		),
		usage_event_pricing_groups AS (
			SELECT
				c.*,
				${EVENT_CANONICAL_PRICING_MODEL_SQL} AS pricing_model
			FROM usage_event_pricing_candidates AS c
		),
		usage_event_pricing_rate_card AS (
			${EVENT_PRICING_RATE_CARD_SQL}
		),
		priced_usage_groups AS (
			SELECT
				g.*,
				${EVENT_GROUP_COST_SQL} AS group_estimated_cost
			FROM usage_event_pricing_groups AS g
			ANY LEFT JOIN usage_event_pricing_rate_card AS r
				ON g.pricing_model = r.model
				AND r.context_band = if(
					g.context_band = 'long'
						AND ${EVENT_LONG_CONTEXT_AVAILABLE_SQL} = 1,
					'long',
					'base'
				)
				AND g.usage_date >= r.effective_from
				AND g.usage_date <= r.effective_to
		),
		usage_event_session_rollups AS (
			SELECT
				p.organization_id,
				p.user_id,
				p.source,
				p.session_id,
				sum(p.group_uncached_input_tokens + p.group_cache_read_input_tokens + p.group_cache_write_5m_input_tokens + p.group_cache_write_1h_input_tokens) AS input_tokens,
				sum(p.group_output_tokens) AS output_tokens,
				sum(p.group_cache_read_input_tokens) AS cache_read_input_tokens,
				sum(p.group_cache_write_5m_input_tokens + p.group_cache_write_1h_input_tokens) AS cache_creation_input_tokens,
				sum(p.group_uncached_input_tokens + p.group_cache_read_input_tokens + p.group_cache_write_5m_input_tokens + p.group_cache_write_1h_input_tokens + p.group_output_tokens) AS total_tokens,
				toNullable(sum(ifNull(p.group_estimated_cost, 0))) AS estimated_cost,
				toUInt8(countIf(
					p.record_kind = 'event'
					AND (
						isNull(p.group_estimated_cost)
						OR p.has_geo_gap = 1
					)
				) = 0) AS cost_is_complete,
				any(p.latest_main_model) AS latest_main_model,
				any(p.latest_resolved_model) AS latest_resolved_model
			FROM priced_usage_groups AS p
			GROUP BY p.organization_id, p.user_id, p.source, p.session_id
		),
		usage_event_daily_rollups AS (
			SELECT
				p.organization_id,
				p.user_id,
				p.source,
				p.session_id,
				p.usage_date,
				sum(p.group_uncached_input_tokens + p.group_cache_read_input_tokens + p.group_cache_write_5m_input_tokens + p.group_cache_write_1h_input_tokens) AS input_tokens,
				sum(p.group_output_tokens) AS output_tokens,
				sum(p.group_cache_read_input_tokens) AS cache_read_input_tokens,
				sum(p.group_cache_write_5m_input_tokens + p.group_cache_write_1h_input_tokens) AS cache_creation_input_tokens,
				sum(p.group_uncached_input_tokens + p.group_cache_read_input_tokens + p.group_cache_write_5m_input_tokens + p.group_cache_write_1h_input_tokens + p.group_output_tokens) AS total_tokens,
				toNullable(sum(ifNull(p.group_estimated_cost, 0))) AS estimated_cost,
				toUInt8(countIf(
					isNull(p.group_estimated_cost)
					OR p.has_geo_gap = 1
				) = 0) AS cost_is_complete,
				any(p.latest_main_model) AS latest_main_model,
				any(p.latest_resolved_model) AS latest_resolved_model
			FROM priced_usage_groups AS p
			WHERE p.record_kind = 'event'
			GROUP BY p.organization_id, p.user_id, p.source, p.session_id, p.usage_date
		),
		usage_analytics_metadata AS (
			SELECT *
			FROM ${getSafeClickHouseTable(SESSION_ANALYTICS_TABLE)} FINAL
			WHERE ${usageEventFilters}
		),
		usage_analytics_sessions AS (
			SELECT
				${SESSION_METADATA_COLUMNS},
				if(r.latest_main_model != '', r.latest_main_model, r.latest_resolved_model) AS model_used,
				r.input_tokens AS input_tokens,
				r.output_tokens AS output_tokens,
				r.cache_read_input_tokens AS cache_read_input_tokens,
				r.cache_creation_input_tokens AS cache_creation_input_tokens,
				r.total_tokens AS total_tokens,
				r.estimated_cost AS estimated_cost,
				r.cost_is_complete AS cost_is_complete
			FROM usage_analytics_metadata AS sa
			ANY INNER JOIN usage_event_session_rollups AS r
				ON sa.organization_id = r.organization_id
				AND sa.user_id = r.user_id
				AND sa.source = r.source
				AND sa.session_id = r.session_id
		),
		usage_analytics_daily_sessions AS (
			SELECT
				${SESSION_METADATA_COLUMNS},
				if(r.latest_main_model != '', r.latest_main_model, r.latest_resolved_model) AS model_used,
				r.usage_date AS usage_date,
				r.input_tokens AS input_tokens,
				r.output_tokens AS output_tokens,
				r.cache_read_input_tokens AS cache_read_input_tokens,
				r.cache_creation_input_tokens AS cache_creation_input_tokens,
				r.total_tokens AS total_tokens,
				r.estimated_cost AS estimated_cost,
				r.cost_is_complete AS cost_is_complete
			FROM usage_event_daily_rollups AS r
			ANY INNER JOIN usage_analytics_metadata AS sa
				ON sa.organization_id = r.organization_id
				AND sa.user_id = r.user_id
				AND sa.source = r.source
				AND sa.session_id = r.session_id
		)
	`;
}

export function buildLegacyUsageAnalyticsCte(): string {
	return `
		usage_analytics_sessions AS (
			SELECT
				sa.*,
				ifNull(${LEGACY_SESSION_COST_SQL}, 0) AS estimated_cost,
				toUInt8(1) AS cost_is_complete
			FROM ${getSafeClickHouseTable(SESSION_ANALYTICS_TABLE)} AS sa FINAL
			WHERE sa.organization_id = {orgId:String}
		),
		usage_analytics_daily_sessions AS (
			SELECT *, toDate(session_date) AS usage_date
			FROM usage_analytics_sessions
		)
	`;
}

async function probeUsageEventAnalyticsSchema(
	executor: ClickHouseExecutor,
): Promise<void> {
	await executor.query({
		clickhouse_settings: { max_execution_time: 2 },
		query: `
			SELECT
				organization_id,
				user_id,
				source,
				session_id,
				event_id,
				event_version,
				record_kind,
				receipt_is_complete,
				receipt_event_count,
				resolved_model,
				model_status,
				service_tier,
				model_provider,
				inference_speed,
				inference_geo,
				context_input_tokens,
				uncached_input_tokens,
				cache_read_input_tokens,
				cache_write_5m_input_tokens,
				cache_write_1h_input_tokens,
				output_tokens,
				quality_flags,
				usage_date,
				is_deleted
			FROM ${getSafeClickHouseTable(USAGE_EVENTS_TABLE)}
			WHERE organization_id = {orgId:String}
			LIMIT 0
		`,
		query_params: { orgId: "readiness-probe" },
	});
}

const readinessGate = new UsageEventAnalyticsReadinessGate({
	degradedTtlMs: DEGRADED_TTL_MS,
	probe: () => probeUsageEventAnalyticsSchema(getClickhouse()),
	readyTtlMs: READY_TTL_MS,
	timeoutMs: PROBE_TIMEOUT_MS,
});

function throwAnalyticsUnavailable(): never {
	throw new ORPCError("SERVICE_UNAVAILABLE", {
		message: "Request-level usage analytics is temporarily unavailable",
	});
}

export async function getUsageAnalyticsQueryContext(
	organizationId: string,
	scope: UsageAnalyticsScope = {},
): Promise<UsageAnalyticsQueryContext> {
	if (!shouldUseUsageEventAnalytics(organizationId)) {
		return {
			cteDefinitions: buildLegacyUsageAnalyticsCte(),
			dailySessionsRelation: "usage_analytics_daily_sessions",
			mode: "legacy",
			sessionsRelation: "usage_analytics_sessions",
		};
	}

	await readinessGate.assertReady();
	return {
		cteDefinitions: buildUsageEventAnalyticsCte(scope),
		dailySessionsRelation: "usage_analytics_daily_sessions",
		mode: "events",
		sessionsRelation: "usage_analytics_sessions",
	};
}
