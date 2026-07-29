-- chkit-migration-format: v1
-- generated-at: 2026-07-28T09:32:04.316Z
-- cli-version: 0.1.0-beta.16
-- definition-count: 7
-- operation-count: 3
-- rename-suggestion-count: 0
-- risk-summary: safe=0, caution=3, danger=0

-- operation: alter_table_modify_column key=table:rudel.claude_sessions:column:filter_version risk=caution
ALTER TABLE rudel.claude_sessions MODIFY COLUMN `filter_version` UInt8 DEFAULT 0;

-- operation: alter_table_modify_column key=table:rudel.codex_sessions:column:filter_version risk=caution
ALTER TABLE rudel.codex_sessions MODIFY COLUMN `filter_version` UInt8 DEFAULT 0;

-- operation: alter_table_modify_column key=table:rudel.session_analytics:column:filter_version risk=caution
ALTER TABLE rudel.session_analytics MODIFY COLUMN `filter_version` UInt8 DEFAULT 0;
