import { defineConfig } from "@chkit/core";
import { backfill } from "@chkit/plugin-backfill";
import { obsessiondb } from "@chkit/plugin-obsessiondb";

export default defineConfig({
	schema: "./src/db/schema/session-analytics.ts",
	outDir: "./chx",
	migrationsDir: "./chx/migrations",
	metaDir: "./chx/meta",
	plugins: [
		obsessiondb(),
		backfill({
			defaults: {
				timeColumn: "session_date",
			},
		}),
	],
	clickhouse: {
		url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
		username: process.env.CLICKHOUSE_USER ?? "default",
		password: process.env.CLICKHOUSE_PASSWORD ?? "",
		database: process.env.CLICKHOUSE_DB ?? "default",
	},
});
