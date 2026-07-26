import { materializedView, schema, table } from "@chkit/core";
import { CLAUDE_SESSION_ANALYTICS_MV_SQL } from "../../mv-sql/claude-session-analytics.js";

const rudel_session_analytics = table({
	database: "rudel",
	name: "session_analytics",
	engine: "ReplacingMergeTree(ingested_at)",
	columns: [
		// ── Source columns from claude_sessions (SELECT *) ──────────────
		{
			name: "session_date",
			type: "DateTime64(3, 'UTC')",
			default: "fn:now64(3)",
		},
		{
			name: "last_interaction_date",
			type: "DateTime64(3, 'UTC')",
			default: "fn:now64(3)",
		},
		{ name: "session_id", type: "String" },
		{ name: "organization_id", type: "String" },
		{ name: "project_path", type: "String" },
		{ name: "git_remote", type: "String", default: "''" },
		{ name: "package_name", type: "String", default: "''" },
		{ name: "package_type", type: "String", default: "''" },
		{ name: "content", type: "String" },
		{ name: "filter_version", type: "UInt16", default: "fn:0" },
		{ name: "subagents", type: "Map(String, String)", default: "fn:map()" },
		{ name: "skills", type: "Array(String)", default: "fn:[]" },
		{ name: "slash_commands", type: "Array(String)", default: "fn:[]" },
		{ name: "subagent_types", type: "Array(String)", default: "fn:[]" },
		{
			name: "ingested_at",
			type: "DateTime64(3, 'UTC')",
			default: "fn:now64(3)",
		},
		{ name: "user_id", type: "String" },
		{ name: "git_branch", type: "String", nullable: true },
		{ name: "git_sha", type: "String", nullable: true },
		{ name: "input_tokens", type: "UInt64", default: "fn:0" },
		{ name: "output_tokens", type: "UInt64", default: "fn:0" },
		{ name: "cache_read_input_tokens", type: "UInt64", default: "fn:0" },
		{ name: "cache_creation_input_tokens", type: "UInt64", default: "fn:0" },
		{ name: "total_tokens", type: "UInt64", default: "fn:0" },
		{ name: "tag", type: "String", nullable: true },
		{
			name: "source",
			type: "LowCardinality(String)",
			default: "'claude_code'",
		},

		// ── Computed metrics (populated by MV) ─────────────────────────
		{ name: "total_interactions", type: "UInt32", default: "fn:0" },
		{ name: "actual_duration_min", type: "UInt32", default: "fn:0" },
		{ name: "avg_period_sec", type: "Float64", default: "fn:0" },
		{ name: "median_period_sec", type: "Float64", default: "fn:0" },
		{ name: "quick_responses", type: "UInt32", default: "fn:0" },
		{ name: "normal_responses", type: "UInt32", default: "fn:0" },
		{ name: "long_pauses", type: "UInt32", default: "fn:0" },
		{ name: "error_count", type: "UInt32", default: "fn:0" },
		{ name: "model_used", type: "String", default: "''" },
		{ name: "has_commit", type: "UInt8", default: "fn:0" },
		{ name: "session_archetype", type: "String", default: "'standard'" },
		{ name: "success_score", type: "UInt8", default: "fn:0" },
		{ name: "used_plan_mode", type: "UInt8", default: "fn:0" },
		{ name: "inference_duration_sec", type: "UInt32", default: "fn:0" },
		{ name: "human_duration_sec", type: "UInt32", default: "fn:0" },
	],
	primaryKey: ["organization_id", "session_date", "session_id"],
	orderBy: ["organization_id", "session_date", "session_id"],
	partitionBy: "toYYYYMM(toDate(session_date))",
	settings: {
		index_granularity: "8192",
	},
	indexes: [
		{
			name: "idx_user_id",
			expression: "user_id",
			type: "set",
			typeArgs: "0",
			granularity: 4,
		},
		{
			name: "idx_project_path",
			expression: "project_path",
			type: "set",
			typeArgs: "0",
			granularity: 4,
		},
		{
			name: "idx_model_used",
			expression: "model_used",
			type: "set",
			typeArgs: "0",
			granularity: 4,
		},
		{
			name: "idx_git_remote",
			expression: "git_remote",
			type: "set",
			typeArgs: "0",
			granularity: 4,
		},
		{
			name: "idx_source",
			expression: "source",
			type: "set",
			typeArgs: "0",
			granularity: 4,
		},
	],
});

const rudel_session_analytics_mv = materializedView({
	database: "rudel",
	name: "session_analytics_mv",
	to: { database: "rudel", name: "session_analytics" },
	as: CLAUDE_SESSION_ANALYTICS_MV_SQL,
});

export default schema(rudel_session_analytics, rudel_session_analytics_mv);
