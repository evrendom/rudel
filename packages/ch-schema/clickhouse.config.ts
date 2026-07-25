import { defineConfig } from "@chkit/core";
import { backfill } from "@chkit/plugin-backfill";
import { codegen } from "@chkit/plugin-codegen";
import { obsessiondb } from "@chkit/plugin-obsessiondb";
import { pull } from "@chkit/plugin-pull";
import { resolveClickHouseUsername } from "./src/clickhouse-connection.js";

const clickhouseUrl = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";

export default defineConfig({
	schema: "./src/db/schema/**/*.ts",
	outDir: "./chx",
	migrationsDir: "./chx/migrations",
	metaDir: "./chx/meta",
	plugins: [
		pull(),
		obsessiondb(),
		codegen({ emitZod: true, emitIngest: true }),
		backfill({
			defaults: {
				timeColumn: "session_date",
			},
		}),
	],
	clickhouse: {
		url: clickhouseUrl,
		// Prefers CLICKHOUSE_USERNAME to match apps/api and .env.example, and
		// assumes the `default` superuser only for a local endpoint. Throws rather
		// than falling back to `default` against a remote one.
		username: resolveClickHouseUsername(process.env, clickhouseUrl),
		password: process.env.CLICKHOUSE_PASSWORD ?? "",
		database: process.env.CLICKHOUSE_DB ?? "default",
	},
});
