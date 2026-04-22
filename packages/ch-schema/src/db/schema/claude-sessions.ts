import { schema, table } from "@chkit/core";
import { baseSessionColumns, baseSessionTableConfig } from "./base-sessions";

const rudel_claude_sessions = table({
	database: "rudel",
	name: "claude_sessions",
	engine: "SharedReplacingMergeTree(ingested_at)",
	columns: [
		...baseSessionColumns,
		{ name: "subagents", type: "Map(String, String)", default: "fn:map()" },
	],
	...baseSessionTableConfig,
});

export default schema(rudel_claude_sessions);
