import { WRAPPED_ARCHETYPE_CENTROIDS } from "./wrapped-archetype-centroids.js";
import {
	WRAPPED_ARCHETYPE_CENTROID_VERSION,
	WRAPPED_ARCHETYPE_PIPELINE_VERSION,
	WRAPPED_ARCHETYPE_SCOPE,
} from "./wrapped-archetype-constants.js";

export type WrappedArchetypeRebuildTriggerReason =
	| "manual_rebuild"
	| "wrapped_processing_gate";

export interface WrappedArchetypeSnapshotInsertSqlInput {
	snapshotCreatedAt: string;
	snapshotId: string;
}

export interface WrappedArchetypeRunInsertSqlInput
	extends WrappedArchetypeSnapshotInsertSqlInput {
	triggerReason: WrappedArchetypeRebuildTriggerReason;
	triggerSessionId: string | null;
	triggerSource: string | null;
}

// Approximate per-token cost for percent_rank normalization. Centroid
// classification depends only on the relative ranking of users by cost, so an
// average Sonnet-grade pricing is good enough for the launch rebuild.
const PER_SESSION_COST_SQL = `(
  (ifNull(input_tokens, 0) - ifNull(cache_read_input_tokens, 0) - ifNull(cache_creation_input_tokens, 0)) / 1000000.0 * 3.0
  + ifNull(output_tokens, 0) / 1000000.0 * 15.0
  + ifNull(cache_read_input_tokens, 0) / 1000000.0 * 0.3
  + ifNull(cache_creation_input_tokens, 0) / 1000000.0 * 3.75
)`;

export function buildWrappedArchetypeCentroidUnionAll(): string {
	return WRAPPED_ARCHETYPE_CENTROIDS.map(
		(centroid) =>
			`SELECT ${centroid.archetype_id} AS archetype_id, ${sqlStringLiteral(centroid.archetype_key)} AS archetype_key, ${sqlStringLiteral(centroid.archetype_name)} AS archetype_name, ${centroid.consistency} AS consistency, ${centroid.intensity} AS intensity, ${centroid.session_shape} AS session_shape, ${centroid.cost_intensity} AS cost_intensity, ${centroid.output} AS output, ${centroid.breadth} AS breadth, ${centroid.range} AS range`,
	).join(" UNION ALL ");
}

