import {
	ESTIMATED_PRICING_MODE,
	type MonthlyModelUsage,
	type WrappedSourceSplit,
	type WrappedV1,
	type WrappedV1Archetype,
} from "@rudel/api-routes";
import { WRAPPED_ARCHETYPE_CENTROIDS } from "@rudel/ch-schema/wrapped-archetype-centroids";
import {
	WRAPPED_ARCHETYPE_CENTROID_VERSION,
	WRAPPED_ARCHETYPE_PIPELINE_VERSION,
	WRAPPED_ARCHETYPE_SCOPE,
} from "@rudel/ch-schema/wrapped-archetype-constants";
import { queryClickhouse } from "../clickhouse.js";
import { buildEstimatedCostSql } from "./pricing.service.js";
import { buildWrappedArchetypeGate } from "./wrapped-archetype-gate.js";

// The wrapped endpoint is intentionally the conservative, high-trust summary.
// It should answer the broad "what is definitely true about this user's run?"
// questions and stay small enough to audit quickly.
//
// More editorial or heuristic beats can still be layered on the client from
// developer analytics, but this endpoint should remain the baseline contract
// product can point to without caveats.
const VERIFIED_METRIC_COUNT = 8;

const PER_SESSION_COST_SQL = buildEstimatedCostSql({
	modelExpr: "model_used",
	inputExpr:
		"(ifNull(input_tokens, 0) - ifNull(cache_read_input_tokens, 0) - ifNull(cache_creation_input_tokens, 0))",
	outputExpr: "ifNull(output_tokens, 0)",
	cacheReadInputExpr: "ifNull(cache_read_input_tokens, 0)",
	cacheCreationInputExpr: "ifNull(cache_creation_input_tokens, 0)",
});

interface WrappedSummaryRow {
	active_days: number | string | null;
	claude_session_count: number | string | null;
	codex_session_count: number | string | null;
	estimated_spend_usd: number | string | null;
	first_session_at: string | null;
	last_session_at: string | null;
	longest_session_min: number | string | null;
	total_sessions: number | string | null;
	total_tokens: number | string | null;
}

interface FavoriteModelRow {
	favorite_model: string;
}

interface MonthlyModelUsageRow {
	month: string;
	model: string;
	session_count: number | string | null;
}

interface UserArchetypeRow {
	computedAt: string;
	distanceRatioToMax: number | string | null;
	key: string;
	snapshotId: string;
	topTwoMargin: number | string | null;
}

interface UserArchetypeCandidate extends WrappedV1Archetype {
	distanceRatioToMax: number | null;
	topTwoMargin: number | null;
}

export async function getWrappedV1Data(
	orgId: string,
	userId: string,
): Promise<WrappedV1> {
	// These reads are independent, so we start them together and only join once.
	// That keeps the endpoint simple and avoids an avoidable waterfall.
	const [summaryRow, favoriteModel, modelByMonth, archetypeCandidate] =
		await Promise.all([
			getWrappedSummary(orgId, userId),
			getFavoriteModel(orgId, userId),
			getMonthlyModelUsage(orgId, userId),
			getUserArchetype(orgId, userId),
		]);

	const totalSessions = toNumber(summaryRow.total_sessions);
	const activeDays = toNumber(summaryRow.active_days);
	const claudeSessionCount = toNumber(summaryRow.claude_session_count);
	const codexSessionCount = toNumber(summaryRow.codex_session_count);
	const firstSessionAt = summaryRow.first_session_at;
	const archetypeGate = buildWrappedArchetypeGate({
		totalSessions,
		activeDays,
		distanceRatioToMax: archetypeCandidate?.distanceRatioToMax ?? null,
		topTwoMargin: archetypeCandidate?.topTwoMargin ?? null,
	});

	return {
		generated_at: new Date().toISOString(),
		organization_id: orgId,
		pricing_mode: ESTIMATED_PRICING_MODE,
		scope: "active_organization_all_time",
		user_id: userId,
		verified_metric_count: VERIFIED_METRIC_COUNT,
		metrics: {
			first_session_at: firstSessionAt,
			last_session_at: summaryRow.last_session_at,
			days_since_first_session: getDaysSinceTimestamp(firstSessionAt),
			total_sessions: totalSessions,
			active_days: activeDays,
			favorite_model: favoriteModel,
			total_tokens: toNumber(summaryRow.total_tokens),
			estimated_spend_usd: roundCurrency(summaryRow.estimated_spend_usd),
			longest_session_min: toNumber(summaryRow.longest_session_min),
			source_split: [
				buildSourceSplit("claude_code", claudeSessionCount, totalSessions),
				buildSourceSplit("codex", codexSessionCount, totalSessions),
			],
			model_by_month: modelByMonth,
		},
		archetype: archetypeGate.is_eligible
			? buildWrappedArchetype(archetypeCandidate)
			: null,
		archetype_gate: archetypeGate,
	};
}

