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
const MIGRATION_LOCK_ID = 684214901;

console.log("Running migrations...");
await sql`SELECT pg_advisory_lock(${MIGRATION_LOCK_ID})`;

try {
	await migrate(db, { migrationsFolder });
	console.log("Migrations applied successfully.");
} finally {
	await sql`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
}

await sql.end();
