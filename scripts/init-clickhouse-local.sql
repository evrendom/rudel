-- Local ClickHouse schema for development
-- Derived from packages/ch-schema/chx/migrations/20260220190421_auto.sql
-- Uses ReplacingMergeTree (local) instead of SharedReplacingMergeTree (cloud)

CREATE DATABASE IF NOT EXISTS rudel;

CREATE TABLE IF NOT EXISTS rudel.claude_sessions
(
  `session_date` DateTime64(3, 'UTC') DEFAULT now64(3),
  `last_interaction_date` DateTime64(3, 'UTC') DEFAULT now64(3),
  `session_id` String,
  `organization_id` String,
  `project_path` String,
  `repository` Nullable(String),
  `content` String,
  `subagents` Map(String, String) DEFAULT map(),
  `skills` Array(String) DEFAULT [],
  `slash_commands` Array(String) DEFAULT [],
  `subagent_types` Array(String) DEFAULT [],
  `ingested_at` DateTime64(3, 'UTC') DEFAULT now64(3),
  `user_id` String,
  `git_branch` Nullable(String),
  `git_sha` Nullable(String),
  `input_tokens` UInt64 DEFAULT 0,
  `output_tokens` UInt64 DEFAULT 0,
  `cache_read_input_tokens` UInt64 DEFAULT 0,
  `cache_creation_input_tokens` UInt64 DEFAULT 0,
  `total_tokens` UInt64 DEFAULT 0,
  `tag` Nullable(String)
) ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(toDate(session_date))
ORDER BY (`organization_id`, `session_date`, `session_id`)
TTL toDate(session_date) + toIntervalDay(365)
SETTINGS index_granularity = 8192;

CREATE TABLE IF NOT EXISTS rudel.session_analytics
(
  `session_date` DateTime64(3, 'UTC') DEFAULT now64(3),
  `last_interaction_date` DateTime64(3, 'UTC') DEFAULT now64(3),
  `session_id` String,
  `organization_id` String,
  `project_path` String,
  `repository` Nullable(String),
  `content` String,
  `subagents` Map(String, String) DEFAULT map(),
  `skills` Array(String) DEFAULT [],
  `slash_commands` Array(String) DEFAULT [],
  `subagent_types` Array(String) DEFAULT [],
  `ingested_at` DateTime64(3, 'UTC') DEFAULT now64(3),
  `user_id` String,
  `git_branch` Nullable(String),
  `git_sha` Nullable(String),
  `input_tokens` UInt64 DEFAULT 0,
  `output_tokens` UInt64 DEFAULT 0,
  `cache_read_input_tokens` UInt64 DEFAULT 0,
  `cache_creation_input_tokens` UInt64 DEFAULT 0,
  `total_tokens` UInt64 DEFAULT 0,
  `tag` Nullable(String),
  `total_interactions` UInt32 DEFAULT 0,
  `actual_duration_min` UInt32 DEFAULT 0,
  `avg_period_sec` Float64 DEFAULT 0,
  `median_period_sec` Float64 DEFAULT 0,
  `quick_responses` UInt32 DEFAULT 0,
  `normal_responses` UInt32 DEFAULT 0,
  `long_pauses` UInt32 DEFAULT 0,
  `error_count` UInt32 DEFAULT 0,
  `model_used` String DEFAULT '',
  `has_commit` UInt8 DEFAULT 0,
  `session_archetype` String DEFAULT 'standard',
  `success_score` UInt8 DEFAULT 0,
  `used_plan_mode` UInt8 DEFAULT 0,
  `inference_duration_sec` UInt32 DEFAULT 0,
  `human_duration_sec` UInt32 DEFAULT 0,
  INDEX `idx_model_used` (model_used) TYPE set(0) GRANULARITY 4,
  INDEX `idx_project_path` (project_path) TYPE set(0) GRANULARITY 4,
  INDEX `idx_repository` (repository) TYPE set(0) GRANULARITY 4,
  INDEX `idx_user_id` (user_id) TYPE set(0) GRANULARITY 4
) ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(toDate(session_date))
ORDER BY (`organization_id`, `session_date`, `session_id`)
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS rudel.session_analytics_mv TO rudel.session_analytics AS
SELECT * EXCEPT (_dedupe_rank)
FROM (
WITH
  arrayFilter(x -> JSONExtractString(x, 'type') IN ('user', 'assistant'), splitByChar('\n', cs.content)) AS _interaction_lines,
  arrayFilter(x -> JSONHas(x, 'timestamp'), _interaction_lines) AS _ts_lines,
  arrayMap(x -> parseDateTime64BestEffort(JSONExtractString(x, 'timestamp')), _ts_lines) AS _timestamps,
  arrayMap(x -> JSONExtractString(x, 'type'), _ts_lines) AS _msg_types,
  if(length(_timestamps) > 1, arrayMap(i -> dateDiff('second', _timestamps[i], _timestamps[i+1]), range(1, length(_timestamps))), []) AS _prompt_periods_sec,
  if(length(_timestamps) > 1, arrayMap(i -> if(_msg_types[i] = 'user' AND _msg_types[i+1] = 'assistant', dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))), []) AS _inference_gaps,
  if(length(_timestamps) > 1, arrayMap(i -> if(_msg_types[i] = 'assistant' AND _msg_types[i+1] = 'user', dateDiff('second', _timestamps[i], _timestamps[i+1]), 0), range(1, length(_timestamps))), []) AS _human_gaps