async function getWrappedSummary(
	orgId: string,
	userId: string,
): Promise<WrappedSummaryRow> {
	// Archetypes should never be computed here. The archetype pipeline is a
	// separate snapshot system because global clustering is the wrong job for a
	// request-time summary endpoint.
	const rows = await queryClickhouse<WrappedSummaryRow>({
		query: `
			SELECT
				count() AS total_sessions,
				uniqExact(toDate(session_date)) AS active_days,
				if(
					count() = 0,
					NULL,
					formatDateTime(min(session_date), '%Y-%m-%dT%H:%i:%SZ')
				) AS first_session_at,
				if(
					count() = 0,
					NULL,
					formatDateTime(max(session_date), '%Y-%m-%dT%H:%i:%SZ')
				) AS last_session_at,
				ifNull(sum(ifNull(input_tokens, 0) + ifNull(output_tokens, 0)), 0) AS total_tokens,
				round(ifNull(sum(${PER_SESSION_COST_SQL}), 0), 4) AS estimated_spend_usd,
				ifNull(maxOrNull(actual_duration_min), 0) AS longest_session_min,
				countIf(source = 'claude_code') AS claude_session_count,
				countIf(source = 'codex') AS codex_session_count
			FROM rudel.session_analytics
			WHERE organization_id = {orgId:String}
				AND user_id = {userId:String}
		`,
		query_params: {
			orgId,
			userId,
		},
	});

	return rows[0] ?? getEmptyWrappedSummaryRow();
}

async function getMonthlyModelUsage(
	orgId: string,
	userId: string,
): Promise<MonthlyModelUsage[]> {
	const rows = await queryClickhouse<MonthlyModelUsageRow>({
		query: `
			SELECT
				formatDateTime(toStartOfMonth(session_date), '%Y-%m') AS month,
				model_used AS model,
				count() AS session_count
			FROM rudel.session_analytics
			WHERE organization_id = {orgId:String}
				AND user_id = {userId:String}
				AND model_used != ''
				AND model_used != 'unknown'
			GROUP BY month, model
			ORDER BY month ASC, session_count DESC, model ASC
		`,
		query_params: {
			orgId,
			userId,
		},
	});

	return rows.map((row) => ({
		month: row.month,
		model: row.model,
		session_count: toNumber(row.session_count),
	}));
}

async function getFavoriteModel(
	orgId: string,
	userId: string,
): Promise<string | null> {
	const rows = await queryClickhouse<FavoriteModelRow>({
		query: `
			SELECT favorite_model
			FROM (
				SELECT
					model_used AS favorite_model,
					count() AS session_count,
					sum(ifNull(input_tokens, 0) + ifNull(output_tokens, 0)) AS total_tokens
				FROM rudel.session_analytics
				WHERE organization_id = {orgId:String}
					AND user_id = {userId:String}
					AND model_used != ''
					AND model_used != 'unknown'
				GROUP BY favorite_model
				ORDER BY session_count DESC, total_tokens DESC, favorite_model ASC
			)
			LIMIT 1
		`,
		query_params: {
			orgId,
			userId,
		},
	});

	return rows[0]?.favorite_model ?? null;
}

