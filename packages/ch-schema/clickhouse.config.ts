import { defineConfig } from "@chkit/core";
import { backfill } from "@chkit/plugin-backfill";
import { codegen } from "@chkit/plugin-codegen";
import { obsessiondb } from "@chkit/plugin-obsessiondb";
import { pull } from "@chkit/plugin-pull";

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
		url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
		// Prefer CLICKHOUSE_USERNAME to match apps/api and .env.example; keep
		// CLICKHOUSE_USER as a fallback. The "default" fallback is load-bearing:
		// scripts/dev-local.sh sets no username for the local Docker container.
		username:
			process.env.CLICKHOUSE_USERNAME ??
			process.env.CLICKHOUSE_USER ??
			"default",
		password: process.env.CLICKHOUSE_PASSWORD ?? "",
		database: process.env.CLICKHOUSE_DB ?? "default",
	},
});