SELECT *,
  toUInt32(length(_timestamps)) as total_interactions,
  toUInt32(dateDiff('minute', arrayMin(_timestamps), arrayMax(_timestamps))) as actual_duration_min,
  if(length(_prompt_periods_sec) > 0, round(arrayAvg(_prompt_periods_sec), 2), 0) as avg_period_sec,
  if(length(_prompt_periods_sec) > 0, toFloat64(arrayElement(arraySort(_prompt_periods_sec), toUInt64(ceil(length(_prompt_periods_sec) / 2)))), 0) as median_period_sec,
  toUInt32(arrayCount(x -> x < 5, _prompt_periods_sec)) as quick_responses,
  toUInt32(arrayCount(x -> x >= 5 AND x <= 60, _prompt_periods_sec)) as normal_responses,
  toUInt32(arrayCount(x -> x > 300, _prompt_periods_sec)) as long_pauses,
  toUInt32(length(extractAll(cs.content, '"isApiErrorMessage":true')) + length(extractAll(cs.content, '"is_error":true'))) as error_count,
  JSONExtractString(JSONExtractRaw(arrayElement(arrayFilter(x -> JSONExtractString(x, 'type') = 'assistant', splitByChar('\n', cs.content)), -1), 'message'), 'model') as model_used,
  toUInt8(if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 1, 0)) as has_commit,
  toUInt8(if(position(cs.content, '"name":"EnterPlanMode"') > 0, 1, 0)) as used_plan_mode,
  toUInt32(arraySum(_inference_gaps)) as inference_duration_sec,
  toUInt32(arraySum(_human_gaps)) as human_duration_sec,
  CASE
    WHEN dateDiff('minute', cs.session_date, cs.last_interaction_date) <= 10 AND cs.total_tokens < 500000 AND cs.output_tokens > 1000 THEN 'quick_win'
    WHEN dateDiff('minute', cs.session_date, cs.last_interaction_date) > 30 AND cs.output_tokens > 50000 AND cs.git_sha IS NOT NULL AND cs.git_sha != '' THEN 'deep_work'
    WHEN cs.total_tokens > 1000000 AND (cs.output_tokens / nullif(cs.input_tokens, 0)) < 0.3 AND dateDiff('minute', cs.session_date, cs.last_interaction_date) > 20 THEN 'struggle'
    WHEN length(cs.skills) >= 3 AND (cs.git_sha IS NULL OR cs.git_sha = '') AND cs.total_tokens > 200000 THEN 'exploration'
    WHEN dateDiff('minute', cs.session_date, cs.last_interaction_date) < 3 AND cs.output_tokens < 500 THEN 'abandoned'
    ELSE 'standard'
  END as session_archetype,
  toUInt8(round(
    50
    + (if(cs.git_sha IS NOT NULL AND cs.git_sha != '', 20, 0))
    + (if((cs.output_tokens / nullif(cs.input_tokens, 0)) > 0.5, 15, 0))
    + (least(toUInt32(length(cs.skills)), 3) * 5)
    - (if(cs.total_tokens > 1500000 AND (cs.git_sha IS NULL OR cs.git_sha = ''), 20, 0))
    - (if(dateDiff('minute', cs.session_date, cs.last_interaction_date) < 2 AND cs.output_tokens < 200, 30, 0))
    - (least(toUInt32(length(extractAll(cs.content, '"isApiErrorMessage":true')) + length(extractAll(cs.content, '"is_error":true'))), 10) * 2)
  )) as success_score,
  ROW_NUMBER() OVER (PARTITION BY cs.session_id ORDER BY cs.ingested_at DESC) AS _dedupe_rank
FROM rudel.claude_sessions AS cs
WHERE length(_timestamps) > 0
)
WHERE _dedupe_rank = 1;