async function getUserArchetype(
	orgId: string,
	userId: string,
): Promise<UserArchetypeCandidate | null> {
	// Snapshot read only. The rebuild script publishes into the runs table after
	// the snapshot insert succeeds; gating on that row is what guarantees a
	// partial rebuild can never be served. Filtering by scope + version pins the
	// read to a known classifier, so a future test/staging run cannot silently
	// become "latest". Fail open on any error so a missing migration or broken
	// archetype path cannot 500 the whole wrapped endpoint.
	try {
		const rows = await queryClickhouse<UserArchetypeRow>({
			query: `
				WITH latest_run AS (
					SELECT snapshot_id
					FROM rudel.wrapped_user_archetype_runs_v1
					WHERE scope = {scope:String}
						AND pipeline_version = {pipelineVersion:String}
						AND centroid_version = {centroidVersion:String}
					ORDER BY snapshot_created_at DESC
					LIMIT 1
				),
				current_centroids AS (${buildCentroidUnionAll()}),
				user_snapshot AS (
					SELECT
						s.archetype_key AS key,
						s.snapshot_id AS snapshotId,
						formatDateTime(s.snapshot_created_at, '%Y-%m-%dT%H:%i:%SZ') AS computedAt,
						s.archetype_distance_ratio_to_max AS distanceRatioToMax,
						s.consistency AS consistency,
						s.intensity AS intensity,
						s.session_shape AS session_shape,
						s.cost_intensity AS cost_intensity,
						s.output AS output,
						s.breadth AS breadth,
						s.range AS range
					FROM latest_run AS r
					INNER JOIN rudel.wrapped_user_archetype_snapshots_v1 AS s
						ON s.snapshot_id = r.snapshot_id
					WHERE s.scope = {scope:String}
						AND s.organization_id = {orgId:String}
						AND s.user_id = {userId:String}
					LIMIT 1
				),
				scored_centroids AS (
					SELECT
						c.archetype_id AS archetype_id,
						sqrt(
							pow(u.consistency - c.consistency, 2)
							+ pow(u.intensity - c.intensity, 2)
							+ pow(u.session_shape - c.session_shape, 2)
							+ pow(u.cost_intensity - c.cost_intensity, 2)
							+ pow(u.output - c.output, 2)
							+ pow(u.breadth - c.breadth, 2)
							+ pow(u.range - c.range, 2)
						) AS distance
					FROM user_snapshot AS u
					CROSS JOIN current_centroids AS c
				),
				ranked_centroids AS (
					SELECT
						archetype_id,
						distance,
						row_number() OVER (ORDER BY distance ASC, archetype_id ASC) AS distance_rank
					FROM scored_centroids
				),
				distance_summary AS (
					SELECT
						maxIf(distance, distance_rank = 1) AS closest_distance,
						maxIf(distance, distance_rank = 2) AS second_distance
					FROM ranked_centroids
				)
				SELECT
					u.key AS key,
					u.snapshotId AS snapshotId,
					u.computedAt AS computedAt,
					u.distanceRatioToMax AS distanceRatioToMax,
					if(
						d.second_distance > 0,
						round((d.second_distance - d.closest_distance) / d.second_distance, 6),
						NULL
					) AS topTwoMargin
				FROM user_snapshot AS u
				CROSS JOIN distance_summary AS d
				LIMIT 1
			`,
			query_params: {
				centroidVersion: WRAPPED_ARCHETYPE_CENTROID_VERSION,
				orgId,
				pipelineVersion: WRAPPED_ARCHETYPE_PIPELINE_VERSION,
				scope: WRAPPED_ARCHETYPE_SCOPE,
				userId,
			},
		});

		const row = rows[0];
		if (!row) {
			return null;
		}

		return {
			computedAt: row.computedAt,
			distanceRatioToMax: toNullableNumber(row.distanceRatioToMax),
			key: row.key,
			snapshotId: row.snapshotId,
			topTwoMargin: toNullableNumber(row.topTwoMargin),
		};
	} catch (error) {
		console.warn(
			"[wrapped.service] getUserArchetype failed, returning null",
			error,
		);
		return null;
	}
}

function buildWrappedArchetype(
	candidate: UserArchetypeCandidate | null,
): WrappedV1Archetype | null {
	if (!candidate) {
		return null;
	}

	return {
		computedAt: candidate.computedAt,
		key: candidate.key,
		snapshotId: candidate.snapshotId,
	};
}

function buildCentroidUnionAll(): string {
	return WRAPPED_ARCHETYPE_CENTROIDS.map(
		(centroid) =>
			`SELECT ${centroid.archetype_id} AS archetype_id, '${centroid.archetype_key}' AS archetype_key, '${centroid.archetype_name.replace(/'/g, "''")}' AS archetype_name, ${centroid.consistency} AS consistency, ${centroid.intensity} AS intensity, ${centroid.session_shape} AS session_shape, ${centroid.cost_intensity} AS cost_intensity, ${centroid.output} AS output, ${centroid.breadth} AS breadth, ${centroid.range} AS range`,
	).join(" UNION ALL ");
}

function buildSourceSplit(
	source: WrappedSourceSplit["source"],
	sessionCount: number,
	totalSessions: number,
): WrappedSourceSplit {
	return {
		source,
		session_count: sessionCount,
		session_share_percent:
			totalSessions > 0
				? roundPercent((sessionCount / totalSessions) * 100)
				: 0,
	};
}

function getEmptyWrappedSummaryRow(): WrappedSummaryRow {
	return {
		active_days: 0,
		claude_session_count: 0,
		codex_session_count: 0,
		estimated_spend_usd: 0,
		first_session_at: null,
		last_session_at: null,
		longest_session_min: 0,
		total_sessions: 0,
		total_tokens: 0,
	};
}

function getDaysSinceTimestamp(timestamp: string | null): number {
	if (!timestamp) {
		return 0;
	}

	const firstSessionDate = new Date(timestamp);
	if (Number.isNaN(firstSessionDate.getTime())) {
		return 0;
	}

	const diffMs = Date.now() - firstSessionDate.getTime();
	return Math.max(0, Math.floor(diffMs / 86_400_000));
}

function roundCurrency(value: number | string | null): number {
	return roundTo(toNumber(value), 4);
}

function roundPercent(value: number): number {
	return roundTo(value, 2);
}

function roundTo(value: number, precision: number): number {
	const factor = 10 ** precision;
	return Math.round(value * factor) / factor;
}

function toNumber(value: number | string | null): number {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : 0;
	}

	if (typeof value === "string" && value.trim().length > 0) {
		const parsedValue = Number(value);
		return Number.isFinite(parsedValue) ? parsedValue : 0;
	}

	return 0;
}

function toNullableNumber(value: number | string | null): number | null {
	if (value === null) {
		return null;
	}

	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}

	if (value.trim().length === 0) {
		return null;
	}

	const parsedValue = Number(value);
	return Number.isFinite(parsedValue) ? parsedValue : null;
}
