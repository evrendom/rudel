import { buildSessionKey } from "../../src/token-recount/recount.js";
import type {
	PreflightReport,
	PreflightTable,
	ProviderAnchor,
	SampleReason,
} from "../../src/token-recount/report.js";
import type {
	RecountIdentity,
	RecountSource,
	StoredTokenRow,
} from "../../src/token-recount/types.js";
import type { RecountCliOptions } from "./config.js";
import {
	type QueryLimits,
	type QueryParameter,
	queryClickHouse,
	type ReadonlyClickHouseConnection,
} from "./http-client.js";

const METADATA_LIMITS: QueryLimits = {
	maxResultRows: 1_000,
	maxResultBytes: 10 * 1_024 * 1_024,
	maxExecutionSeconds: 30,
};
const RAW_CONTENT_LIMITS: QueryLimits = {
	maxResultRows: 2,
	maxResultBytes: 512 * 1_024 * 1_024,
	maxExecutionSeconds: 30,
};

const REQUIRED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
	claude_sessions: [
		"organization_id",
		"user_id",
		"session_id",
		"session_date",
		"content",
		"subagents",
		"ingested_at",
	],
	codex_sessions: [
		"organization_id",
		"user_id",
		"session_id",
		"session_date",
		"content",
		"ingested_at",
	],
	session_analytics: [
		"source",
		"organization_id",
		"user_id",
		"session_id",
		"input_tokens",
		"output_tokens",
		"cache_read_input_tokens",
		"cache_creation_input_tokens",
		"total_tokens",
	],
};

interface SessionMetadata extends RecountIdentity {
	latestSessionDateMs: number;
	contentBytes: number;
	contentLines: number;
	subagentCount: number;
	tokenEventCount: number;
}

export interface SampledSessionIdentity extends RecountIdentity {
	latestSessionDateMs: number;
	sampleReasons: readonly SampleReason[];
}

export interface RawSession extends SampledSessionIdentity {
	content: string;
	subagents: Readonly<Record<string, string>>;
}

interface TableRow {
	database: string;
	name: string;
	engine: string;
	sortingKey: string;
	primaryKey: string;
	partitionKey: string;
	totalRows: number;
	totalBytes: number;
}

interface ColumnRow {
	table: string;
	name: string;
}

interface MutableSample extends SessionMetadata {
	reasons: Set<SampleReason>;
}

type CandidateKind = "random" | "subagent" | "capped" | "codex_reset";

export async function runClickHousePreflight(
	options: RecountCliOptions,
	connection: ReadonlyClickHouseConnection,
): Promise<PreflightReport> {
	const databaseRows = await queryClickHouse(
		`SELECT name
		 FROM system.databases
		 WHERE name = 'rudel'
		 LIMIT 1`,
		{},
		decodeNamedRow,
		METADATA_LIMITS,
		connection,
	);
	const tables = await queryClickHouse(
		`SELECT
		   database,
		   name,
		   engine,
		   sorting_key,
		   primary_key,
		   partition_key,
		   ifNull(total_rows, 0) AS total_rows,
		   ifNull(total_bytes, 0) AS total_bytes
		 FROM system.tables
		 WHERE database = 'rudel'
		   AND name IN ('claude_sessions', 'codex_sessions', 'session_analytics')
		 ORDER BY name
		 LIMIT 3`,
		{},
		decodeTableRow,
		METADATA_LIMITS,
		connection,
	);
	const columns = await queryClickHouse(
		`SELECT table, name
		 FROM system.columns
		 WHERE database = 'rudel'
		   AND table IN ('claude_sessions', 'codex_sessions', 'session_analytics')
		 ORDER BY table, position
		 LIMIT 200`,
		{},
		decodeColumnRow,
		METADATA_LIMITS,
		connection,
	);
	const skippingIndexes = await queryClickHouse(
		`SELECT
		   table,
		   name,
		   type_full,
		   expr,
		   granularity
		 FROM system.data_skipping_indices
		 WHERE database = 'rudel'
		   AND table IN ('claude_sessions', 'codex_sessions', 'session_analytics')
		 ORDER BY table, name
		 LIMIT 100`,
		{},
		decodeSkippingIndex,
		METADATA_LIMITS,
		connection,
	);
	const missingColumns = findMissingColumns(columns);
	const explainEstimates: Record<string, readonly Record<string, unknown>[]> =
		{};
	for (const source of sources()) {
		explainEstimates[source] = await queryClickHouse(
			buildExplainSql(source),
			{
				organizationId: options.organizationId,
				lookbackDays: options.lookbackDays,
			},
			decodeUnknownRecord,
			METADATA_LIMITS,
			connection,
		);
	}

	return {
		databasePresent: databaseRows.some((row) => row.name === "rudel"),
		tables: tables.map(toPreflightTable),
		requiredColumnsPresent: missingColumns.length === 0,
		missingColumns,
		skippingIndexes,
		explainEstimates,
	};
}

