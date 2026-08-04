import { ORPCError } from "@orpc/server";
import {
	type ClickHouseExecutor,
	getClickhouse,
	getSafeClickHouseTable,
} from "../clickhouse.js";
import { shouldUseUsageEventAnalytics } from "../lib/env.js";
import { buildEstimatedCostSql } from "./pricing.service.js";

const USAGE_EVENTS_TABLE = "rudel.usage_events";
const SESSION_ANALYTICS_TABLE = "rudel.session_analytics";
const READY_TTL_MS = 60_000;
const DEGRADED_TTL_MS = 5_000;
const PROBE_TIMEOUT_MS = 2_000;

const LEGACY_SESSION_COST_SQL = buildEstimatedCostSql({
	modelExpr: "sa.model_used",
	dateExpr: "sa.session_date",
	inputExpr:
		"(ifNull(sa.input_tokens, 0) - ifNull(sa.cache_read_input_tokens, 0) - ifNull(sa.cache_creation_input_tokens, 0))",
	outputExpr: "ifNull(sa.output_tokens, 0)",
	cacheReadInputExpr: "ifNull(sa.cache_read_input_tokens, 0)",
	cacheCreationInputExpr: "ifNull(sa.cache_creation_input_tokens, 0)",
});

const EVENT_COST_SQL = buildEstimatedCostSql({
	modelExpr: "e.resolved_model",
	dateExpr: "e.usage_date",
	inputExpr: "e.uncached_input_tokens",
	outputExpr: "e.output_tokens",
	cacheReadInputExpr: "e.cache_read_input_tokens",
	cacheCreationInputExpr: "e.cache_write_5m_input_tokens",
	cacheCreation1hInputExpr: "e.cache_write_1h_input_tokens",
	contextInputExpr: "e.context_input_tokens",
});

