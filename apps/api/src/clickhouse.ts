import { type ClickHouseSettings, createClient } from "@clickhouse/client";
import { getLogger } from "@logtape/logtape";
import { resolveClickHouseUsername } from "@rudel/ch-schema/connection";

const logger = getLogger(["rudel", "api", "clickhouse"]);

const ALLOWED_CLICKHOUSE_TABLES = new Set([
	"rudel.claude_sessions",
	"rudel.codex_sessions",
	"rudel.session_analytics",
	"rudel.wrapped_user_archetype_snapshots_v1",
]);

export interface ClickHouseStatement {
	clickhouse_settings?: ClickHouseSettings;
	query: string;
	query_params?: Record<string, unknown>;
	format?: "JSONEachRow";
}

export interface ClickHouseExecutor {
	close(): Promise<void>;
	execute(statement: ClickHouseStatement): Promise<void>;
	query<T>(statement: ClickHouseStatement): Promise<T[]>;
	insert(params: { table: string; values: object[] }): Promise<void>;
}

export function getSafeClickHouseTable(table: string): string {
	if (!ALLOWED_CLICKHOUSE_TABLES.has(table)) {
		throw new Error(`Unsupported ClickHouse table: ${table}`);
	}
	return table;
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
		async close() {
			await client.close();
		},
		async execute(statement: ClickHouseStatement) {
			await client.command({
				clickhouse_settings: statement.clickhouse_settings,
				query: statement.query,
				query_params: statement.query_params,
			});
		},
		async query<T>(statement: ClickHouseStatement): Promise<T[]> {
			const result = await client.query({
				clickhouse_settings: statement.clickhouse_settings,
				query: statement.query,
				query_params: statement.query_params,
				format: statement.format ?? "JSONEachRow",
			});
			return result.json();
		},
		async insert(params) {
			const table = getSafeClickHouseTable(params.table);
			await client.insert({
				clickhouse_settings: {
					async_insert: 1,
					wait_for_async_insert: 1,
				},
				format: "JSONEachRow",
				table,
				values: params.values,
			});
		},
	};
}

let _clickhouse: ClickHouseExecutor | null = null;

export function getClickhouse(): ClickHouseExecutor {
	if (!_clickhouse) {
		const url = process.env.CLICKHOUSE_URL || "http://localhost:8123";
		const executor = createClickHouseExecutor({
			url,
			username: resolveClickHouseUsername(process.env, url),
			password: process.env.CLICKHOUSE_PASSWORD || "",
			database: "default",
		});
		const maxRetries = 3;
		_clickhouse = {
			...executor,
			async insert(params) {
				// Retries reuse the byte-identical rows (including ingested_at), so
				// duplicate attempts converge under ReplacingMergeTree. Do not enable
				// async_insert_deduplicate here: these inserts feed dependent materialized
				// views, whose deduplication behavior varies by ClickHouse version.
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

export async function shutdownClickhouse(): Promise<void> {
	const clickhouse = _clickhouse;
	_clickhouse = null;
	await clickhouse?.close();
}

export function addOptionalStringEqFilter(
	where: string[],
	query_params: Record<string, unknown>,
	column: string,
	paramName: string,
	value?: string,
): void {
	if (!value) return;
	where.push(`${column} = {${paramName}:String}`);
	query_params[paramName] = value;
}

export function addOptionalStringInFilter(
	where: string[],
	query_params: Record<string, unknown>,
	column: string,
	paramBase: string,
	values?: string[],
): void {
	if (!values || values.length === 0) return;
	const placeholders = values.map((value, index) => {
		const paramName = `${paramBase}_${index}`;
		query_params[paramName] = value;
		return `{${paramName}:String}`;
	});
	where.push(`${column} IN (${placeholders.join(", ")})`);
}

export function buildDateFilter(
	paramName: string,
	column = "session_date",
): string {
	return `${column} >= now64(3) - toIntervalDay({${paramName}:UInt32}) AND ${column} <= now64(3)`;
}

export function buildAbsoluteDateFilter(
	startParamName: string,
	endParamName: string,
	column = "session_date",
): string {
	return `toDate(${column}) >= toDate({${startParamName}:String}) AND toDate(${column}) <= toDate({${endParamName}:String})`;
}

export function buildInclusiveDateRangeFilter(
	startParamName: string,
	endParamName: string,
	column = "session_date",
): string {
	return buildAbsoluteDateFilter(startParamName, endParamName, column);
}

export async function queryClickhouse<T>(
	statement: ClickHouseStatement,
): Promise<T[]> {
	const ch = getClickhouse();
	return ch.query<T>(statement);
}