export function buildWrappedArchetypeSnapshotInsertSql(
	params: WrappedArchetypeSnapshotInsertSqlInput,
): string {
	const centroidUnion = buildWrappedArchetypeCentroidUnionAll();
	return `
INSERT INTO rudel.wrapped_user_archetype_snapshots_v1
(
  snapshot_id, snapshot_created_at, pipeline_version, centroid_version, scope,
  organization_id, user_id, first_session_at, last_session_at,
  days_since_first_session, total_sessions, active_days,
  claude_session_count, codex_session_count, total_tokens,
  estimated_spend_usd, mean_session_min, longest_session_min, commit_sessions,
  distinct_repos, breadth_available, range_entropy,
  consistency_raw, intensity_raw, session_shape_raw, cost_intensity_raw,
  output_raw, breadth_raw, range_raw,
  consistency, intensity, session_shape, cost_intensity, output, breadth, range,
  archetype_id, archetype_key, archetype_name,
  archetype_distance, archetype_distance_ratio_to_max
)
SETTINGS async_insert=0
WITH
  toDateTime64(${sqlStringLiteral(params.snapshotCreatedAt)}, 3, 'UTC') AS snapshot_created_at,
  ${sqlStringLiteral(params.snapshotId)} AS snapshot_id,
  ${sqlStringLiteral(WRAPPED_ARCHETYPE_PIPELINE_VERSION)} AS pipeline_version,
  ${sqlStringLiteral(WRAPPED_ARCHETYPE_CENTROID_VERSION)} AS centroid_version_const,
  current_centroids AS (${centroidUnion}),
  canonical_sessions AS (
    SELECT
      source,
      organization_id,
      user_id,
      session_id,
      argMax(session_date, ingested_at) AS session_date,
      argMax(actual_duration_min, ingested_at) AS actual_duration_min,
      argMax(ifNull(input_tokens, 0), ingested_at) AS input_tokens,
      argMax(ifNull(output_tokens, 0), ingested_at) AS output_tokens,
      argMax(ifNull(cache_read_input_tokens, 0), ingested_at) AS cache_read_input_tokens,
      argMax(ifNull(cache_creation_input_tokens, 0), ingested_at) AS cache_creation_input_tokens,
      argMax(ifNull(total_tokens, 0), ingested_at) AS total_tokens,
      argMax(model_used, ingested_at) AS model_used,
      argMax(has_commit, ingested_at) AS has_commit,
      argMax(git_remote, ingested_at) AS git_remote,
      argMax(package_name, ingested_at) AS package_name
    FROM rudel.session_analytics
    GROUP BY source, organization_id, user_id, session_id
  ),
  session_enriched AS (
    SELECT
      source, organization_id, user_id, session_id, session_date,
      actual_duration_min, input_tokens, output_tokens,
      cache_read_input_tokens, cache_creation_input_tokens, total_tokens,
      model_used, has_commit,
      if(git_remote != '', git_remote, nullIf(package_name, '')) AS repo_key,
      ${PER_SESSION_COST_SQL} AS estimated_session_cost
    FROM canonical_sessions
  ),
  model_counts AS (
    SELECT organization_id, user_id, model_used, count() AS model_sessions
    FROM session_enriched
    WHERE model_used != '' AND model_used != 'unknown'
    GROUP BY organization_id, user_id, model_used
  ),
  model_totals AS (
    SELECT organization_id, user_id, sum(model_sessions) AS total_model_sessions
    FROM model_counts
    GROUP BY organization_id, user_id
  ),
  model_entropy AS (
    SELECT mc.organization_id, mc.user_id,
      -sum(
        (toFloat64(mc.model_sessions) / mt.total_model_sessions)
        * log2(toFloat64(mc.model_sessions) / mt.total_model_sessions)
      ) AS range_raw
    FROM model_counts AS mc
    INNER JOIN model_totals AS mt
      ON mc.organization_id = mt.organization_id AND mc.user_id = mt.user_id
    GROUP BY mc.organization_id, mc.user_id
  ),
  raw_features AS (
    SELECT
      se.organization_id, se.user_id,
      min(se.session_date) AS first_session_at,
      max(se.session_date) AS last_session_at,
      greatest(dateDiff('day', toDate(min(se.session_date)), toDate(snapshot_created_at)) + 1, 1) AS days_since_first_session,
      count() AS total_sessions,
      uniqExact(toDate(se.session_date)) AS active_days,
      countIf(se.source = 'claude_code') AS claude_session_count,
      countIf(se.source = 'codex') AS codex_session_count,
      sum(se.total_tokens) AS total_tokens,
      sum(se.estimated_session_cost) AS estimated_spend_usd,
      avg(se.actual_duration_min) AS mean_session_min,
      max(se.actual_duration_min) AS longest_session_min,
      sum(se.has_commit) AS commit_sessions,
      uniqExactIf(se.repo_key, se.repo_key IS NOT NULL) AS distinct_repos,
      if(
        greatest(dateDiff('day', toDate(min(se.session_date)), toDate(snapshot_created_at)) + 1, 1) > 0,
        toFloat64(uniqExact(toDate(se.session_date)))
          / greatest(dateDiff('day', toDate(min(se.session_date)), toDate(snapshot_created_at)) + 1, 1),
        0.0
      ) AS consistency_raw,
      if(uniqExact(toDate(se.session_date)) > 0, toFloat64(count()) / uniqExact(toDate(se.session_date)), 0.0) AS intensity_raw,
      if(avg(se.actual_duration_min) > 0, toFloat64(max(se.actual_duration_min)) / avg(se.actual_duration_min), 0.0) AS session_shape_raw,
      if(count() > 0, sum(se.estimated_session_cost) / count(), 0.0) AS cost_intensity_raw,
      if(count() > 0, toFloat64(sum(se.has_commit)) / count(), 0.0) AS output_raw,
      if(
        uniqExactIf(se.repo_key, se.repo_key IS NOT NULL) > 0
        AND uniqExact(toDate(se.session_date)) > 0,
        toFloat64(uniqExactIf(se.repo_key, se.repo_key IS NOT NULL))
          / sqrt(toFloat64(uniqExact(toDate(se.session_date)))),
        NULL
      ) AS breadth_raw
    FROM session_enriched AS se
    GROUP BY se.organization_id, se.user_id
  ),
  raw_features_with_range AS (
    SELECT rf.*, ifNull(me.range_raw, 0.0) AS range_raw
    FROM raw_features AS rf
    LEFT JOIN model_entropy AS me
      ON rf.organization_id = me.organization_id AND rf.user_id = me.user_id
  ),
  breadth_norms AS (
    SELECT organization_id, user_id,
      if(count() OVER () = 1, 0.0, percent_rank() OVER (ORDER BY breadth_raw)) AS breadth
    FROM raw_features_with_range
    WHERE breadth_raw IS NOT NULL
  ),
  normalized AS (
    SELECT rfwr.*,
      if(count() OVER () = 1, 0.0, percent_rank() OVER (ORDER BY consistency_raw)) AS consistency,
      if(count() OVER () = 1, 0.0, percent_rank() OVER (ORDER BY intensity_raw)) AS intensity,
      if(count() OVER () = 1, 0.0, percent_rank() OVER (ORDER BY session_shape_raw)) AS session_shape,
      if(count() OVER () = 1, 0.0, percent_rank() OVER (ORDER BY cost_intensity_raw)) AS cost_intensity,
      if(count() OVER () = 1, 0.0, percent_rank() OVER (ORDER BY output_raw)) AS output,
      bn.breadth AS breadth,
      if(count() OVER () = 1, 0.0, percent_rank() OVER (ORDER BY range_raw)) AS range
    FROM raw_features_with_range AS rfwr
    LEFT JOIN breadth_norms AS bn
      ON rfwr.organization_id = bn.organization_id AND rfwr.user_id = bn.user_id
  ),
  scored AS (
    SELECT n.*, c.archetype_id, c.archetype_key, c.archetype_name,
      if(n.breadth IS NULL, 6, 7) AS used_dimensions,
      sqrt(
        pow(n.consistency - c.consistency, 2)
        + pow(n.intensity - c.intensity, 2)
        + pow(n.session_shape - c.session_shape, 2)
        + pow(n.cost_intensity - c.cost_intensity, 2)
        + pow(n.output - c.output, 2)
        + if(n.breadth IS NULL, 0.0, pow(n.breadth - c.breadth, 2))
        + pow(n.range - c.range, 2)
      ) AS archetype_distance
    FROM normalized AS n
    CROSS JOIN current_centroids AS c
  ),
  ranked AS (
    SELECT *,
      row_number() OVER (
        PARTITION BY organization_id, user_id
        ORDER BY archetype_distance ASC, archetype_id ASC
      ) AS archetype_rank
    FROM scored
  )
SELECT
  snapshot_id,
  snapshot_created_at,
  pipeline_version,
  centroid_version_const AS centroid_version,
  ${sqlStringLiteral(WRAPPED_ARCHETYPE_SCOPE)} AS scope,
  organization_id,
  user_id,
  first_session_at,
  last_session_at,
  toUInt32(days_since_first_session) AS days_since_first_session,
  toUInt32(total_sessions) AS total_sessions,
  toUInt32(active_days) AS active_days,
  toUInt32(claude_session_count) AS claude_session_count,
  toUInt32(codex_session_count) AS codex_session_count,
  toUInt64(total_tokens) AS total_tokens,
  round(estimated_spend_usd, 6) AS estimated_spend_usd,
  round(mean_session_min, 6) AS mean_session_min,
  toUInt32(longest_session_min) AS longest_session_min,
  toUInt32(commit_sessions) AS commit_sessions,
  if(breadth_raw IS NULL, NULL, toUInt32(distinct_repos)) AS distinct_repos,
  toUInt8(if(breadth_raw IS NULL, 0, 1)) AS breadth_available,
  round(range_raw, 6) AS range_entropy,
  round(consistency_raw, 6) AS consistency_raw,
  round(intensity_raw, 6) AS intensity_raw,
  round(session_shape_raw, 6) AS session_shape_raw,
  round(cost_intensity_raw, 6) AS cost_intensity_raw,
  round(output_raw, 6) AS output_raw,
  if(breadth_raw IS NULL, NULL, round(breadth_raw, 6)) AS breadth_raw,
  round(range_raw, 6) AS range_raw,
  round(consistency, 6) AS consistency,
  round(intensity, 6) AS intensity,
  round(session_shape, 6) AS session_shape,
  round(cost_intensity, 6) AS cost_intensity,
  round(output, 6) AS output,
  if(breadth IS NULL, NULL, round(breadth, 6)) AS breadth,
  round(range, 6) AS range,
  archetype_id,
  archetype_key,
  archetype_name,
  round(archetype_distance, 6) AS archetype_distance,
  round(archetype_distance / sqrt(toFloat64(used_dimensions)), 6) AS archetype_distance_ratio_to_max
FROM ranked
WHERE archetype_rank = 1
`;
}

