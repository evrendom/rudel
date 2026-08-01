import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
	RudelClaudeSessionsRow,
	RudelCodexSessionsRow,
} from "../generated/chkit-types.js";
import { createTestExecutor } from "./helpers/executor.js";

setDefaultTimeout(300_000);

const MIGRATION = readFileSync(
	resolve(import.meta.dir, "../../chx/migrations/20260730180016_auto.sql"),
	"utf8",
);
const CODEX_CONTENT = readFileSync(
	resolve(import.meta.dir, "fixtures/codex-session.jsonl"),
	"utf8",
);
const RECOVERY_MARKER =
	"-- RECOVERY: If execution stopped after the RENAME, resume here.";
const RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const TEST_DATABASE_PREFIX = `rudel_identity_migration_${RUN_ID}`;
const testDatabases: string[] = [];
const executor = createTestExecutor();

interface DifferenceRow extends Record<string, unknown> {
	difference: string;
	identity_count: string | number;
}

interface SourceSummaryRow {
	source: string;
	identity_count: string | number;
	total_tokens: string | number;
}

interface CappedAnalyticsRow {
	source: string;
	session_id: string;
	session_date_ms: string | number;
	last_interaction_date_ms: string | number;
	total_tokens: string | number;
	total_interactions: string | number;
	actual_duration_min: string | number;
	avg_period_sec: string | number;
	median_period_sec: string | number;
	quick_responses: string | number;
	normal_responses: string | number;
	long_pauses: string | number;
	inference_duration_sec: string | number;
	human_duration_sec: string | number;
}

function createDatabaseName(suffix: string): string {
	const database = `${TEST_DATABASE_PREFIX}_${suffix}`;
	if (!/^[a-zA-Z0-9_]+$/.test(database)) {
		throw new Error(`unsafe ClickHouse test database name: ${database}`);
	}
	testDatabases.push(database);
	return database;
}

function scopeMigrationToDatabase(database: string): string {
	const scopedMigration = MIGRATION.replaceAll(
		"rudel.",
		`${database}.`,
	).replaceAll("database = 'rudel'", `database = '${database}'`);
	if (scopedMigration.includes("rudel.")) {
		throw new Error("migration still references the shared rudel database");
	}
	return scopedMigration;
}

function parseStatements(sql: string): string[] {
	const sqlWithoutComments = sql
		.split("\n")
		.filter((line) => !line.trimStart().startsWith("--"))
		.join("\n");
	const statements: string[] = [];
	let currentStatement = "";
	let insideString = false;

	for (let index = 0; index < sqlWithoutComments.length; index += 1) {
		const character = sqlWithoutComments[index];
		if (character === "'") {
			currentStatement += character;
			if (insideString && sqlWithoutComments[index + 1] === "'") {
				currentStatement += "'";
				index += 1;
				continue;
			}
			insideString = !insideString;
			continue;
		}

		if (character === ";" && !insideString) {
			const statement = currentStatement.trim();
			if (statement.length > 0) statements.push(statement);
			currentStatement = "";
			continue;
		}

		currentStatement += character;
	}

	if (insideString)
		throw new Error("migration contains an unclosed SQL string");
	const finalStatement = currentStatement.trim();
	if (finalStatement.length > 0) statements.push(finalStatement);
	return statements;
}

async function executeStatements(
	statements: readonly string[],
): Promise<Array<Array<Record<string, unknown>>>> {
	const queryResults: Array<Array<Record<string, unknown>>> = [];
	for (const statement of statements) {
		if (statement.startsWith("SELECT")) {
			queryResults.push(
				await executor.query<Record<string, unknown>>(statement),
			);
		} else {
			await executor.execute(statement);
		}
	}
	return queryResults;
}

function requireStatement(
	statements: readonly string[],
	index: number,
): string {
	const statement = statements[index];
	if (!statement) {
		throw new Error(`migration statement ${index} is missing`);
	}
	return statement;
}

