-- chkit-migration-format: v1
-- generated-at: 2026-08-19T17:15:09.271Z
-- cli-version: 0.1.0-beta.16
-- definition-count: 1
-- operation-count: 1
-- rename-suggestion-count: 0
-- risk-summary: safe=1, caution=0, danger=0

-- operation: create_table key=table:rudel.session_language_signals risk=safe
CREATE TABLE IF NOT EXISTS rudel.session_language_signals
(
  `organization_id` String,
  `session_date` DateTime64(3, 'UTC'),
  `session_id` String,
  `user_id` String,
  `source` LowCardinality(String),
  `raw_ingested_at` DateTime64(3, 'UTC'),
  `scan_version` UInt16,
  `member_swears` UInt32,
  `member_apologies` UInt32,
  `member_positive` UInt32,
  `model_swears` UInt32,
  `model_apologies` UInt32,
  `model_positive` UInt32,
  `scanned_at` DateTime64(3, 'UTC')
) ENGINE = ReplacingMergeTree(scanned_at)
PARTITION BY toYYYYMM(toDate(session_date))
PRIMARY KEY ()
ORDER BY (`organization_id`, `session_date`, `session_id`, `source`)
TTL toDate(session_date) + toIntervalDay(365)
SETTINGS index_granularity = 8192, storage_policy = 's3';
