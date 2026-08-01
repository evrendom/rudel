import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CLAUDE_SESSION_ANALYTICS_MV_SQL } from "../mv-sql/claude-session-analytics.js";
import { CODEX_SESSION_ANALYTICS_MV_SQL } from "../mv-sql/codex-session-analytics.js";

const migration = readFileSync(
	resolve(import.meta.dir, "../../chx/migrations/20260730180016_auto.sql"),
	"utf8",
);

function normalizeSql(sql: string): string {
	return sql.replace(/\s+/g, " ").trim();
}

function countOccurrences(value: string, search: string): number {
	return value.split(search).length - 1;
}

describe("session_analytics identity migration", () => {
	test("keeps deployed MVs synchronized and rebuild deduplication narrow", () => {
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

		expect(countOccurrences(normalizedMigration, "ROW_NUMBER() OVER")).toBe(2);
		expect(countOccurrences(normalizedMigration, "INNER ANY JOIN")).toBe(32);
		expect(normalizedMigration).toContain(
			normalizeSql(`
FROM rudel.claude_sessions AS cs
INNER ANY JOIN
(
  SELECT organization_id, user_id, session_id, max(ingested_at) AS ingested_at
  FROM rudel.claude_sessions
  GROUP BY organization_id, user_id, session_id
) AS latest
USING (organization_id, user_id, session_id, ingested_at)`),
		);
		expect(normalizedMigration).toContain(
			normalizeSql(`
FROM rudel.codex_sessions AS cs
INNER ANY JOIN
(
  SELECT organization_id, user_id, session_id, max(ingested_at) AS ingested_at
  FROM rudel.codex_sessions
  GROUP BY organization_id, user_id, session_id
) AS latest
USING (organization_id, user_id, session_id, ingested_at)`),
		);
	});

	test("rebuilds in resumable session-month chunks", () => {
		const normalizedMigration = normalizeSql(migration);

		expect(migration).toContain(
			"CREATE TABLE IF NOT EXISTS rudel.session_analytics_v2",
		);
		expect(migration).not.toContain(
			"DROP TABLE IF EXISTS rudel.session_analytics_v2",
		);
		expect(
			countOccurrences(
				normalizedMigration,
				"INSERT INTO rudel.session_analytics_v2",
			),
		).toBe(32);
		expect(countOccurrences(normalizedMigration, "max_block_size=64")).toBe(32);
		expect(
			countOccurrences(
				normalizedMigration,
				"SELECT count() FROM rudel.session_analytics_v2 WHERE source =",
			),
		).toBe(32);
		expect(
			countOccurrences(normalizedMigration, "source = 'claude_code'"),
		).toBe(16);
		expect(countOccurrences(normalizedMigration, "source = 'codex'")).toBe(16);
		expect(migration).toContain(
			"DROP PARTITION would discard the entire unpartitioned shadow",
		);
	});

	test("caps the line-array pipeline by transcript bytes and lines", () => {
		const normalizedMigration = normalizeSql(migration);
		const cap = normalizeSql(`
(
  length(cs.content) > 120000000
  OR countSubstrings(cs.content, '\\n') > 8000
) AS _is_capped`);

		expect(countOccurrences(normalizedMigration, cap)).toBe(34);
		expect(
			countOccurrences(
				normalizedMigration,
				"if(_is_capped, '', cs.content) AS _line_safe_content",
			),
		).toBe(34);
	});

	test("checks physical shadow rows for duplicate identities before cutover", () => {
		const duplicateGuard = `
SELECT throwIf(
  count() != uniqExact(tuple(source, organization_id, user_id, session_id)),
  'session_analytics rebuild aborted: duplicate full identities in shadow table'
)
FROM rudel.session_analytics_v2;`;

		expect(migration).toContain(duplicateGuard);
		expect(migration.indexOf(duplicateGuard)).toBeLessThan(
			migration.indexOf(
				"DROP TABLE IF EXISTS rudel.codex_session_analytics_mv SYNC;",
			),
		);
	});

	test("marks an idempotent recovery tail immediately after the atomic rename", () => {
		const rename = "RENAME TABLE\n  rudel.session_analytics TO";
		const recoveryMarker =
			"-- RECOVERY: If execution stopped after the RENAME, resume here.";

		expect(migration.indexOf(recoveryMarker)).toBeGreaterThan(
			migration.indexOf(rename),
		);
		expect(migration).toContain(
			"ADD COLUMN IF NOT EXISTS `_backup_expires_at`",
		);
		expect(migration).toContain(
			"CREATE MATERIALIZED VIEW IF NOT EXISTS rudel.codex_session_analytics_mv",
		);
		expect(migration).toContain(
			"CREATE MATERIALIZED VIEW IF NOT EXISTS rudel.session_analytics_mv",
		);
	});
});
