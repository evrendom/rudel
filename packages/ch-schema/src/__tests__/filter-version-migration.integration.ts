import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
	ingestRudelClaudeSessions,
	ingestRudelCodexSessions,
	ingestRudelSessionAnalytics,
} from "../generated/chkit-ingest.js";
import type {
	RudelClaudeSessionsRow,
	RudelCodexSessionsRow,
	RudelSessionAnalyticsRow,
} from "../generated/chkit-types.js";
import { CLAUDE_SESSION_ANALYTICS_MV_SQL } from "../mv-sql/claude-session-analytics.js";
import { createTestExecutor, waitForQuery } from "./helpers/executor.js";
import { withSessionFilter } from "./mv-session-filter.js";

setDefaultTimeout(120_000);

// Mirrors FILTER_VERSION in packages/secret-filter/src/filter.ts. Hardcoded
// because @rudel/ch-schema does not depend on @rudel/secret-filter and this
// rehearsal must not add that edge; bump both together.
const CURRENT_FILTER_VERSION = 4;

const MIGRATION_PATHS = [
	"20260726090648_auto.sql",
	"20260728093204_auto.sql",
].map((migration) =>
	resolve(import.meta.dir, "..", "..", "chx", "migrations", migration),
);

const testPrefix = `fv_mig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
// Unique per run. Every inserted row carries it, so afterAll can clean by
// organization without touching anything else in the shared CI database.
const orgId = `org_${testPrefix}`;
const migrationTableNames = {
	claude_sessions: `_${testPrefix}_claude_sessions`,
	codex_sessions: `_${testPrefix}_codex_sessions`,
	session_analytics: `_${testPrefix}_session_analytics`,
} as const;

const executor = createTestExecutor();

afterAll(async () => {
	for (const table of Object.values(migrationTableNames)) {
		await executor.execute(`DROP TABLE IF EXISTS rudel.${table} SYNC`);
	}

	// The incremental MVs write separate target rows on insert; deleting a source
	// row does not propagate, so session_analytics is cleaned explicitly.
	// The executor reuses one ClickHouse session, so commands must be sequential;
	// concurrent deletes fail with SESSION_IS_LOCKED.
	// Shared CI can already have asynchronous mutations queued by the other
	// integration files, so cleanup gets the same timeout budget as the tests.
	// Best-effort: rows are scoped to this run's unique org id, so a delete that
	// times out under shared-cluster mutation pressure leaks only inert fixtures
	// — it must not fail the gate.
	for (const table of [
		"rudel.claude_sessions",
		"rudel.codex_sessions",
		"rudel.session_analytics",
	]) {
		await executor
			.execute(
				`DELETE FROM ${table} WHERE organization_id = '${orgId}' SETTINGS lightweight_deletes_sync = 0`,
			)
			.catch(() => {});
	}
});

// Minimal-but-realistic Claude Code transcript. The Claude analytics MV only
// emits a row when the content yields parseable timestamps on user/assistant
// lines (`WHERE length(_timestamps) > 0`), so all three lines carry them.
const CLAUDE_MV_CONTENT = [
	JSON.stringify({
		type: "user",
		timestamp: "2026-07-01T10:00:00.000Z",
		message: {
			role: "user",
			content: "Refactor the uploader to batch requests",
		},
	}),
	JSON.stringify({
		type: "assistant",
		timestamp: "2026-07-01T10:00:30.000Z",
		message: {
			id: "msg_01FvMigRehearsal",
			type: "message",
			role: "assistant",
			model: "claude-fable-5",
			content: [
				{ type: "text", text: "Batched. Uploads now group by session." },
			],
			usage: {
				input_tokens: 1200,
				output_tokens: 340,
				cache_read_input_tokens: 100,
				cache_creation_input_tokens: 50,
			},
		},
	}),
	JSON.stringify({
		type: "user",
		timestamp: "2026-07-01T10:02:00.000Z",
		message: { role: "user", content: "Looks good, thanks" },
	}),
].join("\n");

function nowIso(): string {
	return new Date().toISOString().replace("Z", "");
}

function buildClaudeRow(
	sessionId: string,
	overrides: Partial<RudelClaudeSessionsRow> = {},
): RudelClaudeSessionsRow {
	const now = nowIso();
	return {
		session_date: now,
		last_interaction_date: now,
		session_id: sessionId,
		organization_id: orgId,
		project_path: "/Users/testuser/projects/myapp",
		git_remote: "github.com/testorg/testproject",
		package_name: "myapp",
		package_type: "package.json",
		content: CLAUDE_MV_CONTENT,
		filter_version: 0,
		ingested_at: now,
		user_id: "user_test",
		git_branch: "main",
		git_sha: null,
		tag: "fv-migration-rehearsal",
		subagents: {},
		...overrides,
	};
}

function buildCodexRow(
	sessionId: string,
	overrides: Partial<RudelCodexSessionsRow> = {},
): RudelCodexSessionsRow {
	const now = nowIso();
	return {
		session_date: now,
		last_interaction_date: now,
		session_id: sessionId,
		organization_id: orgId,
		project_path: "/Users/testuser/projects/myapp",
		git_remote: "github.com/testorg/testproject",
		package_name: "myapp",
		package_type: "package.json",
		content: "codex content placeholder",
		filter_version: 0,
		ingested_at: now,
		user_id: "user_test",
		git_branch: "main",
		git_sha: null,
		tag: "fv-migration-rehearsal",
		...overrides,
	};
}

function buildAnalyticsRow(
	sessionId: string,
	overrides: Partial<RudelSessionAnalyticsRow> = {},
): RudelSessionAnalyticsRow {
	const now = nowIso();
	return {
		session_date: now,
		last_interaction_date: now,
		session_id: sessionId,
		organization_id: orgId,
		project_path: "/Users/testuser/projects/myapp",
		git_remote: "github.com/testorg/testproject",
		package_name: "myapp",
		package_type: "package.json",
		content: "analytics row inserted directly by the migration rehearsal",
		filter_version: 0,
		subagents: {},
		skills: [],
		slash_commands: [],
		subagent_types: [],
		ingested_at: now,
		user_id: "user_test",
		git_branch: "main",
		git_sha: null,
		input_tokens: "1350",
		output_tokens: "340",
		cache_read_input_tokens: "100",
		cache_creation_input_tokens: "50",
		total_tokens: "1690",
		tag: "fv-migration-rehearsal",
		source: "claude_code",
		total_interactions: 3,
		actual_duration_min: 2,
		avg_period_sec: 60,
		median_period_sec: 90,
		quick_responses: 0,
		normal_responses: 1,
		long_pauses: 0,
		error_count: 0,
		model_used: "claude-fable-5",
		has_commit: 0,
		session_archetype: "standard",
		success_score: 50,
		used_plan_mode: 0,
		inference_duration_sec: 30,
		human_duration_sec: 90,
		...overrides,
	};
}

// Replays the mid-deploy window: an API build that predates the migration
// serializes rows with no filter_version key at all. The shared executor's
// insert() turns exactly these keys into an
// `INSERT INTO <table> ... FORMAT JSONEachRow` statement, so asserting the
// serialized row lacks the key proves the statement never mentions the column;
// ClickHouse must fill it from the column DEFAULT.
async function insertWithoutFilterVersion(
	table: string,
	row: Record<string, unknown>,
): Promise<void> {
	expect(JSON.stringify(row)).not.toContain("filter_version");
	await executor.insert({ table, values: [row] });
}

describe("filter_version migration rehearsal", () => {
	test("the filter_version migration chain preserves values and finishes at UInt8", async () => {
		const migrationSql = (
			await Promise.all(
				MIGRATION_PATHS.map((migrationPath) =>
					readFile(migrationPath, "utf-8"),
				),
			)
		).join("\n");
		const statements = migrationSql
			.split("\n")
			.filter((line) => !line.trimStart().startsWith("--"))
			.join("\n")
			.split(";")
			.map((statement) => statement.trim())
			.filter((statement) => statement.length > 0);

		expect(statements).toHaveLength(6);
		for (const statement of statements.slice(0, 3)) {
			expect(statement).toMatch(
				/^ALTER TABLE rudel\.(session_analytics|claude_sessions|codex_sessions) ADD COLUMN IF NOT EXISTS `filter_version` UInt16 DEFAULT 0$/,
			);
		}
		for (const statement of statements.slice(3)) {
			expect(statement).toMatch(
				/^ALTER TABLE rudel\.(session_analytics|claude_sessions|codex_sessions) MODIFY COLUMN `filter_version` UInt8 DEFAULT 0$/,
			);
		}

		// Never replay a type-changing migration against the shared, long-lived CI
		// tables: MODIFY COLUMN schedules a mutation over every historical part.
		// Isolated tables exercise the exact generated statements without queuing
		// rewrites that can block unrelated integration-test cleanup.
		for (const table of Object.values(migrationTableNames)) {
			await executor.execute(
				`CREATE TABLE rudel.${table} (id UInt8) ENGINE = MergeTree ORDER BY id`,
			);
		}

		const isolatedStatements = statements.map((statement) => {
			let isolatedStatement = statement;
			for (const [productionTable, isolatedTable] of Object.entries(
				migrationTableNames,
			)) {
				isolatedStatement = isolatedStatement.replace(
					`rudel.${productionTable}`,
					`rudel.${isolatedTable}`,
				);
			}
			return isolatedStatement;
		});

		for (const statement of isolatedStatements.slice(0, 3)) {
			await executor.execute(statement);
		}
		for (const table of Object.values(migrationTableNames)) {
			await executor.insert({
				table: `rudel.${table}`,
				values: [{ id: 1, filter_version: 3 }],
			});
		}
		for (const statement of isolatedStatements.slice(3)) {
			await executor.execute(statement);
		}

		const columns = await executor.query<{
			table: string;
			type: string;
		}>(
			`SELECT table, type FROM system.columns
			 WHERE database = 'rudel' AND name = 'filter_version'
			   AND table IN (${Object.values(migrationTableNames)
						.map((table) => `'${table}'`)
						.join(", ")})
			 ORDER BY table`,
		);
		expect(columns).toHaveLength(3);
		expect(columns.every(({ type }) => type === "UInt8")).toBe(true);

		for (const table of Object.values(migrationTableNames)) {
			const rows = await executor.query<{ filter_version: number }>(
				`SELECT filter_version FROM rudel.${table} WHERE id = 1`,
			);
			expect(rows).toEqual([{ filter_version: 3 }]);
		}
	}, 120_000);

	test("mid-deploy window: claude_sessions insert without filter_version succeeds and reads back 0", async () => {
		const sessionId = `${testPrefix}_claude_filterless`;
		const { filter_version: _omitted, ...row } = buildClaudeRow(sessionId, {
			content: "mid-deploy window claude payload from an old API build",
		});
		await insertWithoutFilterVersion("rudel.claude_sessions", row);

		const rows = await waitForQuery<{
			filter_version: number;
			tag: string | null;
		}>(
			executor,
			`SELECT filter_version, tag FROM rudel.claude_sessions
			 WHERE organization_id = '${orgId}' AND session_id = '${sessionId}'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.filter_version).toBe(0);
		expect(rows[0]?.tag).toBe("fv-migration-rehearsal");
	}, 120_000);

	test("mid-deploy window: codex_sessions insert without filter_version succeeds and reads back 0", async () => {
		const sessionId = `${testPrefix}_codex_filterless`;
		const { filter_version: _omitted, ...row } = buildCodexRow(sessionId, {
			content: "mid-deploy window codex payload from an old API build",
		});
		await insertWithoutFilterVersion("rudel.codex_sessions", row);

		const rows = await waitForQuery<{
			filter_version: number;
			tag: string | null;
		}>(
			executor,
			`SELECT filter_version, tag FROM rudel.codex_sessions
			 WHERE organization_id = '${orgId}' AND session_id = '${sessionId}'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.filter_version).toBe(0);
		expect(rows[0]?.tag).toBe("fv-migration-rehearsal");
	}, 120_000);

	test("mid-deploy window: session_analytics insert without filter_version succeeds and reads back 0", async () => {
		const sessionId = `${testPrefix}_analytics_filterless`;
		const { filter_version: _omitted, ...row } = buildAnalyticsRow(sessionId);
		await insertWithoutFilterVersion("rudel.session_analytics", row);

		const rows = await waitForQuery<{ filter_version: number; source: string }>(
			executor,
			`SELECT filter_version, source FROM rudel.session_analytics
			 WHERE organization_id = '${orgId}' AND session_id = '${sessionId}'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.filter_version).toBe(0);
		expect(rows[0]?.source).toBe("claude_code");
	}, 120_000);

	test("claude MV propagates the current filter_version source insert into session_analytics", async () => {
		const sessionId = `${testPrefix}_claude_mv_fv3`;
		await ingestRudelClaudeSessions(executor, [
			buildClaudeRow(sessionId, { filter_version: CURRENT_FILTER_VERSION }),
		]);

		// Real wiring: the deployed MV trigger must carry the column through its
		// `SELECT * EXCEPT (...)` re-expansion into the target table.
		const rows = await waitForQuery<{
			filter_version: number;
			source: string;
			total_interactions: number;
		}>(
			executor,
			`SELECT filter_version, source, total_interactions FROM rudel.session_analytics
			 WHERE organization_id = '${orgId}' AND session_id = '${sessionId}'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.filter_version).toBe(CURRENT_FILTER_VERSION);
		expect(rows[0]?.source).toBe("claude_code");
		// The MV computed real metrics from the content, so this is a genuine MV
		// row rather than a defaulted one.
		expect(rows[0]?.total_interactions).toBe(3);
	}, 120_000);

	test("codex MV propagates the current filter_version source insert into session_analytics", async () => {
		const sessionId = `${testPrefix}_codex_mv_fv3`;
		const fixtureContent = await readFile(
			resolve(import.meta.dir, "fixtures", "codex-session.jsonl"),
			"utf-8",
		);
		await ingestRudelCodexSessions(executor, [
			buildCodexRow(sessionId, {
				filter_version: CURRENT_FILTER_VERSION,
				content: fixtureContent,
			}),
		]);

		const rows = await waitForQuery<{
			filter_version: number;
			source: string;
			input_tokens: string;
		}>(
			executor,
			`SELECT filter_version, source, input_tokens FROM rudel.session_analytics
			 WHERE organization_id = '${orgId}' AND session_id = '${sessionId}'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.filter_version).toBe(CURRENT_FILTER_VERSION);
		expect(rows[0]?.source).toBe("codex");
		// Token count extracted from the fixture's last token_count event proves
		// the MV genuinely processed the content.
		expect(Number(rows[0]?.input_tokens)).toBe(55031);
	}, 120_000);

	test("old-API write post-migration: filterless claude insert flows through the MV as filter_version 0, not NULL", async () => {
		const sessionId = `${testPrefix}_claude_mv_fv0`;
		const { filter_version: _omitted, ...row } = buildClaudeRow(sessionId);
		await insertWithoutFilterVersion("rudel.claude_sessions", row);

		const rows = await waitForQuery<{ filter_version: number | null }>(
			executor,
			`SELECT filter_version FROM rudel.session_analytics
			 WHERE organization_id = '${orgId}' AND session_id = '${sessionId}'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.filter_version).not.toBeNull();
		expect(rows[0]?.filter_version).toBe(0);
	}, 120_000);

	test("ReplacingMergeTree(ingested_at): a later current-version row supersedes the 0 row under FINAL", async () => {
		const sessionId = `${testPrefix}_rmt_upgrade`;
		// session_analytics orders by (organization_id, session_date, session_id)
		// and session_date is content-derived, so a re-filtered upload of the same
		// session lands on the exact same sorting-key tuple. Hold every column
		// equal except the RMT version column (ingested_at) and filter_version.
		const sessionDate = "2026-07-20T09:00:00.000";
		const base = buildAnalyticsRow(sessionId, {
			session_date: sessionDate,
			last_interaction_date: "2026-07-20T09:02:00.000",
		});
		await ingestRudelSessionAnalytics(executor, [
			{ ...base, filter_version: 0, ingested_at: "2026-07-20T09:05:00.000" },
		]);
		await ingestRudelSessionAnalytics(executor, [
			{
				...base,
				filter_version: CURRENT_FILTER_VERSION,
				ingested_at: "2026-07-20T09:06:00.000",
			},
		]);

		// Explicit FINAL: the shared readers elsewhere deliberately have none.
		const rows = await executor.query<{ filter_version: number }>(
			`SELECT filter_version FROM rudel.session_analytics FINAL
			 WHERE organization_id = '${orgId}' AND session_id = '${sessionId}'`,
		);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.filter_version).toBe(CURRENT_FILTER_VERSION);
	}, 120_000);

	test("analytics MV ROW_NUMBER dedupe keeps exactly the latest-ingested_at source row", async () => {
		const sessionId = `${testPrefix}_rownum`;
		// Distinct session_date values put the two source rows on distinct
		// sorting keys, so claude_sessions' ReplacingMergeTree can never
		// background-collapse them: the single winner below can only come from
		// the MV's own ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY
		// ingested_at DESC).
		await ingestRudelClaudeSessions(executor, [
			buildClaudeRow(sessionId, {
				session_date: "2026-07-21T08:00:00.000",
				ingested_at: "2026-07-21T08:10:00.000",
				filter_version: 0,
			}),
		]);
		await ingestRudelClaudeSessions(executor, [
			buildClaudeRow(sessionId, {
				session_date: "2026-07-21T09:00:00.000",
				ingested_at: "2026-07-21T09:10:00.000",
				filter_version: CURRENT_FILTER_VERSION,
			}),
		]);

		const sourceRows = await waitForQuery<{ filter_version: number }>(
			executor,
			`SELECT filter_version FROM rudel.claude_sessions
			 WHERE organization_id = '${orgId}' AND session_id = '${sessionId}'`,
		);
		expect(sourceRows).toHaveLength(2);

		const winners = await waitForQuery<{ filter_version: number }>(
			executor,
			withSessionFilter(CLAUDE_SESSION_ANALYTICS_MV_SQL, {
				organizationId: orgId,
				sessionId,
			}),
		);
		expect(winners).toHaveLength(1);
		expect(winners[0]?.filter_version).toBe(CURRENT_FILTER_VERSION);
	}, 120_000);
});
