import type { ClickHouseSettings } from "@clickhouse/client-web";
import { getAllAdapters } from "@rudel/agent-adapters";
import { getClickhouse, getSafeClickHouseTable } from "../clickhouse.js";
import { sqlClient } from "../db.js";

const SESSION_ANALYTICS_TABLE = "rudel.session_analytics";
const SESSION_LANGUAGE_SIGNALS_TABLE = "rudel.session_language_signals";
const SKILL_RECEIPTS_TABLE = "rudel.skill_receipts";
const SKILL_USES_TABLE = "rudel.skill_uses";
const USAGE_EVENTS_TABLE = "rudel.usage_events";
const OWNERSHIP_OPERATION_LOCK_ID = 941_821_301;
const DELETE_BATCH_SIZE = 10;
const CLEANUP_QUERY_SETTINGS = {
	max_bytes_to_read: "10000000000",
	max_execution_time: 90,
} satisfies ClickHouseSettings;
const DELETE_QUERY_SETTINGS = {
	...CLEANUP_QUERY_SETTINGS,
	lightweight_deletes_sync: "3",
} satisfies ClickHouseSettings;

interface OwnershipRow {
	organization_id: string;
	session_id: string;
	user_id: string;
}

interface SessionRowGroup extends OwnershipRow {
	row_count: string;
}

interface CleanupTablePlan {
	keys: SessionRowGroup[];
	table: string;
}

interface CleanupPlan {
	keyCount: number;
	rowCount: number;
	tables: CleanupTablePlan[];
}

export interface SessionOwnershipCleanupTableResult {
	keyCount: number;
	rowCount: number;
	table: string;
}

export interface SessionOwnershipCleanupResult {
	cutoff: string;
	deletedRowCount: number;
	nonCanonicalKeyCount: number;
	nonCanonicalRowCount: number;
	status: "already_clean" | "completed" | "preview";
	tables: SessionOwnershipCleanupTableResult[];
}

export async function previewNonCanonicalSessionCleanup(
	cutoff: Date,
): Promise<SessionOwnershipCleanupResult> {
	const ownershipRows = await sqlClient.unsafe<OwnershipRow[]>(`
		SELECT organization_id, session_id, user_id
		FROM session_ownership
	`);
	const plan = await getCleanupPlan(cutoff, ownershipRows);
	return createCleanupResult(plan, cutoff, "preview", 0);
}

export async function cleanupNonCanonicalSessionRows(
	cutoff: Date,
	expectedRowCount: number,
): Promise<SessionOwnershipCleanupResult> {
	if (!Number.isSafeInteger(expectedRowCount) || expectedRowCount < 0) {
		throw new Error("Expected row count must be a non-negative safe integer.");
	}

	return sqlClient.begin(async (transaction) => {
		await transaction.unsafe("SELECT pg_advisory_xact_lock($1)", [
			OWNERSHIP_OPERATION_LOCK_ID,
		]);
		const ownershipRows = await transaction.unsafe<OwnershipRow[]>(`
			SELECT organization_id, session_id, user_id
			FROM session_ownership
		`);
		const plan = await getCleanupPlan(cutoff, ownershipRows);
		if (plan.rowCount === 0) {
			return createCleanupResult(plan, cutoff, "already_clean", 0);
		}
		if (plan.rowCount > expectedRowCount) {
			throw new Error(
				`Cleanup found ${plan.rowCount} non-canonical rows, which exceeds the previewed maximum of ${expectedRowCount}. Run a new preview before retrying.`,
			);
		}

		for (const table of plan.tables) {
			await deleteNonCanonicalKeys(table);
		}

		const currentOwnershipRows = await transaction.unsafe<OwnershipRow[]>(`
			SELECT organization_id, session_id, user_id
			FROM session_ownership
		`);
		const remainingPlan = await getCleanupPlan(cutoff, currentOwnershipRows);
		if (remainingPlan.rowCount > 0) {
			throw new Error(
				`Cleanup outcome is incomplete or unknown: ${remainingPlan.rowCount} non-canonical rows remain at the selected cutoff. Keep ownership claims in place and retry the same command.`,
			);
		}

		return createCleanupResult(plan, cutoff, "completed", plan.rowCount);
	});
}

