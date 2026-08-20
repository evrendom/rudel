import { getLogger } from "@logtape/logtape";
import type { Source } from "@rudel/api-routes";
import {
	ingestRudelSessionLanguageSignals,
	type RudelSessionLanguageSignalsRow,
} from "@rudel/ch-schema/generated";
import {
	type LanguageSignalCounts,
	SCAN_VERSION,
} from "@rudel/language-signals";
import { type ClickHouseExecutor, getClickhouse } from "../clickhouse.js";
import { scanSessionLanguageSignalsOffThread } from "./session-language-signal-scanner.service.js";

const logger = getLogger(["rudel", "api", "session-language-signals"]);

export interface SessionLanguageSignalScanInput {
	readonly content: string;
	readonly organizationId: string;
	readonly rawIngestedAt: Date | string;
	readonly sessionDate: Date | string;
	readonly sessionId: string;
	readonly source: Source;
	readonly userId: string;
}

interface PersistSessionLanguageSignalsEnvironment {
	readonly insertRows: (
		rows: readonly RudelSessionLanguageSignalsRow[],
	) => Promise<void>;
	readonly now: () => Date;
	readonly scan: (content: string) => Promise<LanguageSignalCounts>;
}

const DEFAULT_ENVIRONMENT: PersistSessionLanguageSignalsEnvironment = {
	insertRows: (rows) => insertSessionLanguageSignalRows(getClickhouse(), rows),
	now: () => new Date(),
	scan: scanSessionLanguageSignalsOffThread,
};

export async function persistSessionLanguageSignalsBestEffort(
	input: SessionLanguageSignalScanInput,
	env: PersistSessionLanguageSignalsEnvironment = DEFAULT_ENVIRONMENT,
): Promise<void> {
	try {
		const counts = await env.scan(input.content);
		await env.insertRows([
			buildSessionLanguageSignalRow(input, counts, env.now()),
		]);
	} catch (error) {
		logger.error(
			"Language-signal persistence failed after raw ingest; reconciliation will retry (organization_id={organizationId} session_id={sessionId} error={error})",
			{
				error: String(error),
				organizationId: input.organizationId,
				sessionId: input.sessionId,
			},
		);
	}
}

export function buildSessionLanguageSignalRow(
	input: Omit<SessionLanguageSignalScanInput, "content">,
	counts: LanguageSignalCounts,
	scannedAt: Date | string,
): RudelSessionLanguageSignalsRow {
	return {
		organization_id: input.organizationId,
		session_date: toClickHouseDateTime(input.sessionDate),
		session_id: input.sessionId,
		user_id: input.userId,
		source: input.source,
		raw_ingested_at: toClickHouseDateTime(input.rawIngestedAt),
		scan_version: SCAN_VERSION,
		...counts,
		scanned_at: toClickHouseDateTime(scannedAt),
	};
}

export async function insertSessionLanguageSignalRows(
	executor: ClickHouseExecutor,
	rows: readonly RudelSessionLanguageSignalsRow[],
): Promise<void> {
	if (rows.length === 0) return;
	await ingestRudelSessionLanguageSignals(
		{
			insert: ({ table, values }) =>
				executor.insert({ asyncInsert: false, table, values }),
		},
		[...rows],
	);
}

function toClickHouseDateTime(value: Date | string): string {
	const parsed = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error("Language-signal timestamp is invalid");
	}
	return parsed.toISOString().replace("T", " ").replace("Z", "");
}