export function buildWrappedArchetypeRunInsertSql(
	params: WrappedArchetypeRunInsertSqlInput,
): string {
	return `
INSERT INTO rudel.wrapped_user_archetype_runs_v1
(
  snapshot_id, snapshot_created_at, pipeline_version, centroid_version, scope,
  user_scope_count, trigger_reason, trigger_source, trigger_session_id
)
SETTINGS async_insert=0
SELECT
  ${sqlStringLiteral(params.snapshotId)} AS snapshot_id,
  toDateTime64(${sqlStringLiteral(params.snapshotCreatedAt)}, 3, 'UTC') AS snapshot_created_at,
  ${sqlStringLiteral(WRAPPED_ARCHETYPE_PIPELINE_VERSION)} AS pipeline_version,
  ${sqlStringLiteral(WRAPPED_ARCHETYPE_CENTROID_VERSION)} AS centroid_version,
  ${sqlStringLiteral(WRAPPED_ARCHETYPE_SCOPE)} AS scope,
  toUInt32(count()) AS user_scope_count,
  ${sqlStringLiteral(params.triggerReason)} AS trigger_reason,
  ${sqlNullableStringLiteral(params.triggerSource)} AS trigger_source,
  ${sqlNullableStringLiteral(params.triggerSessionId)} AS trigger_session_id
FROM rudel.wrapped_user_archetype_snapshots_v1
WHERE snapshot_id = ${sqlStringLiteral(params.snapshotId)}
`;
}

function sqlNullableStringLiteral(value: string | null): string {
	return value === null
		? "CAST(NULL, 'Nullable(String)')"
		: sqlStringLiteral(value);
}

function sqlStringLiteral(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}
