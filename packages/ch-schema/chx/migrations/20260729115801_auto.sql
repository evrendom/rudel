-- chkit-migration-format: v1
-- generated-at: 2026-07-29T11:58:01.523Z
-- cli-version: 0.1.0-beta.16
-- definition-count: 7
-- operation-count: 9
-- rename-suggestion-count: 0
-- risk-summary: safe=0, caution=9, danger=0

-- operation: alter_table_add_index key=table:rudel.claude_sessions:index:idx_purge_organization_id risk=caution
ALTER TABLE rudel.claude_sessions ADD INDEX IF NOT EXISTS `idx_purge_organization_id` (organization_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE rudel.claude_sessions MATERIALIZE INDEX `idx_purge_organization_id` SETTINGS mutations_sync = 2;

-- operation: alter_table_add_index key=table:rudel.claude_sessions:index:idx_purge_user_id risk=caution
ALTER TABLE rudel.claude_sessions ADD INDEX IF NOT EXISTS `idx_purge_user_id` (user_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE rudel.claude_sessions MATERIALIZE INDEX `idx_purge_user_id` SETTINGS mutations_sync = 2;

-- operation: alter_table_add_index key=table:rudel.codex_sessions:index:idx_purge_organization_id risk=caution
ALTER TABLE rudel.codex_sessions ADD INDEX IF NOT EXISTS `idx_purge_organization_id` (organization_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE rudel.codex_sessions MATERIALIZE INDEX `idx_purge_organization_id` SETTINGS mutations_sync = 2;

-- operation: alter_table_add_index key=table:rudel.codex_sessions:index:idx_purge_user_id risk=caution
ALTER TABLE rudel.codex_sessions ADD INDEX IF NOT EXISTS `idx_purge_user_id` (user_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE rudel.codex_sessions MATERIALIZE INDEX `idx_purge_user_id` SETTINGS mutations_sync = 2;

-- operation: alter_table_add_index key=table:rudel.session_analytics:index:idx_purge_organization_id risk=caution
ALTER TABLE rudel.session_analytics ADD INDEX IF NOT EXISTS `idx_purge_organization_id` (organization_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE rudel.session_analytics MATERIALIZE INDEX `idx_purge_organization_id` SETTINGS mutations_sync = 2;

-- operation: alter_table_add_index key=table:rudel.session_analytics:index:idx_purge_user_id risk=caution
ALTER TABLE rudel.session_analytics ADD INDEX IF NOT EXISTS `idx_purge_user_id` (user_id) TYPE bloom_filter GRANULARITY 4;
ALTER TABLE rudel.session_analytics MATERIALIZE INDEX `idx_purge_user_id` SETTINGS mutations_sync = 2;

-- operation: alter_table_drop_index key=table:rudel.session_analytics:index:idx_user_id risk=caution
ALTER TABLE rudel.session_analytics DROP INDEX IF EXISTS `idx_user_id`;

-- operation: alter_table_add_index key=table:rudel.wrapped_user_archetype_snapshots_v1:index:idx_purge_organization_id risk=caution
ALTER TABLE rudel.wrapped_user_archetype_snapshots_v1 ADD INDEX IF NOT EXISTS `idx_purge_organization_id` (organization_id) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE rudel.wrapped_user_archetype_snapshots_v1 MATERIALIZE INDEX `idx_purge_organization_id` SETTINGS mutations_sync = 2;

-- operation: alter_table_add_index key=table:rudel.wrapped_user_archetype_snapshots_v1:index:idx_purge_user_id risk=caution
ALTER TABLE rudel.wrapped_user_archetype_snapshots_v1 ADD INDEX IF NOT EXISTS `idx_purge_user_id` (user_id) TYPE bloom_filter GRANULARITY 1;
ALTER TABLE rudel.wrapped_user_archetype_snapshots_v1 MATERIALIZE INDEX `idx_purge_user_id` SETTINGS mutations_sync = 2;