const PRICEABLE_EVENT_SQL = `
	e.model_status = 'resolved'
	AND e.has_valid_timestamp = 1
	AND NOT has(e.quality_flags, 'service_tier_conflict')
	AND NOT has(e.quality_flags, 'unrecognized_service_tier')
	AND e.service_tier IN ('', 'standard', 'default', 'auto')
`;

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
	sa.model_used AS model_used,
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
	return `
		latest_usage_records AS (
			SELECT *
			FROM (
				SELECT *
				FROM ${getSafeClickHouseTable(USAGE_EVENTS_TABLE)}
				WHERE ${usageEventFilters}
				ORDER BY
					organization_id,
					user_id,
					source,
					session_id,
					event_id,
					event_version DESC
				LIMIT 1 BY organization_id, user_id, source, session_id, event_id
			)
		),
		latest_usage_receipts AS (
			SELECT *
			FROM (
				SELECT *
				FROM latest_usage_records
				WHERE record_kind = 'receipt'
				ORDER BY
					organization_id,
					user_id,
					source,
					session_id,
					event_version DESC
				LIMIT 1 BY organization_id, user_id, source, session_id
			)
		),
		complete_usage_receipts AS (
			SELECT
				organization_id,
				user_id,
				source,
				session_id,
				event_version AS generation,
				receipt_event_count
			FROM latest_usage_receipts
			WHERE is_deleted = 0 AND receipt_is_complete = 1
		),
		consistent_usage_sessions AS (
			SELECT
				r.organization_id,
				r.user_id,
				r.source,
				r.session_id,
				r.generation,
				r.receipt_event_count
			FROM complete_usage_receipts AS r
			LEFT JOIN latest_usage_records AS e
				ON e.organization_id = r.organization_id
				AND e.user_id = r.user_id
				AND e.source = r.source
				AND e.session_id = r.session_id
			GROUP BY
				r.organization_id,
				r.user_id,
				r.source,
				r.session_id,
				r.generation,
				r.receipt_event_count
			HAVING countIf(
				e.record_kind = 'event'
				AND e.is_deleted = 0
				AND e.event_version = r.generation
			) = r.receipt_event_count
		),
		active_usage_events AS (
			SELECT e.*
			FROM latest_usage_records AS e
			INNER JOIN consistent_usage_sessions AS c
				ON e.organization_id = c.organization_id
				AND e.user_id = c.user_id
				AND e.source = c.source
				AND e.session_id = c.session_id
				AND e.event_version = c.generation
			WHERE e.record_kind = 'event' AND e.is_deleted = 0
		),
		priced_usage_events AS (
			SELECT
				e.*,
				if(
					e.uncached_input_tokens
						+ e.cache_read_input_tokens
						+ e.cache_write_5m_input_tokens
						+ e.cache_write_1h_input_tokens
						+ e.output_tokens = 0,
					toNullable(0.0),
					if(${PRICEABLE_EVENT_SQL}, ${EVENT_COST_SQL}, CAST(NULL, 'Nullable(Float64)'))
				) AS estimated_cost
			FROM active_usage_events AS e
		),
		usage_event_session_rollups AS (
			SELECT
				p.organization_id,
				p.user_id,
				p.source,
				p.session_id,
				sum(p.uncached_input_tokens + p.cache_read_input_tokens + p.cache_write_5m_input_tokens + p.cache_write_1h_input_tokens) AS input_tokens,
				sum(p.output_tokens) AS output_tokens,
				sum(p.cache_read_input_tokens) AS cache_read_input_tokens,
				sum(p.cache_write_5m_input_tokens + p.cache_write_1h_input_tokens) AS cache_creation_input_tokens,
				sum(p.uncached_input_tokens + p.cache_read_input_tokens + p.cache_write_5m_input_tokens + p.cache_write_1h_input_tokens + p.output_tokens) AS total_tokens,
				if(countIf(isNotNull(p.estimated_cost)) > 0, toNullable(sum(ifNull(p.estimated_cost, 0))), CAST(NULL, 'Nullable(Float64)')) AS estimated_cost,
				toUInt8(countIf(isNull(p.estimated_cost)) = 0) AS cost_is_complete
			FROM priced_usage_events AS p
			GROUP BY p.organization_id, p.user_id, p.source, p.session_id
		),
		usage_event_daily_rollups AS (
			SELECT
				p.organization_id,
				p.user_id,
				p.source,
				p.session_id,
				p.usage_date,
				sum(p.uncached_input_tokens + p.cache_read_input_tokens + p.cache_write_5m_input_tokens + p.cache_write_1h_input_tokens) AS input_tokens,
				sum(p.output_tokens) AS output_tokens,
				sum(p.cache_read_input_tokens) AS cache_read_input_tokens,
				sum(p.cache_write_5m_input_tokens + p.cache_write_1h_input_tokens) AS cache_creation_input_tokens,
				sum(p.uncached_input_tokens + p.cache_read_input_tokens + p.cache_write_5m_input_tokens + p.cache_write_1h_input_tokens + p.output_tokens) AS total_tokens,
				if(countIf(isNotNull(p.estimated_cost)) > 0, toNullable(sum(ifNull(p.estimated_cost, 0))), CAST(NULL, 'Nullable(Float64)')) AS estimated_cost,
				toUInt8(countIf(isNull(p.estimated_cost)) = 0) AS cost_is_complete
			FROM priced_usage_events AS p
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
				ifNull(r.input_tokens, 0) AS input_tokens,
				ifNull(r.output_tokens, 0) AS output_tokens,
				ifNull(r.cache_read_input_tokens, 0) AS cache_read_input_tokens,
				ifNull(r.cache_creation_input_tokens, 0) AS cache_creation_input_tokens,
				ifNull(r.total_tokens, 0) AS total_tokens,
				if(c.receipt_event_count = 0, toNullable(0.0), r.estimated_cost) AS estimated_cost,
				if(c.receipt_event_count = 0, toUInt8(1), r.cost_is_complete) AS cost_is_complete
			FROM usage_analytics_metadata AS sa
			ANY INNER JOIN consistent_usage_sessions AS c
				ON sa.organization_id = c.organization_id
				AND sa.user_id = c.user_id
				AND sa.source = c.source
				AND sa.session_id = c.session_id
			LEFT ANY JOIN usage_event_session_rollups AS r
				ON sa.organization_id = r.organization_id
				AND sa.user_id = r.user_id
				AND sa.source = r.source
				AND sa.session_id = r.session_id
		),
		usage_analytics_daily_sessions AS (
			SELECT
				${SESSION_METADATA_COLUMNS},
				r.usage_date,
				r.input_tokens,
				r.output_tokens,
				r.cache_read_input_tokens,
				r.cache_creation_input_tokens,
				r.total_tokens,
				r.estimated_cost,
				r.cost_is_complete
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
