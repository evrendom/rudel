import type { ClickHouseSettings } from "@clickhouse/client-web";
import { getAllAdapters } from "@rudel/agent-adapters";
import type postgres from "postgres";
import { getClickhouse, getSafeClickHouseTable } from "../clickhouse.js";
import { sqlClient } from "../db.js";

const BACKFILL_LOCK_ID = 941_821_301;
const INSERT_BATCH_SIZE = 500;
const BACKFILL_QUERY_SETTINGS = {
	max_bytes_to_read: "10000000000",
	max_execution_time: 90,
} satisfies ClickHouseSettings;

interface BackfillCandidate {
	organizationId: string;
	sessionId: string;
	userIds: string[];
}

interface BackfillPlan {
	counts: SessionOwnershipCutoverCounts;
	rowsToInsert: InsertOwnershipRow[];
}

export interface SessionOwnershipCutoverCounts {
	alreadyClaimedCount: number;
	candidateCount: number;
	claimableCount: number;
	claimedCount: number;
	conflictedCount: number;
	skippedCount: number;
	skippedOrganizationCount: number;
	skippedDisposition: {
		archive: number;
		deleteLater: number;
		migrate: number;
		retain: number;
	};
}

export interface SessionOwnershipCutoverResult
	extends SessionOwnershipCutoverCounts {
	cutoff: string;
	status: "completed" | "preview";
}

interface ExistingOwnershipRow {
	organization_id: string;
	session_id: string;
	user_id: string;
}

interface InsertOwnershipRow {
	organization_id: string;
	session_id: string;
	user_id: string;
}

interface LegacyOwnershipRow {
	organization_id: string;
	session_id: string;
	user_ids: string[];
}

interface ResolveOwnershipInput {
	organizationId: string;
	sessionId: string;
	userId: string;
}

interface IdRow {
	id: string;
}

export async function previewSessionOwnershipCutover(
	cutoff: Date,
): Promise<SessionOwnershipCutoverResult> {
	const candidates = await getLegacyOwnershipCandidates(cutoff);
	const [existingRows, organizationRows, userRows] = await Promise.all([
		sqlClient.unsafe<ExistingOwnershipRow[]>(`
			SELECT organization_id, session_id, user_id
			FROM session_ownership
		`),
		sqlClient.unsafe<IdRow[]>(`
			SELECT id
			FROM organization
		`),
		sqlClient.unsafe<IdRow[]>(`
			SELECT id
			FROM "user"
		`),
	]);
	const plan = planOwnershipClaims(
		candidates,
		existingRows,
		new Set(organizationRows.map((row) => row.id)),
		new Set(userRows.map((row) => row.id)),
	);

	return {
		...plan.counts,
		cutoff: cutoff.toISOString(),
		status: "preview",
	};
}

export async function backfillSessionOwnership(
	cutoff = new Date(),
): Promise<SessionOwnershipCutoverResult> {
	return sqlClient.begin(async (transaction) => {
		await transaction.unsafe("SELECT pg_advisory_xact_lock($1)", [
			BACKFILL_LOCK_ID,
		]);

		const candidates = await getLegacyOwnershipCandidates(cutoff);
		const existingRows = await transaction.unsafe<ExistingOwnershipRow[]>(`
			SELECT organization_id, session_id, user_id
			FROM session_ownership
		`);
		const organizationRows = await transaction.unsafe<IdRow[]>(`
			SELECT id
			FROM organization
		`);
		const userRows = await transaction.unsafe<IdRow[]>(`
			SELECT id
			FROM "user"
		`);
		const plan = planOwnershipClaims(
			candidates,
			existingRows,
			new Set(organizationRows.map((row) => row.id)),
			new Set(userRows.map((row) => row.id)),
		);
		if (plan.counts.conflictedCount > 0) {
			throw new Error(
				`Session ownership catch-up found ${plan.counts.conflictedCount} conflicting sessions. Run the counts-only preview and resolve conflicts before execution.`,
			);
		}

		const claimedCount = await insertOwnershipRows(
			transaction,
			plan.rowsToInsert,
		);
		await assertPlannedOwnersWereRegistered(transaction, plan.rowsToInsert);

		return {
			...plan.counts,
			claimedCount,
			cutoff: cutoff.toISOString(),
			status: "completed",
		};
	});
}

