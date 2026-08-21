-- chkit-migration-format: v1
-- generated-at: 2026-08-20T17:03:52.064Z
-- cli-version: 0.1.0-beta.16
-- definition-count: 12
-- operation-count: 4
-- rename-suggestion-count: 0
-- risk-summary: safe=4, caution=0, danger=0

-- operation: create_database key=database:rudel risk=safe
CREATE DATABASE IF NOT EXISTS rudel;

-- operation: create_table key=table:rudel.skill_receipts risk=safe
CREATE TABLE IF NOT EXISTS rudel.skill_receipts
(
  `organization_id` String,
  `user_id` String,
  `agent` LowCardinality(String),
  `session_id` String,
  `source_content_sha256` FixedString(64),
  `parser_version` UInt16,
  `extraction_seq` UInt64,
  `extracted_at` DateTime64(3, 'UTC')
) ENGINE = ReplacingMergeTree(extraction_seq)
PRIMARY KEY (`organization_id`, `agent`, `user_id`, `session_id`)
ORDER BY (`organization_id`, `agent`, `user_id`, `session_id`)
SETTINGS index_granularity = 8192, storage_policy = 's3'
COMMENT 'Latest completed skill extraction run per workspace, user, agent, and session.';

-- operation: create_table key=table:rudel.skill_uses risk=safe
CREATE TABLE IF NOT EXISTS rudel.skill_uses
(
  `organization_id` String,
  `skill_name` String,
  `agent` LowCardinality(String),
  `user_id` String,
  `session_id` String,
  `content_sha256` String,
  `source_content_sha256` FixedString(64),
  `used_at` DateTime64(3, 'UTC'),
  `parser_version` UInt16,
  `extraction_seq` UInt64,
  `extracted_at` DateTime64(3, 'UTC')
) ENGINE = ReplacingMergeTree(extraction_seq)
PRIMARY KEY (`organization_id`, `skill_name`, `agent`, `user_id`, `session_id`)
ORDER BY (`organization_id`, `skill_name`, `agent`, `user_id`, `session_id`, `extraction_seq`)
SETTINGS index_granularity = 8192, storage_policy = 's3'
COMMENT 'Versioned session skill uses bound to an exact completed extraction receipt. Mutable usage timestamps and content hashes are excluded from the replacing key.';

-- operation: create_table key=table:rudel.skill_version_contents risk=safe
CREATE TABLE IF NOT EXISTS rudel.skill_version_contents
(
  `organization_id` String,
  `skill_name` String,
  `content_sha256` FixedString(64),
  `user_id` String,
  `content` String,
  `parser_version` UInt16,
  `extraction_seq` UInt64,
  `extracted_at` DateTime64(3, 'UTC')
) ENGINE = ReplacingMergeTree(extraction_seq)
PRIMARY KEY (`organization_id`, `skill_name`, `content_sha256`, `user_id`)
ORDER BY (`organization_id`, `skill_name`, `content_sha256`, `user_id`)
SETTINGS index_granularity = 8192, storage_policy = 's3'
COMMENT 'User-erasable product-readable SKILL.md bodies keyed by workspace, exact skill name, SHA-256, and uploader.';