async function createPreMigrationTables(database: string): Promise<void> {
	await executor.execute(`CREATE DATABASE ${database}`);
	await executor.execute(
		`CREATE TABLE ${database}.claude_sessions AS rudel.claude_sessions`,
	);
	await executor.execute(
		`CREATE TABLE ${database}.codex_sessions AS rudel.codex_sessions`,
	);
	await executor.execute(`
		CREATE TABLE ${database}.session_analytics
		(
			session_date DateTime64(3, 'UTC') DEFAULT now64(3),
			session_id String,
			organization_id String,
			user_id String,
			source LowCardinality(String) DEFAULT 'claude_code',
			content String DEFAULT '',
			subagents Map(String, String) DEFAULT map(),
			ingested_at DateTime64(3, 'UTC') DEFAULT now64(3)
		)
		ENGINE = ReplacingMergeTree(ingested_at)
		PARTITION BY toYYYYMM(session_date)
		ORDER BY (organization_id, session_date, session_id)
	`);
}

function claudeContent(
	startedAt: string,
	inputTokens: number,
	outputTokens: number,
): string {
	const completedAt = new Date(Date.parse(startedAt) + 30_000).toISOString();
	return [
		JSON.stringify({
			type: "user",
			timestamp: startedAt,
			message: { role: "user", content: "migration rehearsal" },
		}),
		JSON.stringify({
			type: "assistant",
			timestamp: completedAt,
			message: {
				id: `msg_${inputTokens}_${outputTokens}`,
				model: "claude-sonnet-4-5",
				usage: {
					input_tokens: inputTokens,
					output_tokens: outputTokens,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: 0,
				},
			},
		}),
	].join("\n");
}

function overLineLimitContent(...meaningfulLines: string[]): string {
	return [
		...meaningfulLines,
		...Array.from({ length: 2_000 }, () => "{}"),
	].join("\n");
}

function overByteLimitContent(content: string): string {
	return [content, "x".repeat(20_000_000)].join("\n");
}

function buildClaudeRow(
	sessionId: string,
	organizationId: string,
	userId: string,
	sessionDate: string,
	ingestedAt: string,
	content: string,
): RudelClaudeSessionsRow {
	return {
		session_date: sessionDate,
		last_interaction_date: sessionDate,
		session_id: sessionId,
		organization_id: organizationId,
		project_path: `/test/${organizationId}`,
		git_remote: "",
		package_name: "migration-rehearsal",
		package_type: "package.json",
		content,
		filter_version: 5,
		ingested_at: ingestedAt,
		user_id: userId,
		git_branch: "main",
		git_sha: null,
		tag: "identity-migration-rehearsal",
		subagents: {},
	};
}

function buildCodexRow(
	sessionId: string,
	organizationId: string,
	userId: string,
	content = CODEX_CONTENT,
	ingestedAt = "2026-03-02T06:37:00.000",
): RudelCodexSessionsRow {
	return {
		session_date: "2026-03-02T04:29:38.576",
		last_interaction_date: "2026-03-02T06:36:38.201",
		session_id: sessionId,
		organization_id: organizationId,
		project_path: `/test/${organizationId}`,
		git_remote: "",
		package_name: "migration-rehearsal",
		package_type: "package.json",
		content,
		filter_version: 5,
		ingested_at: ingestedAt,
		user_id: userId,
		git_branch: "main",
		git_sha: null,
		tag: "identity-migration-rehearsal",
	};
}