export async function sampleSessionIdentities(
	options: RecountCliOptions,
	anchors: readonly ProviderAnchor[],
	connection: ReadonlyClickHouseConnection,
): Promise<SampledSessionIdentity[]> {
	const samples = new Map<string, MutableSample>();
	for (const source of sources()) {
		const randomRows = await queryMetadata(
			source,
			"random",
			options.sampleSizePerSource,
			options,
			connection,
		);
		mergeSamples(samples, randomRows, "random");

		if (source === "claude_code" && options.findingCandidateCount > 0) {
			const subagentRows = await queryMetadata(
				source,
				"subagent",
				options.findingCandidateCount,
				options,
				connection,
			);
			mergeSamples(samples, subagentRows, "subagent_candidate");
		}
		if (options.findingCandidateCount > 0) {
			const cappedRows = await queryMetadata(
				source,
				"capped",
				options.findingCandidateCount,
				options,
				connection,
			);
			mergeSamples(samples, cappedRows, "capped_candidate");
		}
		if (source === "codex" && options.findingCandidateCount > 0) {
			const resetRows = await queryMetadata(
				source,
				"codex_reset",
				options.findingCandidateCount,
				options,
				connection,
			);
			mergeSamples(samples, resetRows, "codex_reset_candidate");
		}
	}

	for (const anchor of anchors) {
		if (anchor.organizationId !== options.organizationId) {
			throw new Error(
				`Anchor ${anchor.name} does not match --organization-id.`,
			);
		}
		const metadata = await queryAnchorMetadata(anchor, connection);
		mergeSamples(samples, metadata, "anchor");
	}

	return [...samples.values()]
		.map((sample) => ({
			source: sample.source,
			organizationId: sample.organizationId,
			userId: sample.userId,
			sessionId: sample.sessionId,
			latestSessionDateMs: sample.latestSessionDateMs,
			sampleReasons: orderReasons(sample.reasons),
		}))
		.sort(compareSampledIdentities);
}

export async function fetchRawSessions(
	identities: readonly SampledSessionIdentity[],
	onProgress: ((completed: number, total: number) => void) | undefined,
	connection: ReadonlyClickHouseConnection,
): Promise<RawSession[]> {
	const sessions: RawSession[] = [];
	for (const [index, identity] of identities.entries()) {
		const rows = await queryClickHouse(
			buildRawSessionSql(identity.source),
			{
				organizationId: identity.organizationId,
				userId: identity.userId,
				sessionId: identity.sessionId,
				latestSessionDateMs: identity.latestSessionDateMs,
			},
			(value) => decodeRawSession(value, identity),
			RAW_CONTENT_LIMITS,
			connection,
		);
		const row = rows[0];
		if (row) sessions.push(row);
		onProgress?.(index + 1, identities.length);
	}
	return sessions;
}

export async function fetchStoredTokenRows(
	identities: readonly SampledSessionIdentity[],
	connection: ReadonlyClickHouseConnection,
): Promise<ReadonlyMap<string, StoredTokenRow>> {
	const rowsByKey = new Map<string, StoredTokenRow>();
	for (const source of sources()) {
		const sourceIdentities = identities.filter(
			(identity) => identity.source === source,
		);
		for (const chunk of chunkRows(sourceIdentities, 50)) {
			if (chunk.length === 0) continue;
			const parameters: Record<string, QueryParameter> = {
				source,
				organizationId: chunk[0]?.organizationId ?? "",
				rowLimit: chunk.length + 1,
			};
			const filters = chunk.map((identity, index) => {
				parameters[`userId${index}`] = identity.userId;
				parameters[`sessionId${index}`] = identity.sessionId;
				return `(user_id = {userId${index}:String} AND session_id = {sessionId${index}:String})`;
			});
			const rows = await queryClickHouse(
				`SELECT
				   source,
				   organization_id,
				   user_id,
				   session_id,
				   input_tokens,
				   output_tokens,
				   cache_read_input_tokens,
				   cache_creation_input_tokens,
				   total_tokens
				 FROM rudel.session_analytics FINAL
				 WHERE source = {source:String}
				   AND organization_id = {organizationId:String}
				   AND (${filters.join(" OR ")})
				 LIMIT {rowLimit:UInt32}`,
				parameters,
				decodeStoredTokenRow,
				{
					...METADATA_LIMITS,
					maxResultRows: chunk.length + 1,
				},
				connection,
			);
			for (const row of rows) rowsByKey.set(buildSessionKey(row), row);
		}
	}
	return rowsByKey;
}

