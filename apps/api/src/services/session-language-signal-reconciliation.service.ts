import { getLogger } from "@logtape/logtape";
import type { Source } from "@rudel/api-routes";
import type { RudelSessionLanguageSignalsRow } from "@rudel/ch-schema/generated";
import {
	type LanguageSignalCounts,
	SCAN_VERSION,
} from "@rudel/language-signals";
import {
	buildLatestRawSessionContentSql,
	getClickhouse,
} from "../clickhouse.js";
import { readPositiveSafeIntegerEnv } from "../lib/env.js";
import {
	buildSessionLanguageSignalRow,
	insertSessionLanguageSignalRows,
} from "./session-language-signal-persistence.service.js";
import { scanSessionLanguageSignalsOffThread } from "./session-language-signal-scanner.service.js";

const logger = getLogger([
	"rudel",
	"api",
	"session-language-signal-reconciliation",
]);
const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_MAX_BATCHES_PER_RUN = 20;
const DISCOVERY_QUERY_SETTINGS = {
	join_use_nulls: 0,
	max_bytes_to_read: "10000000000",
	max_execution_time: 30,
	timeout_before_checking_execution_speed: 0,
} as const;
const CONTENT_QUERY_SETTINGS = {
	max_bytes_to_read: "536870912",
	max_execution_time: 30,
	timeout_before_checking_execution_speed: 0,
} as const;

export interface StaleSessionLanguageSignalRow {
	readonly organization_id: string;
	readonly raw_ingested_at: string;
	readonly session_date: string;
	readonly session_id: string;
	readonly source: Source;
	readonly user_id: string;
}

export interface LatestRawSessionContentRow {
	readonly content: string;
	readonly revision: string;
}

interface LanguageSignalLagCountRow {
	readonly count: number | string;
}

export interface LanguageSignalReconciliationEnvironment {
	readonly insertRows: (
		rows: readonly RudelSessionLanguageSignalsRow[],
	) => Promise<void>;
	readonly now: () => Date;
	readonly queryLatestRawContent: (
		key: StaleSessionLanguageSignalRow,
	) => Promise<LatestRawSessionContentRow | undefined>;
	readonly queryLagCount: (scanVersion: number) => Promise<number>;
	readonly queryStaleRows: (
		scanVersion: number,
		batchSize: number,
		offset: number,
	) => Promise<readonly StaleSessionLanguageSignalRow[]>;
	readonly scan: (content: string) => Promise<LanguageSignalCounts>;
}

export interface LanguageSignalReconciliationResult {
	readonly failed: number;
	readonly remainingLag: number;
	readonly rescanned: number;
}

export interface LanguageSignalReconciliationWorker {
	stop: () => Promise<void>;
}

const STALE_SESSION_CTES = `
	raw_sessions AS (
		SELECT
			source,
			organization_id,
			argMax(session_date, ingested_at) AS session_date,
			session_id,
			argMax(user_id, ingested_at) AS user_id,
			max(ingested_at) AS raw_ingested_at
		FROM (
			SELECT
				'claude_code' AS source,
				organization_id,
				session_date,
				session_id,
				user_id,
				ingested_at
			FROM rudel.claude_sessions

			UNION ALL

			SELECT
				'codex' AS source,
				organization_id,
				session_date,
				session_id,
				user_id,
				ingested_at
			FROM rudel.codex_sessions
		)
		GROUP BY source, organization_id, session_id
	),
	latest_signals AS (
		SELECT
			organization_id,
			session_date,
			session_id,
			source,
			argMax(scan_version, scanned_at) AS latest_scan_version,
			argMax(raw_ingested_at, scanned_at) AS latest_raw_ingested_at
		FROM rudel.session_language_signals
		GROUP BY organization_id, session_date, session_id, source
	),
	stale_sessions AS (
		SELECT
			raw.source AS source,
			raw.organization_id AS organization_id,
			raw.session_date AS session_date,
			raw.session_id AS session_id,
			raw.user_id AS user_id,
			raw.raw_ingested_at AS raw_ingested_at
		FROM raw_sessions AS raw
		LEFT ANY JOIN latest_signals AS signals
			ON signals.organization_id = raw.organization_id
			AND signals.session_date = raw.session_date
			AND signals.session_id = raw.session_id
			AND signals.source = raw.source
		WHERE signals.latest_scan_version = 0
			OR signals.latest_scan_version < {scanVersion:UInt16}
			OR signals.latest_raw_ingested_at < raw.raw_ingested_at
	)`;