async function seedMessyRawData(database: string): Promise<void> {
	const correctedSessionId = `${RUN_ID}_corrected`;
	const sharedSessionId = `${RUN_ID}_shared`;
	const cappedClaudeSessionId = `${RUN_ID}_capped_claude`;
	const cappedCodexSessionId = `${RUN_ID}_capped_codex`;

	await executor.insert({
		table: `${database}.claude_sessions`,
		values: [
			buildClaudeRow(
				correctedSessionId,
				"org_a",
				"user_a",
				"2026-01-31T23:59:00.000",
				"2026-01-31T23:59:30.000",
				claudeContent("2026-01-31T23:59:00.000Z", 100, 20),
			),
		],
	});
	await executor.insert({
		table: `${database}.claude_sessions`,
		values: [
			buildClaudeRow(
				correctedSessionId,
				"org_a",
				"user_a",
				"2026-02-01T00:01:00.000",
				"2026-02-01T00:01:30.000",
				claudeContent("2026-02-01T00:01:00.000Z", 200, 40),
			),
		],
	});
	await executor.insert({
		table: `${database}.claude_sessions`,
		values: [
			buildClaudeRow(
				sharedSessionId,
				"org_a",
				"user_a",
				"2026-04-01T10:00:00.000",
				"2026-04-01T10:01:00.000",
				claudeContent("2026-04-01T10:00:00.000Z", 300, 50),
			),
			buildClaudeRow(
				sharedSessionId,
				"org_b",
				"user_b",
				"2026-04-01T10:00:00.000",
				"2026-04-01T10:01:00.000",
				claudeContent("2026-04-01T10:00:00.000Z", 400, 60),
			),
			buildClaudeRow(
				cappedClaudeSessionId,
				"org_capped",
				"user_capped",
				"2026-05-01T10:00:00.000",
				"2026-05-01T10:05:00.000",
				overLineLimitContent(
					claudeContent("2026-05-01T10:00:00.000Z", 900, 100),
				),
			),
		],
	});
	await executor.insert({
		table: `${database}.codex_sessions`,
		values: [
			buildCodexRow(sharedSessionId, "org_a", "user_a"),
			buildCodexRow(
				cappedCodexSessionId,
				"org_capped",
				"user_capped",
				overByteLimitContent(CODEX_CONTENT),
				"2026-05-01T10:06:00.000",
			),
		],
	});
}

async function readSourceSummaries(
	database: string,
): Promise<SourceSummaryRow[]> {
	return executor.query<SourceSummaryRow>(`
		SELECT source, count() AS identity_count, sum(total_tokens) AS total_tokens
		FROM ${database}.session_analytics FINAL
		GROUP BY source
		ORDER BY source
	`);
}

async function readRawIdentityCount(
	database: string,
	table: "claude_sessions" | "codex_sessions",
): Promise<number> {
	const rows = await executor.query<{ identity_count: string | number }>(`
		SELECT uniqExact(tuple(organization_id, user_id, session_id)) AS identity_count
		FROM ${database}.${table}
	`);
	return Number(rows[0]?.identity_count ?? 0);
}

afterAll(async () => {
	for (const database of testDatabases) {
		await executor.execute(`DROP DATABASE IF EXISTS ${database} SYNC`);
	}
});