async function queryMetadata(
	source: RecountSource,
	kind: CandidateKind,
	limit: number,
	options: RecountCliOptions,
	connection: ReadonlyClickHouseConnection,
): Promise<SessionMetadata[]> {
	return queryClickHouse(
		buildMetadataSql(source, kind),
		{
			organizationId: options.organizationId,
			lookbackDays: options.lookbackDays,
			seed: options.seed,
			rowLimit: limit,
		},
		(value) => decodeSessionMetadata(value, source),
		{ ...METADATA_LIMITS, maxResultRows: limit + 1 },
		connection,
	);
}

async function queryAnchorMetadata(
	anchor: ProviderAnchor,
	connection: ReadonlyClickHouseConnection,
): Promise<SessionMetadata[]> {
	return queryClickHouse(
		buildAnchorMetadataSql(anchor.source),
		{
			organizationId: anchor.organizationId,
			userId: anchor.userId,
			sessionId: anchor.sessionId,
		},
		(value) => decodeSessionMetadata(value, anchor.source),
		{ ...METADATA_LIMITS, maxResultRows: 2 },
		connection,
	);
}

function buildMetadataSql(source: RecountSource, kind: CandidateKind): string {
	const table = rawTable(source);
	const subagentExpression =
		source === "claude_code"
			? "argMax(length(subagents), ingested_at)"
			: "toUInt64(0)";
	const tokenEventExpression =
		source === "codex"
			? `argMax(countSubstrings(content, '"total_token_usage"'), ingested_at)`
			: "toUInt64(0)";
	const having = candidateHaving(kind);
	return `SELECT
	  organization_id,
	  user_id,
	  session_id,
	  toUnixTimestamp64Milli(argMax(session_date, ingested_at)) AS latest_session_date_ms,
	  argMax(length(content), ingested_at) AS content_bytes,
	  argMax(if(length(content) = 0, 0, countSubstrings(content, '\\n') + 1), ingested_at) AS content_lines,
	  ${subagentExpression} AS subagent_count,
	  ${tokenEventExpression} AS token_event_count
	FROM ${table}
	WHERE organization_id = {organizationId:String}
	  AND session_date >= now64(3) - toIntervalDay({lookbackDays:UInt32})
	  AND session_date <= now64(3)
	GROUP BY organization_id, user_id, session_id
	${having}
	ORDER BY cityHash64(concat(user_id, '|', session_id, '|', toString({seed:UInt64})))
	LIMIT {rowLimit:UInt32}`;
}

function buildAnchorMetadataSql(source: RecountSource): string {
	const table = rawTable(source);
	const subagentExpression =
		source === "claude_code"
			? "argMax(length(subagents), ingested_at)"
			: "toUInt64(0)";
	const tokenEventExpression =
		source === "codex"
			? `argMax(countSubstrings(content, '"total_token_usage"'), ingested_at)`
			: "toUInt64(0)";
	return `SELECT
	  organization_id,
	  user_id,
	  session_id,
	  toUnixTimestamp64Milli(argMax(session_date, ingested_at)) AS latest_session_date_ms,
	  argMax(length(content), ingested_at) AS content_bytes,
	  argMax(if(length(content) = 0, 0, countSubstrings(content, '\\n') + 1), ingested_at) AS content_lines,
	  ${subagentExpression} AS subagent_count,
	  ${tokenEventExpression} AS token_event_count
	FROM ${table}
	WHERE organization_id = {organizationId:String}
	  AND user_id = {userId:String}
	  AND session_id = {sessionId:String}
	  AND session_date >= now64(3) - toIntervalDay(366)
	  AND session_date <= now64(3)
	GROUP BY organization_id, user_id, session_id
	LIMIT 1`;
}

