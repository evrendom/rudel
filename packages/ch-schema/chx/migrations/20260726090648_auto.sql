-- chkit-migration-format: v1
-- generated-at: 2026-07-26T09:06:48.063Z
-- cli-version: 0.1.0-beta.16
-- definition-count: 7
-- operation-count: 3
-- rename-suggestion-count: 0
-- risk-summary: safe=3, caution=0, danger=0

-- operation: alter_table_add_column key=table:rudel.session_analytics:column:filter_version risk=safe
ALTER TABLE rudel.session_analytics ADD COLUMN IF NOT EXISTS `filter_version` UInt16 DEFAULT 0;

-- operation: alter_table_add_column key=table:rudel.claude_sessions:column:filter_version risk=safe
ALTER TABLE rudel.claude_sessions ADD COLUMN IF NOT EXISTS `filter_version` UInt16 DEFAULT 0;

-- operation: alter_table_add_column key=table:rudel.codex_sessions:column:filter_version risk=safe
ALTER TABLE rudel.codex_sessions ADD COLUMN IF NOT EXISTS `filter_version` UInt16 DEFAULT 0;
