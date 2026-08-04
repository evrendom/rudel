-- chkit-migration-format: v1
-- generated-at: 2026-08-03T17:00:00.000Z
-- cli-version: 0.1.0-beta.16
-- definition-count: 1
-- operation-count: 1
-- risk-summary: safe=1, caution=0, danger=0

-- Pre-row migration gate: this file changed while usage_events was still
-- unshipped. Any CI or staging environment that applied an earlier revision
-- must DROP TABLE rudel.usage_events and re-run this migration; do not treat
-- CREATE TABLE IF NOT EXISTS as an upgrade path. Production has never applied it.

-- operation: create_table key=table:rudel.usage_events risk=safe
CREATE TABLE IF NOT EXISTS rudel.usage_events
(
  `organization_id` String,
  `user_id` String,
  `source` LowCardinality(String),
  `session_id` String,
  `event_id` FixedString(64),
  `record_kind` LowCardinality(String),
  `event_version` UInt64,
  `event_identity_version` UInt8,
  `extraction_version` UInt16,
  `model_rate_card_version` LowCardinality(String),
  `filter_version` UInt16,
  `content_sha256` FixedString(64),
  `occurred_at` DateTime64(3, 'UTC'),
  `usage_date` Date,
  `has_valid_timestamp` UInt8,
  `raw_model` String,
  `resolved_model` LowCardinality(String),
  `model_status` LowCardinality(String),
  `service_tier` LowCardinality(String),
  `context_input_tokens` UInt64,
  `uncached_input_tokens` UInt64,
  `cache_read_input_tokens` UInt64,
  `cache_write_5m_input_tokens` UInt64,
  `cache_write_1h_input_tokens` UInt64,
  `output_tokens` UInt64,
  `reasoning_output_tokens` UInt64,
  `agent_id` String,
  `lineage_id` String,
  `parent_lineage_id` String,
  `token_source` LowCardinality(String),
  `identity_kind` LowCardinality(String),
  `first_observed_line` UInt32,
  `duplicate_observation_count` UInt32,
  `quality_flags` Array(String) DEFAULT [],
  `is_deleted` UInt8 DEFAULT 0,
  `receipt_is_complete` UInt8 DEFAULT 0,
  `receipt_event_count` UInt32 DEFAULT 0,
  `receipt_checksum` FixedString(64),
  `ingested_at` DateTime64(3, 'UTC'),
  INDEX `usage_date_minmax` (usage_date) TYPE minmax GRANULARITY 1
) ENGINE = ReplacingMergeTree(event_version)
PRIMARY KEY (`organization_id`, `user_id`, `source`, `session_id`, `event_id`)
ORDER BY (`organization_id`, `user_id`, `source`, `session_id`, `event_id`)
SETTINGS index_granularity = 8192, storage_policy = 's3'
COMMENT 'Versioned request-level usage facts and per-generation extraction receipts. Mutable timestamp/model fields are deliberately excluded from the replacing key.';

-- Retention decision: no TTL. Usage events are all-time facts and must not
-- silently inherit the 365-day raw-transcript lifecycle.