function buildRawSessionSql(source: RecountSource): string {
	const table = rawTable(source);
	const subagents =
		source === "claude_code"
			? "argMax(subagents, ingested_at)"
			: "CAST(map(), 'Map(String, String)')";
	return `SELECT
	  organization_id,
	  user_id,
	  session_id,
	  argMax(content, ingested_at) AS content,
	  ${subagents} AS subagents
	FROM ${table}
	WHERE organization_id = {organizationId:String}
	  AND session_date >= fromUnixTimestamp64Milli({latestSessionDateMs:Int64})
	  AND session_date < fromUnixTimestamp64Milli({latestSessionDateMs:Int64} + 1)
	  AND user_id = {userId:String}
	  AND session_id = {sessionId:String}
	GROUP BY organization_id, user_id, session_id
	LIMIT 1`;
}

function buildExplainSql(source: RecountSource): string {
	return `EXPLAIN ESTIMATE
	SELECT organization_id, user_id, session_id
	FROM ${rawTable(source)}
	WHERE organization_id = {organizationId:String}
	  AND session_date >= now64(3) - toIntervalDay({lookbackDays:UInt32})
	  AND session_date <= now64(3)
	GROUP BY organization_id, user_id, session_id
	LIMIT 100`;
}

function candidateHaving(kind: CandidateKind): string {
	if (kind === "subagent") return "HAVING subagent_count > 0";
	if (kind === "codex_reset") return "HAVING token_event_count > 1";
	if (kind === "capped") {
		return "HAVING content_bytes > 120000000 OR content_lines > 8001";
	}
	return "";
}

function rawTable(source: RecountSource): string {
	return source === "claude_code"
		? "rudel.claude_sessions"
		: "rudel.codex_sessions";
}

function sources(): readonly RecountSource[] {
	return ["claude_code", "codex"];
}

function mergeSamples(
	target: Map<string, MutableSample>,
	rows: readonly SessionMetadata[],
	reason: SampleReason,
): void {
	for (const row of rows) {
		const key = buildSessionKey(row);
		const existing = target.get(key);
		if (existing) {
			existing.reasons.add(reason);
			continue;
		}
		target.set(key, { ...row, reasons: new Set([reason]) });
	}
}

function orderReasons(reasons: ReadonlySet<SampleReason>): SampleReason[] {
	const order: readonly SampleReason[] = [
		"random",
		"subagent_candidate",
		"capped_candidate",
		"codex_reset_candidate",
		"anchor",
	];
	return order.filter((reason) => reasons.has(reason));
}

function compareSampledIdentities(
	left: SampledSessionIdentity,
	right: SampledSessionIdentity,
): number {
	return (
		left.source.localeCompare(right.source) ||
		left.userId.localeCompare(right.userId) ||
		left.sessionId.localeCompare(right.sessionId)
	);
}

function findMissingColumns(columns: readonly ColumnRow[]): string[] {
	const present = new Set(
		columns.map((column) => `${column.table}.${column.name}`),
	);
	const missing: string[] = [];
	for (const [table, names] of Object.entries(REQUIRED_COLUMNS)) {
		for (const name of names) {
			const qualified = `${table}.${name}`;
			if (!present.has(qualified)) missing.push(qualified);
		}
	}
	return missing;
}

function toPreflightTable(row: TableRow): PreflightTable {
	return { ...row };
}

function decodeNamedRow(value: unknown): { name: string } {
	const row = requireRecord(value, "database row");
	return { name: requireString(row.name, "database.name") };
}

function decodeTableRow(value: unknown): TableRow {
	const row = requireRecord(value, "table row");
	return {
		database: requireString(row.database, "table.database"),
		name: requireString(row.name, "table.name"),
		engine: requireString(row.engine, "table.engine"),
		sortingKey: requireString(row.sorting_key, "table.sorting_key"),
		primaryKey: requireString(row.primary_key, "table.primary_key"),
		partitionKey: requireString(row.partition_key, "table.partition_key"),
		totalRows: requireNonNegativeNumber(row.total_rows, "table.total_rows"),
		totalBytes: requireNonNegativeNumber(row.total_bytes, "table.total_bytes"),
	};
}

function decodeColumnRow(value: unknown): ColumnRow {
	const row = requireRecord(value, "column row");
	return {
		table: requireString(row.table, "column.table"),
		name: requireString(row.name, "column.name"),
	};
}

