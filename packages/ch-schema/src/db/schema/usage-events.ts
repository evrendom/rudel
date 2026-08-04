import { schema, table } from "@chkit/core";

const rudel_usage_events = table({
	database: "rudel",
	name: "usage_events",
	engine: "SharedReplacingMergeTree(event_version)",
	columns: [
		{ name: "organization_id", type: "String" },
		{ name: "user_id", type: "String" },
		{ name: "source", type: "LowCardinality(String)" },
		{ name: "session_id", type: "String" },
		{ name: "event_id", type: "FixedString(64)" },
		{ name: "record_kind", type: "LowCardinality(String)" },
		{ name: "event_version", type: "UInt64" },
		{ name: "event_identity_version", type: "UInt8" },
		{ name: "extraction_version", type: "UInt16" },
		{ name: "model_rate_card_version", type: "LowCardinality(String)" },
		{ name: "filter_version", type: "UInt16" },
		{ name: "content_sha256", type: "FixedString(64)" },
		{ name: "occurred_at", type: "DateTime64(3, 'UTC')" },
		{ name: "usage_date", type: "Date" },
		{ name: "has_valid_timestamp", type: "UInt8" },
		{ name: "raw_model", type: "String" },
		{ name: "resolved_model", type: "LowCardinality(String)" },
		{ name: "model_status", type: "LowCardinality(String)" },
		{ name: "service_tier", type: "LowCardinality(String)" },
		{ name: "context_input_tokens", type: "UInt64" },
		{ name: "uncached_input_tokens", type: "UInt64" },
		{ name: "cache_read_input_tokens", type: "UInt64" },
		{ name: "cache_write_5m_input_tokens", type: "UInt64" },
		{ name: "cache_write_1h_input_tokens", type: "UInt64" },
		{ name: "output_tokens", type: "UInt64" },
		{ name: "reasoning_output_tokens", type: "UInt64" },
		{ name: "agent_id", type: "String" },
		{ name: "lineage_id", type: "String" },
		{ name: "parent_lineage_id", type: "String" },
		{ name: "token_source", type: "LowCardinality(String)" },
		{ name: "identity_kind", type: "LowCardinality(String)" },
		{ name: "first_observed_line", type: "UInt32" },
		{ name: "duplicate_observation_count", type: "UInt32" },
		{ name: "quality_flags", type: "Array(String)", default: "fn:[]" },
		{ name: "is_deleted", type: "UInt8", default: "fn:0" },
		{ name: "receipt_is_complete", type: "UInt8", default: "fn:0" },
		{ name: "receipt_event_count", type: "UInt32", default: "fn:0" },
		{ name: "receipt_checksum", type: "FixedString(64)" },
		{ name: "ingested_at", type: "DateTime64(3, 'UTC')" },
	],
	primaryKey: [
		"organization_id",
		"user_id",
		"source",
		"session_id",
		"event_id",
	],
	orderBy: ["organization_id", "user_id", "source", "session_id", "event_id"],
	indexes: [
		{
			expression: "usage_date",
			granularity: 1,
			name: "usage_date_minmax",
			type: "minmax",
		},
	],
	// TTL is deliberately omitted: event retention has not been approved, and
	// all-time usage facts must not silently inherit the raw transcript's TTL.
	settings: {
		index_granularity: "8192",
		storage_policy: "'s3'",
	},
	comment:
		"Versioned request-level usage facts and per-generation extraction receipts. Mutable timestamp/model fields are deliberately excluded from the replacing key.",
});

export default schema(rudel_usage_events);
