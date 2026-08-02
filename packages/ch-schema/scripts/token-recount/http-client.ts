const SAFE_QUERY_PREFIX = /^(EXPLAIN\b|SELECT\b|WITH\b)/iu;
const UNSAFE_QUERY_SHAPES: readonly RegExp[] = [
	/\bINTO\s+OUTFILE\b/iu,
	/\bfile\s*\(/iu,
	/\burl\s*\(/iu,
	/\bs3\s*\(/iu,
	/\bremote\s*\(/iu,
	/\bremoteSecure\s*\(/iu,
	/\bcluster\s*\(/iu,
	/\bjdbc\s*\(/iu,
	/\bodbc\s*\(/iu,
];

export interface ReadonlyClickHouseConnection {
	url: string;
	username: string;
	password: string;
}

export interface QueryLimits {
	maxResultRows: number;
	maxResultBytes: number;
	maxExecutionSeconds: number;
}

export type QueryParameter = string | number;

export async function queryClickHouse<T>(
	query: string,
	parameters: Readonly<Record<string, QueryParameter>>,
	decode: (value: unknown) => T,
	limits: QueryLimits,
	connection: ReadonlyClickHouseConnection,
): Promise<T[]> {
	const normalizedQuery = validateReadonlyQuery(query);
	const url = buildQueryUrl(parameters, limits, connection);
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		(limits.maxExecutionSeconds + 15) * 1_000,
	);

	try {
		const response = await fetch(url, {
			method: "POST",
			headers: buildHeaders(connection),
			body: `${normalizedQuery}\nFORMAT JSONEachRow`,
			signal: controller.signal,
		});
		const body = await response.text();
		if (!response.ok) {
			throw new Error(
				`ClickHouse read failed (${response.status}): ${sanitizeErrorBody(body)}`,
			);
		}
		return decodeJsonEachRow(body, decode);
	} finally {
		clearTimeout(timeout);
	}
}

export function validateReadonlyQuery(rawQuery: string): string {
	const query = rawQuery.trim().replace(/;\s*$/u, "");
	if (!query) throw new Error("ClickHouse query is empty.");
	if (!SAFE_QUERY_PREFIX.test(query)) {
		throw new Error("Only SELECT, WITH ... SELECT, and EXPLAIN are allowed.");
	}
	if (query.includes(";")) {
		throw new Error("Multiple ClickHouse statements are not allowed.");
	}
	for (const unsafeShape of UNSAFE_QUERY_SHAPES) {
		if (unsafeShape.test(query)) {
			throw new Error(`Unsafe read-only query shape: ${unsafeShape.source}`);
		}
	}
	return query;
}

function buildQueryUrl(
	parameters: Readonly<Record<string, QueryParameter>>,
	limits: QueryLimits,
	connection: ReadonlyClickHouseConnection,
): URL {
	const url = new URL(connection.url);
	url.searchParams.set("database", "default");
	url.searchParams.set(
		"max_execution_time",
		String(limits.maxExecutionSeconds),
	);
	url.searchParams.set("timeout_before_checking_execution_speed", "0");
	url.searchParams.set("max_estimated_execution_time", "60");
	url.searchParams.set("max_rows_to_read", "1000000000");
	url.searchParams.set("max_bytes_to_read", "100000000000");
	url.searchParams.set("max_result_rows", String(limits.maxResultRows));
	url.searchParams.set("max_result_bytes", String(limits.maxResultBytes));
	url.searchParams.set("result_overflow_mode", "throw");
	url.searchParams.set("max_memory_usage", "2147483648");
	url.searchParams.set("max_bytes_before_external_group_by", "536870912");
	url.searchParams.set("max_bytes_before_external_sort", "536870912");
	url.searchParams.set("output_format_json_quote_64bit_integers", "0");
	url.searchParams.set("allow_introspection_functions", "0");
	for (const [name, value] of Object.entries(parameters)) {
		url.searchParams.set(`param_${name}`, String(value));
	}
	return url;
}

function buildHeaders(
	connection: ReadonlyClickHouseConnection,
): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "text/plain; charset=utf-8",
		"X-ClickHouse-User": connection.username,
	};
	if (connection.password) {
		headers["X-ClickHouse-Key"] = connection.password;
	}
	return headers;
}

function decodeJsonEachRow<T>(
	body: string,
	decode: (value: unknown) => T,
): T[] {
	const rows: T[] = [];
	for (const [index, line] of body.split("\n").entries()) {
		if (!line.trim()) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch {
			throw new Error(
				`ClickHouse returned invalid JSONEachRow at line ${index + 1}.`,
			);
		}
		rows.push(decode(parsed));
	}
	return rows;
}

function sanitizeErrorBody(body: string): string {
	return body
		.replaceAll(/[\r\n\t]+/gu, " ")
		.trim()
		.slice(0, 2_000);
}
