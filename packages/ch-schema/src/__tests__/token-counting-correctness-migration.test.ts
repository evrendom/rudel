import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CLAUDE_SESSION_ANALYTICS_MV_SQL } from "../mv-sql/claude-session-analytics.js";
import { CODEX_SESSION_ANALYTICS_MV_SQL } from "../mv-sql/codex-session-analytics.js";
import {
	ANALYTICS_CONTENT_BYTE_LIMIT,
	ANALYTICS_TRANSCRIPT_LINE_LIMIT,
} from "../mv-sql/counting-correctness.js";

const migration = readFileSync(
	resolve(
		import.meta.dir,
		"../../chx/migrations/20260802120001_token_counting_correctness.sql",
	),
	"utf8",
);

function normalizeSql(sql: string): string {
	return sql.replace(/\s+/gu, " ").trim();
}

function countOccurrences(value: string, search: string): number {
	return value.split(search).length - 1;
}

describe("token counting correctness migration", () => {
	test("ships one synchronized migration for both materialized views", () => {
		const normalizedMigration = normalizeSql(migration);

		expect(
			countOccurrences(
				normalizedMigration,
				normalizeSql(CLAUDE_SESSION_ANALYTICS_MV_SQL),
			),
		).toBe(1);
		expect(
			countOccurrences(
				normalizedMigration,
				normalizeSql(CODEX_SESSION_ANALYTICS_MV_SQL),
			),
		).toBe(1);
		expect(migration).toContain("-- operation-count: 15");
	});

	test("extracts bounded real data and exposes completeness markers", () => {
		for (const sql of [
			CLAUDE_SESSION_ANALYTICS_MV_SQL,
			CODEX_SESSION_ANALYTICS_MV_SQL,
		]) {
			expect(sql).toContain(String(ANALYTICS_CONTENT_BYTE_LIMIT));
			expect(sql).toContain(String(ANALYTICS_TRANSCRIPT_LINE_LIMIT));
			expect(sql).toContain("parseDateTime64BestEffortOrNull");
			expect(sql).toContain("toUInt8(_is_capped) AS is_capped");
			expect(sql).toContain("toUInt8(0) AS stale_extraction");
			expect(sql).not.toContain("if(_is_capped, '', cs.content)");
		}

		expect(CLAUDE_SESSION_ANALYTICS_MV_SQL).toContain(
			"mapValues(cs.subagents)",
		);
		expect(CLAUDE_SESSION_ANALYTICS_MV_SQL).toContain(
			"cache_creation_1h_input_tokens",
		);
		expect(CLAUDE_SESSION_ANALYTICS_MV_SQL).toContain("!= '<synthetic>'");
		expect(CODEX_SESSION_ANALYTICS_MV_SQL).toContain(
			"JSONHas(JSONExtractRaw(x, 'payload'), 'info')",
		);
		expect(CODEX_SESSION_ANALYTICS_MV_SQL).toContain("_segment_end_indices");
	});

	test("preserves expired rows, synchronously replays raw, and guards parity", () => {
		const staleIndex = migration.indexOf(
			"preserve analytics whose raw transcript has expired",
		);
		const createCodexIndex = migration.indexOf(
			"CREATE MATERIALIZED VIEW IF NOT EXISTS rudel.codex_session_analytics_mv",
		);
		const createClaudeIndex = migration.indexOf(
			"CREATE MATERIALIZED VIEW IF NOT EXISTS rudel.session_analytics_mv",
		);
		const propagationIndex = migration.indexOf("sleepEachRow(1)");
		const replayClaudeIndex = migration.indexOf(
			"INSERT INTO rudel.claude_sessions",
		);
		const replayCodexIndex = migration.indexOf(
			"INSERT INTO rudel.codex_sessions",
		);

		expect(staleIndex).toBeGreaterThan(0);
		expect(staleIndex).toBeLessThan(createCodexIndex);
		expect(createCodexIndex).toBeLessThan(createClaudeIndex);
		expect(createClaudeIndex).toBeLessThan(propagationIndex);
		expect(propagationIndex).toBeLessThan(replayClaudeIndex);
		expect(replayClaudeIndex).toBeLessThan(replayCodexIndex);

		expect(countOccurrences(migration, "SETTINGS async_insert=0")).toBe(1);
		expect(countOccurrences(migration, "async_insert=0,")).toBe(2);
		expect(migration).toContain("toUInt8(1)");
		expect(migration).toContain("raw-backed analytics remained stale");
		expect(migration).toContain(
			"cache_creation_5m_input_tokens + cache_creation_1h_input_tokens",
		);
		expect(migration).toContain(
			"manual-precondition: Quiesce all session ingest",
		);
	});
});
