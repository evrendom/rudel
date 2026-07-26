import { materializedView, schema, table } from "@chkit/core";
import { CODEX_SESSION_ANALYTICS_MV_SQL } from "../../mv-sql/codex-session-analytics.js";
import { baseSessionColumns, baseSessionTableConfig } from "./base-sessions.js";

const rudel_codex_sessions = table({
	database: "rudel",
	name: "codex_sessions",
	engine: "SharedReplacingMergeTree(ingested_at)",
	columns: [...baseSessionColumns],
	...baseSessionTableConfig,
});

const codex_session_analytics_mv = materializedView({
	database: "rudel",
	name: "codex_session_analytics_mv",
	to: { database: "rudel", name: "session_analytics" },
	as: CODEX_SESSION_ANALYTICS_MV_SQL,
});

export default schema(rudel_codex_sessions, codex_session_analytics_mv);