export async function resolveSessionOwnershipConflict(
	input: ResolveOwnershipInput,
): Promise<void> {
	const candidateOwnerIds = await getLegacyOwnerIds(
		input.organizationId,
		input.sessionId,
	);
	if (!candidateOwnerIds.includes(input.userId)) {
		throw new Error(
			"The selected owner does not exist in this session's legacy upload history.",
		);
	}

	await sqlClient.begin(async (transaction) => {
		const [target] = await transaction.unsafe<Array<{ valid: boolean }>>(
			`
			SELECT EXISTS (
				SELECT 1
				FROM organization
				WHERE id = $1
			) AND EXISTS (
				SELECT 1
				FROM "user"
				WHERE id = $2
			) AS valid
			`,
			[input.organizationId, input.userId],
		);
		if (!target?.valid) {
			throw new Error("The selected organization or owner no longer exists.");
		}

		await transaction.unsafe(
			`
			INSERT INTO session_ownership (
				organization_id,
				session_id,
				user_id
			)
			VALUES ($1, $2, $3)
			ON CONFLICT (organization_id, session_id) DO NOTHING
			`,
			[input.organizationId, input.sessionId, input.userId],
		);
		const [registered] = await transaction.unsafe<Array<{ user_id: string }>>(
			`
			SELECT user_id
			FROM session_ownership
			WHERE organization_id = $1
				AND session_id = $2
			`,
			[input.organizationId, input.sessionId],
		);
		if (registered?.user_id !== input.userId) {
			throw new Error("This session already has a different registered owner.");
		}
	});
}

async function getLegacyOwnershipCandidates(
	cutoff: Date,
): Promise<BackfillCandidate[]> {
	const clickhouse = getClickhouse();
	const rowsBySession = new Map<string, BackfillCandidate>();

	for (const adapter of getAllAdapters()) {
		const rows = await clickhouse.query<LegacyOwnershipRow>({
			clickhouse_settings: BACKFILL_QUERY_SETTINGS,
			// Keep historical versions visible so a duplicate uploader is a conflict.
			query: `
				SELECT
					organization_id,
					session_id,
					groupUniqArray(2)(user_id) AS user_ids
				FROM ${getSafeClickHouseTable(adapter.rawTableName)}
				WHERE organization_id != ''
					AND session_id != ''
					AND user_id != ''
					AND ingested_at <= parseDateTime64BestEffort({cutoff:String})
				GROUP BY organization_id, session_id
			`,
			query_params: { cutoff: cutoff.toISOString() },
		});

		for (const row of rows) {
			const key = getOwnershipKey(row.organization_id, row.session_id);
			const candidate = rowsBySession.get(key) ?? {
				organizationId: row.organization_id,
				sessionId: row.session_id,
				userIds: [],
			};
			candidate.userIds = [...new Set([...candidate.userIds, ...row.user_ids])];
			rowsBySession.set(key, candidate);
		}
	}

	return [...rowsBySession.values()];
}

async function getLegacyOwnerIds(
	organizationId: string,
	sessionId: string,
): Promise<string[]> {
	const clickhouse = getClickhouse();
	const ownerIds = new Set<string>();

	for (const adapter of getAllAdapters()) {
		const [row] = await clickhouse.query<{ user_ids: string[] }>({
			clickhouse_settings: BACKFILL_QUERY_SETTINGS,
			query: `
				SELECT groupUniqArray(2)(user_id) AS user_ids
				FROM ${getSafeClickHouseTable(adapter.rawTableName)}
				WHERE organization_id = {organizationId:String}
					AND session_id = {sessionId:String}
					AND user_id != ''
			`,
			query_params: { organizationId, sessionId },
		});
		for (const userId of row?.user_ids ?? []) {
			ownerIds.add(userId);
		}
	}

	return [...ownerIds];
}

