-- chkit-migration-format: v1
-- generated-at: 2026-04-25T18:15:26.155Z
-- cli-version: 0.1.0-beta.16
-- definition-count: 7
-- operation-count: 3
-- rename-suggestion-count: 0
-- risk-summary: safe=3, caution=0, danger=0

-- operation: create_database key=database:rudel risk=safe
CREATE DATABASE IF NOT EXISTS rudel;

-- operation: create_table key=table:rudel.wrapped_user_archetype_runs_v1 risk=safe
CREATE TABLE IF NOT EXISTS rudel.wrapped_user_archetype_runs_v1
(
  `snapshot_id` String,
  `snapshot_created_at` DateTime64(3, 'UTC'),
  `pipeline_version` LowCardinality(String),
  `centroid_version` LowCardinality(String),
  `scope` LowCardinality(String),
  `user_scope_count` UInt32,
  `trigger_reason` LowCardinality(String),
  `trigger_source` Nullable(LowCardinality(String)),
  `trigger_session_id` Nullable(String)
) ENGINE = MergeTree()
PRIMARY KEY ()
ORDER BY (`snapshot_created_at`, `snapshot_id`);

-- operation: create_table key=table:rudel.wrapped_user_archetype_snapshots_v1 risk=safe
CREATE TABLE IF NOT EXISTS rudel.wrapped_user_archetype_snapshots_v1
(
  `snapshot_id` String,
  `snapshot_created_at` DateTime64(3, 'UTC'),
  `pipeline_version` LowCardinality(String),
  `centroid_version` LowCardinality(String),
  `scope` LowCardinality(String),
  `organization_id` String,
  `user_id` String,
  `first_session_at` DateTime64(3, 'UTC'),
  `last_session_at` DateTime64(3, 'UTC'),
  `days_since_first_session` UInt32,
  `total_sessions` UInt32,
  `active_days` UInt32,
  `claude_session_count` UInt32,
  `codex_session_count` UInt32,
  `total_tokens` UInt64,
  `estimated_spend_usd` Float64,
  `mean_session_min` Float64,
  `longest_session_min` UInt32,
  `commit_sessions` UInt32,
  `distinct_repos` Nullable(UInt32),
  `breadth_available` UInt8,
  `range_entropy` Float64,
  `consistency_raw` Float64,
  `intensity_raw` Float64,
  `session_shape_raw` Float64,
  `cost_intensity_raw` Float64,
  `output_raw` Float64,
  `breadth_raw` Nullable(Float64),
  `range_raw` Float64,
  `consistency` Float64,
  `intensity` Float64,
  `session_shape` Float64,
  `cost_intensity` Float64,
  `output` Float64,
  `breadth` Nullable(Float64),
  `range` Float64,
  `archetype_id` UInt8,
  `archetype_key` LowCardinality(String),
  `archetype_name` String,
  `archetype_distance` Float64,
  `archetype_distance_ratio_to_max` Float64
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(toDate(snapshot_created_at))
PRIMARY KEY ()
ORDER BY (`snapshot_id`, `organization_id`, `user_id`);