describe("session_analytics populated migration rehearsal", () => {
	test("analytics-only identities abort before the migration changes anything", async () => {
		const database = createDatabaseName("analytics_guard");
		await createPreMigrationTables(database);
		await executor.insert({
			table: `${database}.session_analytics`,
			values: [
				{
					session_date: "2026-01-01T00:00:00.000",
					session_id: "analytics_only",
					organization_id: "org_guard",
					user_id: "user_guard",
					source: "claude_code",
					content: "must not be discarded",
					subagents: {},
					ingested_at: "2026-01-01T00:01:00.000",
				},
			],
		});

		const statements = parseStatements(scopeMigrationToDatabase(database));
		await expect(
			executor.query(requireStatement(statements, 0)),
		).rejects.toThrow("analytics-only session identities exist");

		const tables = await executor.query<{ name: string }>(`
			SELECT name FROM system.tables
			WHERE database = '${database}'
			ORDER BY name
		`);
		expect(tables.map(({ name }) => name)).toEqual([
			"claude_sessions",
			"codex_sessions",
			"session_analytics",
		]);
	}, 120_000);

	test("an existing backup table aborts before the shadow table is created", async () => {
		const database = createDatabaseName("backup_guard");
		await createPreMigrationTables(database);
		await executor.execute(
			`CREATE TABLE ${database}.session_analytics_pre_identity_20260730 AS ${database}.session_analytics`,
		);

		const statements = parseStatements(scopeMigrationToDatabase(database));
		await executor.query(requireStatement(statements, 0));
		await expect(
			executor.query(requireStatement(statements, 1)),
		).rejects.toThrow(
			"session_analytics rebuild aborted: backup table already exists; inspect cutover state and resume at the RECOVERY marker if the rename completed",
		);

		const shadowCount = await executor.query<{ table_count: string | number }>(`
			SELECT count() AS table_count FROM system.tables
			WHERE database = '${database}' AND name = 'session_analytics_v2'
		`);
		expect(Number(shadowCount[0]?.table_count ?? 0)).toBe(0);
	}, 120_000);

	test("rebuilds populated duplicates and collisions from canonical raw identities", async () => {
		const database = createDatabaseName("full_rebuild");
		await createPreMigrationTables(database);
		await seedMessyRawData(database);

		const queryResults = await executeStatements(
			parseStatements(scopeMigrationToDatabase(database)),
		);
		const differenceRows = queryResults
			.flat()
			.filter(
				(row): row is DifferenceRow =>
					typeof row.difference === "string" &&
					(row.difference === "old_only_identity" ||
						row.difference === "new_only_identity"),
			);

		expect(
			differenceRows.map((row) => ({
				difference: row.difference,
				identity_count: Number(row.identity_count),
			})),
		).toEqual([{ difference: "new_only_identity", identity_count: 6 }]);

		const summaries = await readSourceSummaries(database);
		expect(
			summaries.map((row) => ({
				source: row.source,
				identity_count: Number(row.identity_count),
				total_tokens: Number(row.total_tokens),
			})),
		).toEqual([
			{ source: "claude_code", identity_count: 4, total_tokens: 1050 },
			{ source: "codex", identity_count: 2, total_tokens: 55459 },
		]);
		expect(Number(summaries[0]?.identity_count ?? 0)).toBe(
			await readRawIdentityCount(database, "claude_sessions"),
		);
		expect(Number(summaries[1]?.identity_count ?? 0)).toBe(
			await readRawIdentityCount(database, "codex_sessions"),
		);

		const correctedRows = await executor.query<{
			session_date_ms: string | number;
			total_tokens: string | number;
		}>(`
			SELECT toUnixTimestamp64Milli(session_date) AS session_date_ms, total_tokens
			FROM ${database}.session_analytics FINAL
			WHERE source = 'claude_code'
			  AND organization_id = 'org_a'
			  AND user_id = 'user_a'
			  AND session_id = '${RUN_ID}_corrected'
		`);
		expect(correctedRows).toHaveLength(1);
		expect(Number(correctedRows[0]?.session_date_ms)).toBe(
			Date.parse("2026-02-01T00:01:00.000Z"),
		);
		expect(Number(correctedRows[0]?.total_tokens)).toBe(240);

		const cappedRows = await executor.query<CappedAnalyticsRow>(`
			SELECT
				source,
				session_id,
				toUnixTimestamp64Milli(session_date) AS session_date_ms,
				toUnixTimestamp64Milli(last_interaction_date) AS last_interaction_date_ms,
				total_tokens,
				total_interactions,
				actual_duration_min,
				avg_period_sec,
				median_period_sec,
				quick_responses,
				normal_responses,
				long_pauses,
				inference_duration_sec,
				human_duration_sec
			FROM ${database}.session_analytics FINAL
			WHERE organization_id = 'org_capped'
			ORDER BY source
		`);
		expect(cappedRows).toHaveLength(2);
		expect(
			cappedRows.map((row) => ({
				source: row.source,
				sessionId: row.session_id,
				sessionDate: Number(row.session_date_ms),
				lastInteractionDate: Number(row.last_interaction_date_ms),
				totalTokens: Number(row.total_tokens),
				totalInteractions: Number(row.total_interactions),
				actualDurationMin: Number(row.actual_duration_min),
				avgPeriodSec: Number(row.avg_period_sec),
				medianPeriodSec: Number(row.median_period_sec),
				quickResponses: Number(row.quick_responses),
				normalResponses: Number(row.normal_responses),
				longPauses: Number(row.long_pauses),
				inferenceDurationSec: Number(row.inference_duration_sec),
				humanDurationSec: Number(row.human_duration_sec),
			})),
		).toEqual([
			{
				source: "claude_code",
				sessionId: `${RUN_ID}_capped_claude`,
				sessionDate: Date.parse("2026-05-01T10:00:00.000Z"),
				lastInteractionDate: Date.parse("2026-05-01T10:00:00.000Z"),
				totalTokens: 0,
				totalInteractions: 0,
				actualDurationMin: 0,
				avgPeriodSec: 0,
				medianPeriodSec: 0,
				quickResponses: 0,
				normalResponses: 0,
				longPauses: 0,
				inferenceDurationSec: 0,
				humanDurationSec: 0,
			},
			{
				source: "codex",
				sessionId: `${RUN_ID}_capped_codex`,
				sessionDate: Date.parse("2026-03-02T04:29:38.576Z"),
				lastInteractionDate: Date.parse("2026-03-02T06:36:38.201Z"),
				totalTokens: 0,
				totalInteractions: 0,
				actualDurationMin: 0,
				avgPeriodSec: 0,
				medianPeriodSec: 0,
				quickResponses: 0,
				normalResponses: 0,
				longPauses: 0,
				inferenceDurationSec: 0,
				humanDurationSec: 0,
			},
		]);

		const transcriptColumns = await executor.query<{ name: string }>(`
			SELECT name FROM system.columns
			WHERE database = '${database}'
			  AND table = 'session_analytics'
			  AND name IN ('content', 'subagents')
		`);
		expect(transcriptColumns).toEqual([]);
	}, 300_000);

	test("the recovery tail is idempotent after the atomic rename", async () => {
		const database = createDatabaseName("recovery");
		await createPreMigrationTables(database);
		await seedMessyRawData(database);

		const scopedMigration = scopeMigrationToDatabase(database);
		const recoveryMarkerIndex = scopedMigration.indexOf(RECOVERY_MARKER);
		if (recoveryMarkerIndex < 0) {
			throw new Error("migration recovery marker is missing");
		}
		const recoveryMarkerLineEnd = scopedMigration.indexOf(
			"\n",
			recoveryMarkerIndex,
		);
		if (recoveryMarkerLineEnd < 0) {
			throw new Error("migration recovery marker line is incomplete");
		}
		const beforeRecovery = scopedMigration.slice(0, recoveryMarkerIndex);
		const recoveryTail = scopedMigration.slice(recoveryMarkerLineEnd + 1);

		await executeStatements(parseStatements(beforeRecovery));

		const cutoverTables = await executor.query<{ name: string }>(`
			SELECT name FROM system.tables
			WHERE database = '${database}'
			  AND name IN (
				'session_analytics',
				'session_analytics_pre_identity_20260730',
				'session_analytics_v2',
				'session_analytics_mv',
				'codex_session_analytics_mv'
			  )
			ORDER BY name
		`);
		expect(cutoverTables.map(({ name }) => name)).toEqual([
			"session_analytics",
			"session_analytics_pre_identity_20260730",
		]);

		const tailStatements = parseStatements(recoveryTail);
		await executeStatements(tailStatements);
		await executeStatements(tailStatements);

		const recoveryObjects = await executor.query<{ name: string }>(`
			SELECT name FROM system.tables
			WHERE database = '${database}'
			  AND name IN (
				'session_analytics',
				'session_analytics_pre_identity_20260730',
				'session_analytics_mv',
				'codex_session_analytics_mv'
			  )
			ORDER BY name
		`);
		expect(recoveryObjects.map(({ name }) => name)).toEqual([
			"codex_session_analytics_mv",
			"session_analytics",
			"session_analytics_mv",
			"session_analytics_pre_identity_20260730",
		]);

		const backupColumn = await executor.query<{
			column_count: string | number;
		}>(`
			SELECT count() AS column_count FROM system.columns
			WHERE database = '${database}'
			  AND table = 'session_analytics_pre_identity_20260730'
			  AND name = '_backup_expires_at'
		`);
		expect(Number(backupColumn[0]?.column_count ?? 0)).toBe(1);

		const createTableRows = await executor.query<{ statement: string }>(
			`SHOW CREATE TABLE ${database}.session_analytics_pre_identity_20260730`,
		);
		expect(createTableRows[0]?.statement).toContain(
			"\nTTL _backup_expires_at\n",
		);
	}, 300_000);
});
