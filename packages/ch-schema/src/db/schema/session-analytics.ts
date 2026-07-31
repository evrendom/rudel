import { materializedView, schema, table } from "@chkit/core";
import { CLAUDE_SESSION_ANALYTICS_MV_SQL } from "../../mv-sql/claude-session-analytics.js";
import { baseSessionColumns } from "./base-sessions.js";

const analyticsSourceColumns = baseSessionColumns.filter(
	(column) => column.name !== "content",
);

const rudel_session_analytics = table({
	database: "rudel",
	name: "session_analytics",
	engine: "SharedReplacingMergeTree(ingested_at)",
	columns: [
		...analyticsSourceColumns,
		{
			name: "source",
			type: "LowCardinality(String)",
			default: "'claude_code'",
		},
		{ name: "skills", type: "Array(String)", default: "fn:[]" },
		{ name: "slash_commands", type: "Array(String)", default: "fn:[]" },
		{ name: "subagent_types", type: "Array(String)", default: "fn:[]" },
		{ name: "input_tokens", type: "UInt64", default: "fn:0" },
		{ name: "output_tokens", type: "UInt64", default: "fn:0" },
		{ name: "cache_read_input_tokens", type: "UInt64", default: "fn:0" },
		{ name: "cache_creation_input_tokens", type: "UInt64", default: "fn:0" },
		{ name: "total_tokens", type: "UInt64", default: "fn:0" },
		{ name: "total_interactions", type: "UInt32", default: "fn:0" },
		{ name: "actual_duration_min", type: "UInt32", default: "fn:0" },
		{ name: "avg_period_sec", type: "Float64", default: "fn:0" },
		{ name: "median_period_sec", type: "Float64", default: "fn:0" },
		{ name: "quick_responses", type: "UInt32", default: "fn:0" },
		{ name: "normal_responses", type: "UInt32", default: "fn:0" },
		{ name: "long_pauses", type: "UInt32", default: "fn:0" },
		{ name: "error_count", type: "UInt32", default: "fn:0" },
		{ name: "error_pattern", type: "LowCardinality(String)", default: "''" },
		{ name: "model_used", type: "String", default: "''" },
		{ name: "has_commit", type: "UInt8", default: "fn:0" },
		{ name: "session_archetype", type: "String", default: "'standard'" },
		{ name: "success_score", type: "UInt8", default: "fn:0" },
		{ name: "used_plan_mode", type: "UInt8", default: "fn:0" },
		{ name: "inference_duration_sec", type: "UInt32", default: "fn:0" },
		{ name: "human_duration_sec", type: "UInt32", default: "fn:0" },
	],
	// Order the identity from lowest to highest cardinality so common source and
	// organization filters prune before user and session.
	primaryKey: ["source", "organization_id", "user_id", "session_id"],
	orderBy: ["source", "organization_id", "user_id", "session_id"],
	settings: {
		index_granularity: "8192",
		storage_policy: "'s3'",
	},
});

const rudel_session_analytics_mv = materializedView({
	database: "rudel",
	name: "session_analytics_mv",
	to: { database: "rudel", name: "session_analytics" },
	as: CLAUDE_SESSION_ANALYTICS_MV_SQL,
});

export default schema(rudel_session_analytics, rudel_session_analytics_mv);
