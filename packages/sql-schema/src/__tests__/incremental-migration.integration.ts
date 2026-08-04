import { expect, setDefaultTimeout, test } from "bun:test";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const MIGRATION_0019_TIMESTAMP = "1785426102000";
const MIGRATION_0022_TIMESTAMP = "1785772800000";
const migrationsFolder = join(import.meta.dir, "..", "..", "db", "migrations");

setDefaultTimeout(120_000);

test("applies migrations 0020-0022 to a database already migrated through 0019", async () => {
	const connectionString = getPostgresConnectionString();
	const databaseName = `rudel_migration_${Date.now()}_${crypto.randomUUID().replaceAll("-", "")}`;
	const migrationsThrough0019 = await createMigrationsThrough0019();
	const adminSql = postgres(connectionString, { max: 1 });

	try {
		await adminSql.unsafe(`CREATE DATABASE "${databaseName}"`);
		const databaseUrl = new URL(connectionString);
		databaseUrl.pathname = `/${databaseName}`;
		const migrationSql = postgres(databaseUrl.toString(), { max: 1 });

		try {
			const database = drizzle(migrationSql);
			await migrate(database, { migrationsFolder: migrationsThrough0019 });

			const [before0020] = await migrationSql<MigrationState[]>`
				SELECT
					COUNT(*)::int AS count,
					MAX(created_at)::text AS "latestTimestamp"
				FROM drizzle.__drizzle_migrations
			`;
			const [tableBefore0020] = await migrationSql<TableState[]>`
				SELECT to_regclass('public.clickhouse_purge_job')::text AS name
			`;
			expect(before0020).toEqual({
				count: 20,
				latestTimestamp: MIGRATION_0019_TIMESTAMP,
			});
			expect(tableBefore0020?.name).toBeNull();

			await migrate(database, { migrationsFolder });

			const [after0022] = await migrationSql<MigrationState[]>`
				SELECT
					COUNT(*)::int AS count,
					MAX(created_at)::text AS "latestTimestamp"
				FROM drizzle.__drizzle_migrations
			`;
			const [tableAfter0020] = await migrationSql<TableState[]>`
				SELECT to_regclass('public.clickhouse_purge_job')::text AS name
			`;
			expect(after0022).toEqual({
				count: 23,
				latestTimestamp: MIGRATION_0022_TIMESTAMP,
			});
			expect(tableAfter0020?.name).toBe("clickhouse_purge_job");
			const shapeColumns = await migrationSql<Array<{ name: string }>>`
				SELECT column_name AS name
				FROM information_schema.columns
				WHERE table_schema = 'public'
					AND table_name = 'session_ownership'
					AND column_name IN (
						'last_content_bytes',
						'last_assistant_line_count',
						'last_content_shape_json',
						'last_filter_version',
						'last_session_date'
					)
				ORDER BY column_name
			`;
			expect([...shapeColumns]).toEqual([
				{ name: "last_assistant_line_count" },
				{ name: "last_content_bytes" },
				{ name: "last_content_shape_json" },
				{ name: "last_filter_version" },
				{ name: "last_session_date" },
			]);
		} finally {
			await migrationSql.end();
		}
	} finally {
		await adminSql.unsafe(
			`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
		);
		await adminSql.end();
		await rm(migrationsThrough0019, { force: true, recursive: true });
	}
});

interface MigrationJournalEntry {
	breakpoints: boolean;
	idx: number;
	tag: string;
	version: string;
	when: number;
}

interface MigrationState {
	count: number;
	latestTimestamp: string;
}

interface TableState {
	name: string | null;
}

async function createMigrationsThrough0019(): Promise<string> {
	const journalValue: unknown = JSON.parse(
		await readFile(join(migrationsFolder, "meta", "_journal.json"), "utf8"),
	);
	const entries = readMigrationEntries(journalValue).filter(
		(entry) => entry.idx <= 19,
	);
	if (
		entries.length !== 20 ||
		entries.at(-1)?.tag !== "0019_wrapped_share_social_image"
	) {
		throw new Error("Expected migrations 0000 through 0019");
	}

	const temporaryFolder = await mkdtemp(
		join(tmpdir(), "rudel-migrations-through-0019-"),
	);
	await mkdir(join(temporaryFolder, "meta"));
	for (const entry of entries) {
		await copyFile(
			join(migrationsFolder, `${entry.tag}.sql`),
			join(temporaryFolder, `${entry.tag}.sql`),
		);
	}
	await writeFile(
		join(temporaryFolder, "meta", "_journal.json"),
		`${JSON.stringify({ dialect: "postgresql", entries, version: "7" }, null, "\t")}\n`,
	);
	return temporaryFolder;
}

function readMigrationEntries(value: unknown): MigrationJournalEntry[] {
	if (
		typeof value !== "object" ||
		value === null ||
		!("entries" in value) ||
		!Array.isArray(value.entries) ||
		!value.entries.every(isMigrationJournalEntry)
	) {
		throw new Error("Invalid Drizzle migration journal");
	}
	return value.entries;
}

function isMigrationJournalEntry(
	value: unknown,
): value is MigrationJournalEntry {
	return (
		typeof value === "object" &&
		value !== null &&
		"breakpoints" in value &&
		typeof value.breakpoints === "boolean" &&
		"idx" in value &&
		typeof value.idx === "number" &&
		"tag" in value &&
		typeof value.tag === "string" &&
		"version" in value &&
		typeof value.version === "string" &&
		"when" in value &&
		typeof value.when === "number"
	);
}

function getPostgresConnectionString(): string {
	const connectionString = process.env.PG_CONNECTION_STRING;
	if (!connectionString) {
		throw new Error("PG_CONNECTION_STRING is required for integration tests");
	}
	return connectionString;
}
