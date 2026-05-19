-- chkit-migration-format: v1
-- generated-at: 2026-05-18T23:30:52.190Z
-- cli-version: 0.1.0-beta.16
-- definition-count: 7
-- operation-count: 6
-- rename-suggestion-count: 0
-- risk-summary: safe=3, caution=0, danger=3

-- operation: drop_table key=table:rudel.claude_sessions risk=danger
DROP TABLE IF EXISTS rudel.claude_sessions;

-- operation: drop_table key=table:rudel.codex_sessions risk=danger
DROP TABLE IF EXISTS rudel.codex_sessions;

-- operation: drop_table key=table:rudel.session_analytics risk=danger
DROP TABLE IF EXISTS rudel.session_analytics;

-- operation: create_table key=table:rudel.claude_sessions risk=safe
CREATE TABLE IF NOT EXISTS rudel.claude_sessions
(
  `session_date` DateTime64(3, 'UTC') DEFAULT now64(3),
  `last_interaction_date` DateTime64(3, 'UTC') DEFAULT now64(3),
  `session_id` String,
  `organization_id` String,
  `project_path` String,
  `git_remote` String DEFAULT '''''',
  `package_name` String DEFAULT '''''',
  `package_type` String DEFAULT '''''',
  `content` String,
  `ingested_at` DateTime64(3, 'UTC') DEFAULT now64(3),
  `user_id` String,
  `git_branch` Nullable(String),
  `git_sha` Nullable(String),
  `tag` Nullable(String),
  `subagents` Map(String, String) DEFAULT map()
) ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(toDate(session_date))
PRIMARY KEY (`organization_id`, `session_date`, `session_id`)
ORDER BY (`organization_id`, `session_date`, `session_id`)
TTL toDate(session_date) + toIntervalDay(365)
SETTINGS index_granularity = 8192, storage_policy = 's3';

-- operation: create_table key=table:rudel.codex_sessions risk=safe
CREATE TABLE IF NOT EXISTS rudel.codex_sessions
(
  `session_date` DateTime64(3, 'UTC') DEFAULT now64(3),
  `last_interaction_date` DateTime64(3, 'UTC') DEFAULT now64(3),
  `session_id` String,
  `organization_id` String,
  `project_path` String,
  `git_remote` String DEFAULT '''''',
  `package_name` String DEFAULT '''''',
  `package_type` String DEFAULT '''''',
  `content` String,
  `ingested_at` DateTime64(3, 'UTC') DEFAULT now64(3),
  `user_id` String,
  `git_branch` Nullable(String),
  `git_sha` Nullable(String),
  `tag` Nullable(String)
) ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(toDate(session_date))
PRIMARY KEY (`organization_id`, `session_date`, `session_id`)
ORDER BY (`organization_id`, `session_date`, `session_id`)
TTL toDate(session_date) + toIntervalDay(365)
SETTINGS index_granularity = 8192, storage_policy = 's3';

-- operation: create_table key=table:rudel.session_analytics risk=safe
CREATE TABLE IF NOT EXISTS rudel.session_analytics
(
  `session_date` DateTime64(3, 'UTC') DEFAULT now64(3),
  `last_interaction_date` DateTime64(3, 'UTC') DEFAULT now64(3),
  `session_id` String,
  `organization_id` String,
  `project_path` String,
  `git_remote` String DEFAULT '''''',
  `package_name` String DEFAULT '''''',
  `package_type` String DEFAULT '''''',
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
  `source` LowCardinality(String) DEFAULT '''claude_code''',
  `total_interactions` UInt32 DEFAULT 0,
  `actual_duration_min` UInt32 DEFAULT 0,
  `avg_period_sec` Float64 DEFAULT 0,
  `median_period_sec` Float64 DEFAULT 0,
  `quick_responses` UInt32 DEFAULT 0,
  `normal_responses` UInt32 DEFAULT 0,
  `long_pauses` UInt32 DEFAULT 0,
  `error_count` UInt32 DEFAULT 0,
  `model_used` String DEFAULT '''''',
  `has_commit` UInt8 DEFAULT 0,
  `session_archetype` String DEFAULT '''standard''',
  `success_score` UInt8 DEFAULT 0,
  `used_plan_mode` UInt8 DEFAULT 0,
  `inference_duration_sec` UInt32 DEFAULT 0,
  `human_duration_sec` UInt32 DEFAULT 0,
  INDEX `idx_git_remote` (git_remote) TYPE set(0) GRANULARITY 4,
  INDEX `idx_model_used` (model_used) TYPE set(0) GRANULARITY 4,
  INDEX `idx_project_path` (project_path) TYPE set(0) GRANULARITY 4,
  INDEX `idx_source` (source) TYPE set(0) GRANULARITY 4,
  INDEX `idx_user_id` (user_id) TYPE set(0) GRANULARITY 4
) ENGINE = ReplacingMergeTree(ingested_at)
PARTITION BY toYYYYMM(toDate(session_date))
PRIMARY KEY (`organization_id`, `session_date`, `session_id`)
ORDER BY (`organization_id`, `session_date`, `session_id`)
SETTINGS index_granularity = 8192;
