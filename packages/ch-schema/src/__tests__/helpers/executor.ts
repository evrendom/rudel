import { createClickHouseExecutor } from "@chkit/clickhouse";

/**
 * Shared ClickHouse test executor, deduplicated from
 * codex-mv.integration.ts / ingest-clickhouse.integration.ts.
 *
 * ClickHouse Cloud's @clickhouse/client insert() silently drops data, so
 * insert() is rewritten to execute() with FORMAT JSONEachRow and
 * acknowledged async inserts. wait_for_async_insert=1 keeps rows immediately
 * queryable when insert() resolves. INSERT race conditions are retried with
 * exponential backoff.
 */

export type TestExecutor = ReturnType<typeof createClickHouseExecutor>;

export function createTestExecutor(): TestExecutor {
	const baseExecutor = createClickHouseExecutor({
		url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
		username:
			process.env.CLICKHOUSE_USERNAME ||
			process.env.CLICKHOUSE_USER ||
			"default",
		password: process.env.CLICKHOUSE_PASSWORD || "",
		database: "default",
	});

	return {
		...baseExecutor,
		async insert(params) {
			const rows = params.values
				.map((row: Record<string, unknown>) => JSON.stringify(row))
				.join("\n");
			// Match production: large single-row transcripts exceed the parallel parser's object limit.
			const sql = `INSERT INTO ${params.table} SETTINGS async_insert=1, wait_for_async_insert=1, input_format_parallel_parsing=0 FORMAT JSONEachRow ${rows}`;
			for (let attempt = 0; attempt < 5; attempt++) {
				try {
					await baseExecutor.execute(sql);
					return;
				} catch (error) {
					const isRaceCondition =
						error instanceof Error &&
						error.message.includes("INSERT race condition");
					if (!isRaceCondition || attempt === 4) throw error;
					await new Promise((resolve) =>
						setTimeout(resolve, 1000 * 2 ** attempt),
					);
				}
			}
		},
	};
}

export async function waitForQuery<T>(
	executor: TestExecutor,
	query: string,
	timeoutMs = 30000,
	intervalMs = 2000,
): Promise<T[]> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const results = await executor.query<T>(query);
			if (results.length > 0) return results;
		} catch {
			// Transient ClickHouse errors (e.g. S3 storage) - retry
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	return [];
}