async function getCleanupPlan(
	cutoff: Date,
	ownershipRows: OwnershipRow[],
): Promise<CleanupPlan> {
	const registeredOwners = new Map(
		ownershipRows.map((row) => [
			getOwnershipKey(row.organization_id, row.session_id),
			row.user_id,
		]),
	);
	const tables = await Promise.all(
		getCleanupTableNames().map(async (table): Promise<CleanupTablePlan> => {
			const rowGroups = await getSessionRowGroups(table, cutoff);
			return {
				keys: rowGroups.filter(
					(row) =>
						registeredOwners.get(
							getOwnershipKey(row.organization_id, row.session_id),
						) !== row.user_id,
				),
				table,
			};
		}),
	);

	return {
		keyCount: tables.reduce((total, table) => total + table.keys.length, 0),
		rowCount: tables.reduce(
			(total, table) =>
				total +
				table.keys.reduce(
					(tableTotal, row) => tableTotal + Number(row.row_count),
					0,
				),
			0,
		),
		tables,
	};
}

async function getSessionRowGroups(
	table: string,
	cutoff: Date,
): Promise<SessionRowGroup[]> {
	const cutoffColumn =
		table === SESSION_LANGUAGE_SIGNALS_TABLE
			? "raw_ingested_at"
			: table === SKILL_USES_TABLE || table === SKILL_RECEIPTS_TABLE
				? "extracted_at"
				: "ingested_at";
	return getClickhouse().query<SessionRowGroup>({
		clickhouse_settings: CLEANUP_QUERY_SETTINGS,
		query: `
			SELECT
				organization_id,
				session_id,
				user_id,
				count() AS row_count
			FROM ${getSafeClickHouseTable(table)}
			WHERE ${cutoffColumn} <= parseDateTime64BestEffort({cutoff:String})
			GROUP BY organization_id, session_id, user_id
		`,
		query_params: { cutoff: cutoff.toISOString() },
	});
}

async function deleteNonCanonicalKeys(
	tablePlan: CleanupTablePlan,
): Promise<void> {
	for (
		let startIndex = 0;
		startIndex < tablePlan.keys.length;
		startIndex += DELETE_BATCH_SIZE
	) {
		const batch = tablePlan.keys.slice(
			startIndex,
			startIndex + DELETE_BATCH_SIZE,
		);
		const queryParams: Record<string, unknown> = {};
		const predicates = batch.map((row, batchIndex) => {
			queryParams[`organizationId${batchIndex}`] = row.organization_id;
			queryParams[`sessionId${batchIndex}`] = row.session_id;
			queryParams[`userId${batchIndex}`] = row.user_id;
			return `(
				organization_id = {organizationId${batchIndex}:String}
				AND session_id = {sessionId${batchIndex}:String}
				AND user_id = {userId${batchIndex}:String}
			)`;
		});

		await getClickhouse().execute({
			clickhouse_settings: DELETE_QUERY_SETTINGS,
			query: `
				DELETE FROM ${getSafeClickHouseTable(tablePlan.table)}
				WHERE ${predicates.join(" OR ")}
			`,
			query_params: queryParams,
		});
	}
}

function getCleanupTableNames(): string[] {
	return [
		...getAllAdapters().map((adapter) => adapter.rawTableName),
		SESSION_ANALYTICS_TABLE,
		SESSION_LANGUAGE_SIGNALS_TABLE,
		SKILL_RECEIPTS_TABLE,
		SKILL_USES_TABLE,
		USAGE_EVENTS_TABLE,
	];
}

function createCleanupResult(
	plan: CleanupPlan,
	cutoff: Date,
	status: SessionOwnershipCleanupResult["status"],
	deletedRowCount: number,
): SessionOwnershipCleanupResult {
	return {
		cutoff: cutoff.toISOString(),
		deletedRowCount,
		nonCanonicalKeyCount: plan.keyCount,
		nonCanonicalRowCount: plan.rowCount,
		status,
		tables: plan.tables.map((table) => ({
			keyCount: table.keys.length,
			rowCount: table.keys.reduce(
				(total, row) => total + Number(row.row_count),
				0,
			),
			table: table.table,
		})),
	};
}

function getOwnershipKey(organizationId: string, sessionId: string): string {
	return `${organizationId}\u0000${sessionId}`;
}
