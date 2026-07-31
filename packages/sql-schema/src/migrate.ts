import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const connectionString = process.env.PG_CONNECTION_STRING;
if (!connectionString) {
	throw new Error("PG_CONNECTION_STRING environment variable is required");
}

const sql = postgres(connectionString, { max: 1 });
const db = drizzle(sql);

const migrationsFolder = join(import.meta.dir, "..", "db", "migrations");
const REQUIRED_OWNERSHIP_MIGRATIONS = [
	{ createdAt: "1777929079000", tag: "0012_yc_review_sessions" },
	{ createdAt: "1784808255000", tag: "0013_remove_yc_review_sessions" },
	{ createdAt: "1784824445931", tag: "0014_session_ownership" },
	{ createdAt: "1784824638910", tag: "0015_session_ownership_user_index" },
	{ createdAt: "1784832000000", tag: "0016_session_ownership_backfill_state" },
] as const;

try {
	await assertOwnershipSchemaDoesNotLeadMigrationHistory();

	console.log("Running migrations...");
	await migrate(db, { migrationsFolder });
	await assertRequiredOwnershipMigrationsAreRecorded();
	console.log("Migrations applied and ownership history verified.");
} finally {
	await sql.end();
}

async function assertOwnershipSchemaDoesNotLeadMigrationHistory(): Promise<void> {
	const recordedMigrations = await getRecordedMigrationTimestamps();
	const [artifacts] = await sql<
		Array<{
			ownership_backfill_state_table: boolean;
			ownership_table: boolean;
			ownership_user_index: boolean;
			yc_review_column: boolean;
		}>
	>`
		SELECT
			to_regclass('public.session_ownership') IS NOT NULL
				AS ownership_table,
			to_regclass('public.session_ownership_user_id_idx') IS NOT NULL
				AS ownership_user_index,
			to_regclass('public.session_ownership_backfill_state') IS NOT NULL
				AS ownership_backfill_state_table,
			EXISTS (
				SELECT 1
				FROM information_schema.columns
				WHERE table_schema = 'public'
					AND table_name = 'session'
					AND column_name = 'yc_review'
			) AS yc_review_column
	`;
	if (!artifacts) {
		throw new Error("Could not inspect the ownership migration artifacts.");
	}

	const driftChecks = [
		{
			artifactExists: artifacts.yc_review_column,
			migration: REQUIRED_OWNERSHIP_MIGRATIONS[0],
		},
		{
			artifactExists: artifacts.ownership_table,
			migration: REQUIRED_OWNERSHIP_MIGRATIONS[2],
		},
		{
			artifactExists: artifacts.ownership_user_index,
			migration: REQUIRED_OWNERSHIP_MIGRATIONS[3],
		},
		{
			artifactExists: artifacts.ownership_backfill_state_table,
			migration: REQUIRED_OWNERSHIP_MIGRATIONS[4],
		},
	];

	for (const check of driftChecks) {
		if (
			check.artifactExists &&
			!recordedMigrations.has(check.migration.createdAt)
		) {
			throw new Error(
				`Database schema contains ${check.migration.tag} artifacts, but drizzle.__drizzle_migrations does not record that migration. Refusing to replay migrations over a schema-ahead watermark.`,
			);
		}
	}
}

async function assertRequiredOwnershipMigrationsAreRecorded(): Promise<void> {
	const recordedMigrations = await getRecordedMigrationTimestamps();
	const missingMigrations = REQUIRED_OWNERSHIP_MIGRATIONS.filter(
		(migration) => !recordedMigrations.has(migration.createdAt),
	);
	if (missingMigrations.length === 0) {
		return;
	}

	throw new Error(
		`Ownership migration verification failed. Missing journal entries: ${missingMigrations.map((migration) => migration.tag).join(", ")}.`,
	);
}

async function getRecordedMigrationTimestamps(): Promise<Set<string>> {
	const [migrationTable] = await sql<Array<{ exists: boolean }>>`
		SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists
	`;
	if (!migrationTable?.exists) {
		return new Set();
	}

	const rows = await sql<Array<{ created_at: string }>>`
		SELECT created_at::text
		FROM drizzle.__drizzle_migrations
	`;
	return new Set(rows.map((row) => row.created_at));
}
