#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import {
	WRAPPED_ARCHETYPE_CENTROID_VERSION,
	WRAPPED_ARCHETYPE_PIPELINE_VERSION,
	WRAPPED_ARCHETYPE_SCOPE,
} from "../src/wrapped-archetype-constants.ts";

interface Centroid {
	archetype_id: number;
	archetype_key: string;
	archetype_name: string;
	consistency: number;
	intensity: number;
	session_shape: number;
	cost_intensity: number;
	output: number;
	breadth: number;
	range: number;
}

// Empirical centroids from .context/archetype-clickhouse-reference.sql:48-56.
// Hardcoded for launch so we can skip the centroids table. The
// centroid_version exported from wrapped-archetype-constants pins which
// version these match. If the centroid set changes, bump
// WRAPPED_ARCHETYPE_CENTROID_VERSION and update this list together.
const CENTROIDS: readonly Centroid[] = [
	{
		archetype_id: 0,
		archetype_key: "roadrunner",
		archetype_name: "Roadrunner",
		consistency: 0.1881,
		intensity: 0.7952,
		session_shape: 0.6714,
		cost_intensity: 0.831,
		output: 0.5905,
		breadth: 0.5667,
		range: 0.8238,
	},
	{
		archetype_id: 1,
		archetype_key: "window_shopper",
		archetype_name: "Cheapskate",
		consistency: 0.2693,
		intensity: 0.1741,
		session_shape: 0.2098,
		cost_intensity: 0.2083,
		output: 0.5804,
		breadth: 0.2163,
		range: 0.7619,
	},
	{
		archetype_id: 2,
		archetype_key: "npc",
		archetype_name: "NPC",
		consistency: 0.62,
		intensity: 0.7758,
		session_shape: 0.8591,
		cost_intensity: 0.248,
		output: 0.4792,
		breadth: 0.5042,
		range: 0.5893,
	},
	{
		archetype_id: 3,
		archetype_key: "papas_credit_card",
		archetype_name: "Papa's Credit Card",
		consistency: 0.3061,
		intensity: 0.1582,
		session_shape: 0.1786,
		cost_intensity: 0.5884,
		output: 0.1582,
		breadth: 0.2118,
		range: 0.267,
	},
	{
		archetype_id: 4,
		archetype_key: "hit_and_runner",
		archetype_name: "Hit and Runner",
		consistency: 0.1086,
		intensity: 0.2351,
		session_shape: 0.1161,
		cost_intensity: 0.2783,
		output: 0.6533,
		breadth: 0.6545,
		range: 0.0595,
	},
	{
		archetype_id: 5,
		archetype_key: "adhd_brain",
		archetype_name: "ADHD Brain",
		consistency: 0.6405,
		intensity: 0.3488,
		session_shape: 0.4452,
		cost_intensity: 0.544,
		output: 0.3155,
		breadth: 0.5015,
		range: 0.7643,
	},
	{
		archetype_id: 6,
		archetype_key: "needs_to_touch_grass",
		archetype_name: "Obsessed",
		consistency: 0.5778,
		intensity: 0.5037,
		session_shape: 0.5375,
		cost_intensity: 0.8013,
		output: 0.6209,
		breadth: 0.2244,
		range: 0.2802,
	},
	{
		archetype_id: 7,
		archetype_key: "tourist",
		archetype_name: "Tourist",
		consistency: 0.2636,
		intensity: 0.3724,
		session_shape: 0.3571,
		cost_intensity: 0.216,
		output: 0.0238,
		breadth: 0.5833,
		range: 0.0,
	},
	{
		archetype_id: 8,
		archetype_key: "maniac",
		archetype_name: "Maniac",
		consistency: 0.8683,
		intensity: 0.7921,
		session_shape: 0.7341,
		cost_intensity: 0.6659,
		output: 0.4103,
		breadth: 0.7889,
		range: 0.5698,
	},
];

// Approximate per-token cost for percent_rank normalization. Centroid
// classification depends only on the relative ranking of users by cost, so an
// average Sonnet-grade pricing is good enough for the launch rebuild. If you
// need dollar-precise spend in the snapshot, swap this for the
// `buildEstimatedCostSql` helper in @rudel/api-routes.
const PER_SESSION_COST_SQL = `(
  ifNull(input_tokens, 0) / 1000000.0 * 3.0
  + ifNull(output_tokens, 0) / 1000000.0 * 15.0
  + ifNull(cache_read_input_tokens, 0) / 1000000.0 * 0.3
  + ifNull(cache_creation_input_tokens, 0) / 1000000.0 * 3.75
)`;

function getEnv(name: string): string {
	const value = process.env[name];
	if (!value || value.trim() === "") {
		throw new Error(`${name} is required`);
	}
	return value;
}

