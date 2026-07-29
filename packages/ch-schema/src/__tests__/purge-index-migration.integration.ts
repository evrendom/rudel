import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createTestExecutor } from "./helpers/executor.js";

const DATABASE = `purge_migration_${crypto.randomUUID().replaceAll("-", "")}`;
const ROW_COUNT = 131_072;
const ROWS_PER_GROUP = 8_192;
const executor = createTestExecutor();
const migrationSql = readFileSync(
	new URL("../../chx/migrations/20260729115801_auto.sql", import.meta.url),
	"utf8",
);
const migrationStatements = migrationSql
	.split("\n")
	.map((line) => line.trim())
	.filter((line) => line.startsWith("ALTER TABLE "))
	.map((line) => line.replaceAll("rudel.", `${DATABASE}.`));

setDefaultTimeout(120_000);

afterAll(async () => {
	await executor.execute(`DROP DATABASE IF EXISTS ${DATABASE} SYNC`);
	await executor.close();
});

describe("purge index migration", () => {
	test("materializes pruning indexes on existing primary-key-less data and is idempotent", async () => {
		await executor.execute(`CREATE DATABASE ${DATABASE}`);
		for (const table of ["claude_sessions", "codex_sessions"]) {
			await executor.execute(`
				CREATE TABLE ${DATABASE}.${table} (
					session_date DateTime64(3, 'UTC'),
					session_id String,
					organization_id String,
					user_id String,
					ingested_at DateTime64(3, 'UTC')
				)
				ENGINE = ReplacingMergeTree(ingested_at)
				PRIMARY KEY tuple()
				ORDER BY (organization_id, session_date, session_id)
				SETTINGS index_granularity = ${ROWS_PER_GROUP}
			`);
		}
		await executor.execute(`
			CREATE TABLE ${DATABASE}.session_analytics (
				session_date DateTime64(3, 'UTC'),
				session_id String,
				organization_id String,
				user_id String,
				ingested_at DateTime64(3, 'UTC'),
				INDEX idx_user_id user_id TYPE set(0) GRANULARITY 4
			)
			ENGINE = ReplacingMergeTree(ingested_at)
			PRIMARY KEY tuple()
			ORDER BY (organization_id, session_date, session_id)
			SETTINGS index_granularity = ${ROWS_PER_GROUP}
		`);
		await executor.execute(`
			CREATE TABLE ${DATABASE}.wrapped_user_archetype_snapshots_v1 (
				snapshot_id String,
				snapshot_created_at DateTime64(3, 'UTC'),
				organization_id String,
				user_id String
			)
			ENGINE = MergeTree
			PRIMARY KEY tuple()
			ORDER BY (snapshot_id, organization_id, user_id)
			SETTINGS index_granularity = ${ROWS_PER_GROUP}
		`);

		for (const table of [
			"claude_sessions",
			"codex_sessions",
			"session_analytics",
		]) {
			await executor.execute(`
				INSERT INTO ${DATABASE}.${table}
				SELECT
					now64(3),
					concat('session_', leftPad(toString(number), 8, '0')),
					concat(
						'org_',
						leftPad(toString(intDiv(number, ${ROWS_PER_GROUP})), 4, '0')
					),
					concat(
						'user_',
						leftPad(toString(intDiv(number, ${ROWS_PER_GROUP})), 4, '0')
					),
					now64(3)
				FROM numbers(${ROW_COUNT})
			`);
		}
		await executor.execute(`
			INSERT INTO ${DATABASE}.wrapped_user_archetype_snapshots_v1
			SELECT
				concat(
					leftPad(toString(intDiv(number, ${ROWS_PER_GROUP})), 4, '0'),
					'_',
					leftPad(toString(number), 8, '0')
				),
				now64(3),
				concat(
					'org_',
					leftPad(toString(intDiv(number, ${ROWS_PER_GROUP})), 4, '0')
				),
				concat(
					'user_',
					leftPad(toString(intDiv(number, ${ROWS_PER_GROUP})), 4, '0')
				)
			FROM numbers(${ROW_COUNT})
		`);

		expect(migrationStatements).toHaveLength(17);
		for (const statement of migrationStatements) {
			await executor.execute(statement);
		}
		for (const statement of migrationStatements) {
			await executor.execute(statement);
		}

		const indexes = await executor.query<{
			name: string;
			table: string;
			type: string;
		}>(`
			SELECT table, name, type
			FROM system.data_skipping_indices
			WHERE database = '${DATABASE}'
				AND startsWith(name, 'idx_purge_')
			ORDER BY table, name
		`);
		expect(indexes).toHaveLength(8);
		expect(indexes.every((index) => index.type === "bloom_filter")).toBe(true);

		for (const table of [
			"claude_sessions",
			"codex_sessions",
			"session_analytics",
			"wrapped_user_archetype_snapshots_v1",
		]) {
			const organizationExplain = await explain(
				table,
				"organization_id",
				"org_0007",
			);
			const userExplain = await explain(table, "user_id", "user_0008");
			expectSkipIndexPrunes(
				organizationExplain,
				"Name: idx_purge_organization_id",
			);
			expectSkipIndexPrunes(userExplain, "Name: idx_purge_user_id");
		}
	});
});

async function explain(
	table: string,
	column: "organization_id" | "user_id",
	value: string,
): Promise<string> {
	const rows = await executor.query<{ explain: string }>(`
		EXPLAIN indexes = 1
		SELECT 1
		FROM ${DATABASE}.${table}
		WHERE ${column} = '${value}'
		LIMIT 1
	`);
	return rows.map((row) => row.explain).join("\n");
}

function expectSkipIndexPrunes(explain: string, indexNameLine: string): void {
	const indexStart = explain.indexOf(indexNameLine);
	expect(indexStart).toBeGreaterThanOrEqual(0);
	const granules = explain.slice(indexStart).match(/Granules: (\d+)\/(\d+)/);
	expect(granules).not.toBeNull();
	expect(Number(granules?.[1])).toBeLessThan(Number(granules?.[2]));
}