export function buildStaleSessionLanguageSignalQuery(): string {
	return `
		WITH ${STALE_SESSION_CTES}
		SELECT
			source,
			organization_id,
			formatDateTime(session_date, '%Y-%m-%dT%H:%i:%S.%fZ', 'UTC') AS session_date,
			session_id,
			user_id,
			formatDateTime(raw_ingested_at, '%Y-%m-%dT%H:%i:%S.%fZ', 'UTC') AS raw_ingested_at
		FROM stale_sessions
		ORDER BY
			raw_ingested_at DESC,
			organization_id ASC,
			session_id ASC,
			source ASC
		LIMIT {batchSize:UInt32}
		OFFSET {offset:UInt32}
	`;
}

export function buildSessionLanguageSignalLagCountQuery(): string {
	return `
		WITH ${STALE_SESSION_CTES}
		SELECT count() AS count
		FROM stale_sessions
	`;
}

function createDefaultEnvironment(): LanguageSignalReconciliationEnvironment {
	const clickhouse = getClickhouse();
	return {
		insertRows: (rows) => insertSessionLanguageSignalRows(clickhouse, rows),
		now: () => new Date(),
		queryLagCount: async (scanVersion) => {
			const rows = await clickhouse.query<LanguageSignalLagCountRow>({
				clickhouse_settings: DISCOVERY_QUERY_SETTINGS,
				query: buildSessionLanguageSignalLagCountQuery(),
				query_params: { scanVersion },
			});
			return Number(rows[0]?.count ?? 0);
		},
		queryLatestRawContent: async (key) => {
			const rows = await clickhouse.query<LatestRawSessionContentRow>({
				clickhouse_settings: CONTENT_QUERY_SETTINGS,
				query: buildLatestRawSessionContentSql({
					sessionDate: true,
					sessionId: true,
					source: true,
					userId: true,
				}),
				query_params: {
					orgId: key.organization_id,
					sessionDate: key.session_date,
					sessionId: key.session_id,
					source: key.source,
					userId: key.user_id,
				},
			});
			return rows[0];
		},
		queryStaleRows: (scanVersion, batchSize, offset) =>
			clickhouse.query<StaleSessionLanguageSignalRow>({
				clickhouse_settings: DISCOVERY_QUERY_SETTINGS,
				query: buildStaleSessionLanguageSignalQuery(),
				query_params: { batchSize, offset, scanVersion },
			}),
		scan: scanSessionLanguageSignalsOffThread,
	};
}

export async function reconcileSessionLanguageSignalsOnce(
	batchSize: number,
	env: LanguageSignalReconciliationEnvironment = createDefaultEnvironment(),
): Promise<LanguageSignalReconciliationResult> {
	const staleRows = await env.queryStaleRows(SCAN_VERSION, batchSize, 0);
	if (staleRows.length === 0) {
		return { failed: 0, remainingLag: 0, rescanned: 0 };
	}

	const batch = await reconcileStaleRows(staleRows, env);
	const remainingLag = await env.queryLagCount(SCAN_VERSION);
	return { ...batch, remainingLag };
}

