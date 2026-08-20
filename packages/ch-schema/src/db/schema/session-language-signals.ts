import { schema, table } from "@chkit/core";

const rudel_session_language_signals = table({
	database: "rudel",
	name: "session_language_signals",
	engine: "SharedReplacingMergeTree(scanned_at)",
	columns: [
		{ name: "organization_id", type: "String" },
		{ name: "session_date", type: "DateTime64(3, 'UTC')" },
		{ name: "session_id", type: "String" },
		{ name: "user_id", type: "String" },
		{ name: "source", type: "LowCardinality(String)" },
		{ name: "raw_ingested_at", type: "DateTime64(3, 'UTC')" },
		{ name: "scan_version", type: "UInt16" },
		{ name: "member_swears", type: "UInt32" },
		{ name: "member_apologies", type: "UInt32" },
		{ name: "member_positive", type: "UInt32" },
		{ name: "model_swears", type: "UInt32" },
		{ name: "model_apologies", type: "UInt32" },
		{ name: "model_positive", type: "UInt32" },
		{ name: "scanned_at", type: "DateTime64(3, 'UTC')" },
	],
	primaryKey: [],
	orderBy: ["organization_id", "session_date", "session_id", "source"],
	partitionBy: "toYYYYMM(toDate(session_date))",
	ttl: "toDate(session_date) + toIntervalDay(365)",
	settings: {
		index_granularity: "8192",
		storage_policy: "'s3'",
	},
});

export default schema(rudel_session_language_signals);
