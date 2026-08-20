import { schema, table } from "@chkit/core";

const rudel_skill_uses = table({
	database: "rudel",
	name: "skill_uses",
	engine: "SharedReplacingMergeTree(extraction_seq)",
	columns: [
		{ name: "organization_id", type: "String" },
		{ name: "skill_name", type: "String" },
		{ name: "agent", type: "LowCardinality(String)" },
		{ name: "user_id", type: "String" },
		{ name: "session_id", type: "String" },
		{ name: "content_sha256", type: "String" },
		{ name: "source_content_sha256", type: "FixedString(64)" },
		{ name: "used_at", type: "DateTime64(3, 'UTC')" },
		{ name: "parser_version", type: "UInt16" },
		{ name: "is_deleted", type: "UInt8", default: "fn:0" },
		{ name: "extraction_seq", type: "UInt64" },
		{ name: "extracted_at", type: "DateTime64(3, 'UTC')" },
	],
	primaryKey: [
		"organization_id",
		"skill_name",
		"agent",
		"user_id",
		"session_id",
	],
	orderBy: ["organization_id", "skill_name", "agent", "user_id", "session_id"],
	settings: {
		index_granularity: "8192",
		storage_policy: "'s3'",
	},
	comment:
		"Versioned session skill uses and tombstones. Mutable usage timestamps and content hashes are excluded from the replacing key.",
});

const rudel_skill_receipts = table({
	database: "rudel",
	name: "skill_receipts",
	engine: "SharedReplacingMergeTree(extraction_seq)",
	columns: [
		{ name: "organization_id", type: "String" },
		{ name: "user_id", type: "String" },
		{ name: "agent", type: "LowCardinality(String)" },
		{ name: "session_id", type: "String" },
		{ name: "source_content_sha256", type: "FixedString(64)" },
		{ name: "parser_version", type: "UInt16" },
		{ name: "extraction_seq", type: "UInt64" },
		{ name: "extracted_at", type: "DateTime64(3, 'UTC')" },
	],
	primaryKey: ["organization_id", "user_id", "agent", "session_id"],
	orderBy: ["organization_id", "user_id", "agent", "session_id"],
	settings: {
		index_granularity: "8192",
		storage_policy: "'s3'",
	},
	comment:
		"Latest completed skill extraction run per workspace, user, agent, and session.",
});

const rudel_skill_version_contents = table({
	database: "rudel",
	name: "skill_version_contents",
	engine: "SharedReplacingMergeTree(extraction_seq)",
	columns: [
		{ name: "organization_id", type: "String" },
		{ name: "skill_name", type: "String" },
		{ name: "content_sha256", type: "FixedString(64)" },
		{ name: "content", type: "String" },
		{ name: "parser_version", type: "UInt16" },
		{ name: "extraction_seq", type: "UInt64" },
		{ name: "extracted_at", type: "DateTime64(3, 'UTC')" },
	],
	primaryKey: ["organization_id", "skill_name", "content_sha256"],
	orderBy: ["organization_id", "skill_name", "content_sha256"],
	settings: {
		index_granularity: "8192",
		storage_policy: "'s3'",
	},
	comment:
		"Deduplicated product-readable SKILL.md bodies keyed by workspace, exact skill name, and SHA-256.",
});

export default schema(
	rudel_skill_receipts,
	rudel_skill_uses,
	rudel_skill_version_contents,
);