function decodeSkippingIndex(value: unknown): {
	table: string;
	name: string;
	type: string;
	expression: string;
	granularity: number;
} {
	const row = requireRecord(value, "skipping index row");
	return {
		table: requireString(row.table, "index.table"),
		name: requireString(row.name, "index.name"),
		type: requireString(row.type_full, "index.type_full"),
		expression: requireString(row.expr, "index.expr"),
		granularity: requireNonNegativeNumber(row.granularity, "index.granularity"),
	};
}

function decodeSessionMetadata(
	value: unknown,
	source: RecountSource,
): SessionMetadata {
	const row = requireRecord(value, "session metadata row");
	return {
		source,
		organizationId: requireString(
			row.organization_id,
			"metadata.organization_id",
		),
		userId: requireString(row.user_id, "metadata.user_id"),
		sessionId: requireString(row.session_id, "metadata.session_id"),
		latestSessionDateMs: requireNonNegativeNumber(
			row.latest_session_date_ms,
			"metadata.latest_session_date_ms",
		),
		contentBytes: requireNonNegativeNumber(
			row.content_bytes,
			"metadata.content_bytes",
		),
		contentLines: requireNonNegativeNumber(
			row.content_lines,
			"metadata.content_lines",
		),
		subagentCount: requireNonNegativeNumber(
			row.subagent_count,
			"metadata.subagent_count",
		),
		tokenEventCount: requireNonNegativeNumber(
			row.token_event_count,
			"metadata.token_event_count",
		),
	};
}

function decodeRawSession(
	value: unknown,
	identity: SampledSessionIdentity,
): RawSession {
	const row = requireRecord(value, "raw session row");
	const organizationId = requireString(
		row.organization_id,
		"raw.organization_id",
	);
	const userId = requireString(row.user_id, "raw.user_id");
	const sessionId = requireString(row.session_id, "raw.session_id");
	if (
		organizationId !== identity.organizationId ||
		userId !== identity.userId ||
		sessionId !== identity.sessionId
	) {
		throw new Error("Raw ClickHouse row identity did not match its query.");
	}
	return {
		...identity,
		content: requireString(row.content, "raw.content"),
		subagents: decodeStringMap(row.subagents, "raw.subagents"),
	};
}

function decodeStoredTokenRow(value: unknown): StoredTokenRow {
	const row = requireRecord(value, "stored analytics row");
	return {
		source: requireSource(row.source, "analytics.source"),
		organizationId: requireString(
			row.organization_id,
			"analytics.organization_id",
		),
		userId: requireString(row.user_id, "analytics.user_id"),
		sessionId: requireString(row.session_id, "analytics.session_id"),
		inputTokens: requireNonNegativeNumber(
			row.input_tokens,
			"analytics.input_tokens",
		),
		outputTokens: requireNonNegativeNumber(
			row.output_tokens,
			"analytics.output_tokens",
		),
		cacheReadInputTokens: requireNonNegativeNumber(
			row.cache_read_input_tokens,
			"analytics.cache_read_input_tokens",
		),
		cacheCreationInputTokens: requireNonNegativeNumber(
			row.cache_creation_input_tokens,
			"analytics.cache_creation_input_tokens",
		),
		totalTokens: requireNonNegativeNumber(
			row.total_tokens,
			"analytics.total_tokens",
		),
	};
}

function decodeUnknownRecord(value: unknown): Record<string, unknown> {
	return { ...requireRecord(value, "EXPLAIN row") };
}

function decodeStringMap(
	value: unknown,
	name: string,
): Readonly<Record<string, string>> {
	const record = requireRecord(value, name);
	const result: Record<string, string> = {};
	for (const [key, item] of Object.entries(record)) {
		result[key] = requireString(item, `${name}.${key}`);
	}
	return result;
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
	if (!isRecord(value)) {
		throw new Error(`${name} has an unexpected shape.`);
	}
	return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, name: string): string {
	if (typeof value !== "string") {
		throw new Error(`${name} must be a string.`);
	}
	return value;
}

function requireSource(value: unknown, name: string): RecountSource {
	if (value === "claude_code" || value === "codex") return value;
	throw new Error(`${name} has an unsupported source.`);
}

function requireNonNegativeNumber(value: unknown, name: string): number {
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number(value)
				: Number.NaN;
	if (!Number.isSafeInteger(parsed) || parsed < 0) {
		throw new Error(`${name} must be a non-negative safe integer.`);
	}
	return parsed;
}

function chunkRows<T>(rows: readonly T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < rows.length; index += size) {
		chunks.push(rows.slice(index, index + size));
	}
	return chunks;
}
