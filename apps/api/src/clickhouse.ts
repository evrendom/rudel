import { createClient } from "@clickhouse/client-web";
import { getLogger } from "@logtape/logtape";

const logger = getLogger(["rudel", "api", "clickhouse"]);

export interface ClickHouseExecutor {
	execute(sql: string): Promise<void>;
	query<T>(sql: string): Promise<T[]>;
	insert(params: { table: string; values: object[] }): Promise<void>;
}

export function createClickHouseExecutor(config: {
	url: string;
	username?: string;
	password?: string;
	database?: string;
}): ClickHouseExecutor {
	const client = createClient({
		url: config.url,
		username: config.username,
		password: config.password,
		database: config.database,
		request_timeout: 120_000,
		clickhouse_settings: {
			wait_end_of_query: 1,
			output_format_json_quote_64bit_integers: 0,
		},
	});
	return {
		async execute(sql) {
			await client.command({ query: sql });
		},
		async query<T>(sql: string): Promise<T[]> {
			const result = await client.query({
				query: sql,
				format: "JSONEachRow",
			});
			return result.json();
		},
		async insert(params) {
			// Use command() with FORMAT JSONEachRow instead of client.insert()
			// because ClickHouse Cloud's @clickhouse/client insert() silently drops data.
			const rows = params.values.map((r) => JSON.stringify(r)).join("\n");
			await client.command({
				query: `INSERT INTO ${params.table} SETTINGS async_insert=0 FORMAT JSONEachRow ${rows}`,
			});
		},
	};
}

let _clickhouse: ClickHouseExecutor | null = null;

export function getClickhouse(): ClickHouseExecutor {
	if (!_clickhouse) {
		const executor = createClickHouseExecutor({
			url: process.env.CLICKHOUSE_URL || "http://localhost:8123",
			username:
				process.env.CLICKHOUSE_USERNAME ||
				process.env.CLICKHOUSE_USER ||
				"default",
			password: process.env.CLICKHOUSE_PASSWORD || "",
			database: "default",
		});
		const maxRetries = 3;
		_clickhouse = {
			...executor,
			async insert(params) {
				for (let attempt = 0; attempt < maxRetries; attempt++) {
					try {
						return await executor.insert(params);
					} catch (error) {
						if (attempt === maxRetries - 1) {
							logger.error(
								"Insert into {table} failed after {maxRetries} attempts: {error}",
								{ table: params.table, maxRetries, error },
							);
							throw error;
						}
						logger.warn(
							"Insert into {table} failed (attempt {attempt}/{maxRetries}), retrying: {error}",
							{
								table: params.table,
								attempt: attempt + 1,
								maxRetries,
								error,
							},
						);
						await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
					}
				}
			},
		};
	}
	return _clickhouse;
}

export function escapeString(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll("\0", "\\0")
		.replaceAll("\n", "\\n")
		.replaceAll("\r", "\\r")
		.replaceAll("\t", "\\t")
		.replaceAll("'", "\\'");
}

export function buildDateFilter(days: number, column = "session_date"): string {
	return `${column} >= now64(3) - INTERVAL ${Number(days)} DAY AND ${column} <= now64(3)`;
}

export function buildAbsoluteDateFilter(
	startDate: string,
	endDate: string,
	column = "session_date",
): string {
	return `toDate(${column}) >= '${startDate}' AND toDate(${column}) <= '${endDate}'`;
}

export async function queryClickhouse<T>(sql: string): Promise<T[]> {
	const ch = getClickhouse();
	return ch.query<T>(sql);
}