function buildClickhouseUrl(base: string, params: Record<string, string>) {
	const url = new URL(base);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	return url.toString();
}

async function runClickhouseStatement(
	url: string,
	username: string,
	password: string,
	database: string,
	query: string,
): Promise<string> {
	const fullUrl = buildClickhouseUrl(url, {
		database,
		default_format: "JSONCompact",
	});
	const response = await fetch(fullUrl, {
		method: "POST",
		headers: {
			"X-ClickHouse-User": username,
			"X-ClickHouse-Key": password,
			"Content-Type": "text/plain",
		},
		body: query,
	});
	const text = await response.text();
	if (!response.ok) {
		throw new Error(
			`ClickHouse statement failed (${response.status}): ${text}\nQuery: ${query.slice(0, 500)}`,
		);
	}
	return text;
}

function buildCentroidUnionAll(): string {
	return CENTROIDS.map(
		(c) =>
			`SELECT ${c.archetype_id} AS archetype_id, '${c.archetype_key}' AS archetype_key, '${c.archetype_name.replace(/'/g, "''")}' AS archetype_name, ${c.consistency} AS consistency, ${c.intensity} AS intensity, ${c.session_shape} AS session_shape, ${c.cost_intensity} AS cost_intensity, ${c.output} AS output, ${c.breadth} AS breadth, ${c.range} AS range`,
	).join(" UNION ALL ");
}

function buildSnapshotInsertSql(params: {
	snapshotId: string;
	snapshotCreatedAt: string;
}): string {
	const centroidUnion = buildCentroidUnionAll();
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
  toDateTime64('${params.snapshotCreatedAt}', 3, 'UTC') AS snapshot_created_at,
  '${params.snapshotId}' AS snapshot_id,
  '${WRAPPED_ARCHETYPE_PIPELINE_VERSION}' AS pipeline_version,
  '${WRAPPED_ARCHETYPE_CENTROID_VERSION}' AS centroid_version_const,
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
  '${WRAPPED_ARCHETYPE_SCOPE}' AS scope,
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

function buildRunInsertSql(params: {
	snapshotId: string;
	snapshotCreatedAt: string;
}): string {
	return `
INSERT INTO rudel.wrapped_user_archetype_runs_v1
(
  snapshot_id, snapshot_created_at, pipeline_version, centroid_version, scope,
  user_scope_count, trigger_reason, trigger_source, trigger_session_id
)
SETTINGS async_insert=0
SELECT
  '${params.snapshotId}' AS snapshot_id,
  toDateTime64('${params.snapshotCreatedAt}', 3, 'UTC') AS snapshot_created_at,
  '${WRAPPED_ARCHETYPE_PIPELINE_VERSION}' AS pipeline_version,
  '${WRAPPED_ARCHETYPE_CENTROID_VERSION}' AS centroid_version,
  '${WRAPPED_ARCHETYPE_SCOPE}' AS scope,
  toUInt32(count()) AS user_scope_count,
  'manual_rebuild' AS trigger_reason,
  NULL AS trigger_source,
  NULL AS trigger_session_id
FROM rudel.wrapped_user_archetype_snapshots_v1
WHERE snapshot_id = '${params.snapshotId}'
`;
}

async function main() {
	const url = getEnv("CLICKHOUSE_URL");
	const username = process.env.CLICKHOUSE_USERNAME ?? "default";
	const password = process.env.CLICKHOUSE_PASSWORD ?? "";
	const database = process.env.CLICKHOUSE_DB ?? "rudel";
	const snapshotId = randomUUID();
	const snapshotCreatedAt = new Date()
		.toISOString()
		.replace("T", " ")
		.replace("Z", "");

	console.log(
		`[rebuild] starting; snapshot_id=${snapshotId} pipeline_version=${WRAPPED_ARCHETYPE_PIPELINE_VERSION} centroid_version=${WRAPPED_ARCHETYPE_CENTROID_VERSION}`,
	);

	const snapshotSql = buildSnapshotInsertSql({ snapshotId, snapshotCreatedAt });
	console.log(`[rebuild] inserting snapshot rows...`);
	await runClickhouseStatement(url, username, password, database, snapshotSql);
	console.log(`[rebuild] snapshot insert succeeded`);

	const runSql = buildRunInsertSql({ snapshotId, snapshotCreatedAt });
	console.log(`[rebuild] publishing run row...`);
	await runClickhouseStatement(url, username, password, database, runSql);
	console.log(`[rebuild] run row published; snapshot_id=${snapshotId}`);
}

main().catch((error) => {
	console.error("[rebuild] failed:", error);
	process.exit(1);
});
