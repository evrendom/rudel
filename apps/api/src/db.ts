import * as schema from "@rudel/sql-schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.PG_CONNECTION_STRING;
if (!connectionString) {
	throw new Error("PG_CONNECTION_STRING environment variable is required");
}

export const sqlClient = postgres(connectionString);
export const db = drizzle(sqlClient, { schema });