export async function reconcileSessionLanguageSignalsUntilCaughtUp(
	batchSize: number,
	env: LanguageSignalReconciliationEnvironment = createDefaultEnvironment(),
): Promise<LanguageSignalReconciliationResult> {
	let failed = 0;
	let failedRowOffset = 0;
	let remainingLag = 0;
	let rescanned = 0;
	const processedBatches = new Set<string>();
	let discoveredRows = false;

	for (
		let batchIndex = 0;
		batchIndex < DEFAULT_MAX_BATCHES_PER_RUN;
		batchIndex += 1
	) {
		const staleRows = await env.queryStaleRows(
			SCAN_VERSION,
			batchSize,
			failedRowOffset,
		);
		if (staleRows.length === 0) {
			remainingLag = 0;
			break;
		}

		discoveredRows = true;
		const batchIdentity = staleRows
			.map(
				(row) =>
					`${row.organization_id}\u0000${row.session_id}\u0000${row.source}\u0000${row.raw_ingested_at}`,
			)
			.join("\u0001");
		if (processedBatches.has(batchIdentity)) break;
		processedBatches.add(batchIdentity);

		const batch = await reconcileStaleRows(staleRows, env);
		failed += batch.failed;
		// Acknowledged successful inserts leave the stale prefix. Failed rows do
		// not, so page past only those rows for the rest of this bounded run.
		failedRowOffset += batch.failed;
		rescanned += batch.rescanned;
	}

	if (discoveredRows) {
		remainingLag = await env.queryLagCount(SCAN_VERSION);
	}

	if (rescanned > 0 || failed > 0) {
		logger.info(
			"Language-signal reconciliation completed (sessions_rescanned={rescanned} sessions_failed={failed} remaining_lag={remainingLag})",
			{ failed, remainingLag, rescanned },
		);
	}

	return { failed, remainingLag, rescanned };
}

export function startSessionLanguageSignalReconciliationWorker(input?: {
	readonly batchSize?: number;
	readonly initialDelayMs?: number;
	readonly intervalMs?: number;
}): LanguageSignalReconciliationWorker {
	const batchSize =
		input?.batchSize ??
		readPositiveSafeIntegerEnv(
			"LANGUAGE_SIGNAL_RECONCILE_BATCH_SIZE",
			DEFAULT_BATCH_SIZE,
		);
	const intervalMs =
		input?.intervalMs ??
		readPositiveSafeIntegerEnv(
			"LANGUAGE_SIGNAL_RECONCILE_INTERVAL_MS",
			DEFAULT_INTERVAL_MS,
		);
	const env = createDefaultEnvironment();
	const initialDelayMs =
		input?.initialDelayMs ??
		Math.max(1_000, Math.floor(intervalMs * (0.5 + Math.random())));
	let activeRun = Promise.resolve();
	let stopped = false;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const scheduleNextRun = (delayMs = intervalMs) => {
		if (stopped) return;
		timer = setTimeout(() => {
			activeRun = runWorkerPass();
		}, delayMs);
		timer.unref();
	};
	const runWorkerPass = async () => {
		try {
			await reconcileSessionLanguageSignalsUntilCaughtUp(batchSize, env);
		} catch (error) {
			logger.error("Language-signal reconciliation failed: {error}", {
				error: String(error),
			});
		} finally {
			scheduleNextRun();
		}
	};

	scheduleNextRun(initialDelayMs);

	return {
		async stop() {
			stopped = true;
			if (timer) clearTimeout(timer);
			await activeRun;
		},
	};
}

async function reconcileStaleRows(
	staleRows: readonly StaleSessionLanguageSignalRow[],
	env: LanguageSignalReconciliationEnvironment,
): Promise<Omit<LanguageSignalReconciliationResult, "remainingLag">> {
	const rowsToInsert: RudelSessionLanguageSignalsRow[] = [];
	let failed = 0;

	for (const row of staleRows) {
		try {
			const raw = await env.queryLatestRawContent(row);
			if (!raw) {
				failed += 1;
				continue;
			}
			const counts = await env.scan(raw.content);
			rowsToInsert.push(
				buildSessionLanguageSignalRow(
					{
						organizationId: row.organization_id,
						rawIngestedAt: raw.revision,
						sessionDate: row.session_date,
						sessionId: row.session_id,
						source: row.source,
						userId: row.user_id,
					},
					counts,
					env.now(),
				),
			);
		} catch {
			failed += 1;
		}
	}

	await env.insertRows(rowsToInsert);
	return { failed, rescanned: rowsToInsert.length };
}