function planOwnershipClaims(
	candidates: BackfillCandidate[],
	existingRows: ExistingOwnershipRow[],
	organizationIds: Set<string>,
	userIds: Set<string>,
): BackfillPlan {
	const existingOwners = new Map(
		existingRows.map((row) => [
			getOwnershipKey(row.organization_id, row.session_id),
			row.user_id,
		]),
	);
	const rowsToInsert: InsertOwnershipRow[] = [];
	const skippedOrganizationIds = new Set<string>();
	let alreadyClaimedCount = 0;
	let conflictedCount = 0;
	let skippedCount = 0;

	for (const candidate of candidates) {
		if (!organizationIds.has(candidate.organizationId)) {
			skippedCount++;
			skippedOrganizationIds.add(candidate.organizationId);
			continue;
		}
		const currentUserIds = candidate.userIds.filter((userId) =>
			userIds.has(userId),
		);
		if (currentUserIds.length === 0) {
			skippedCount++;
			skippedOrganizationIds.add(candidate.organizationId);
			continue;
		}
		const key = getOwnershipKey(candidate.organizationId, candidate.sessionId);
		const existingOwner = existingOwners.get(key);
		if (existingOwner) {
			if (!currentUserIds.includes(existingOwner)) {
				conflictedCount++;
			} else {
				alreadyClaimedCount++;
			}
			continue;
		}

		const [onlyOwner] = currentUserIds;
		if (currentUserIds.length !== 1 || !onlyOwner) {
			conflictedCount++;
			continue;
		}
		rowsToInsert.push({
			organization_id: candidate.organizationId,
			session_id: candidate.sessionId,
			user_id: onlyOwner,
		});
	}

	return {
		counts: {
			alreadyClaimedCount,
			candidateCount: candidates.length,
			claimableCount: rowsToInsert.length,
			claimedCount: 0,
			conflictedCount,
			skippedCount,
			skippedOrganizationCount: skippedOrganizationIds.size,
			skippedDisposition: {
				archive: 0,
				deleteLater: skippedOrganizationIds.size,
				migrate: 0,
				retain: 0,
			},
		},
		rowsToInsert,
	};
}

async function insertOwnershipRows(
	transaction: postgres.TransactionSql,
	rows: InsertOwnershipRow[],
): Promise<number> {
	let insertedCount = 0;

	for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
		const batch = rows.slice(index, index + INSERT_BATCH_SIZE);
		const values = batch.flatMap((row) => [
			row.organization_id,
			row.session_id,
			row.user_id,
		]);
		const placeholders = batch
			.map((_, batchIndex) => {
				const parameterIndex = batchIndex * 3;
				return `($${parameterIndex + 1}, $${parameterIndex + 2}, $${parameterIndex + 3})`;
			})
			.join(", ");
		const inserted = await transaction.unsafe<Array<{ session_id: string }>>(
			`
			INSERT INTO session_ownership (
				organization_id,
				session_id,
				user_id
			)
			VALUES ${placeholders}
			ON CONFLICT (organization_id, session_id) DO NOTHING
			RETURNING session_id
			`,
			values,
		);
		insertedCount += inserted.length;
	}

	return insertedCount;
}

async function assertPlannedOwnersWereRegistered(
	transaction: postgres.TransactionSql,
	plannedRows: InsertOwnershipRow[],
): Promise<void> {
	if (plannedRows.length === 0) {
		return;
	}

	const registeredRows = await transaction.unsafe<ExistingOwnershipRow[]>(`
		SELECT organization_id, session_id, user_id
		FROM session_ownership
	`);
	const registeredOwners = new Map(
		registeredRows.map((row) => [
			getOwnershipKey(row.organization_id, row.session_id),
			row.user_id,
		]),
	);
	const conflictCount = plannedRows.filter(
		(row) =>
			registeredOwners.get(
				getOwnershipKey(row.organization_id, row.session_id),
			) !== row.user_id,
	).length;
	if (conflictCount > 0) {
		throw new Error(
			`Session ownership catch-up lost ${conflictCount} claims to concurrent owners. No catch-up claims were committed.`,
		);
	}
}

function getOwnershipKey(organizationId: string, sessionId: string): string {
	return `${organizationId}\u0000${sessionId}`;
}
