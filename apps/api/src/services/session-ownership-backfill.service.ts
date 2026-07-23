import { getAllAdapters } from "@rudel/agent-adapters";
import type postgres from "postgres";
import { getClickhouse, getSafeClickHouseTable } from "../clickhouse.js";
import { sqlClient } from "../db.js";

const BACKFILL_KEY = "session_ownership_v1";
const BACKFILL_LOCK_ID = 941_821_301;
const INSERT_BATCH_SIZE = 500;

interface BackfillCandidate {
	organizationId: string;
	sessionId: string;
	userIds: string[];
}

interface BackfillResult {
	insertedCount: number;
	status: "already_completed" | "completed";
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

export async function backfillSessionOwnership(): Promise<BackfillResult> {
	return sqlClient.begin(async (transaction) => {
		await transaction.unsafe("SELECT pg_advisory_xact_lock($1)", [
			BACKFILL_LOCK_ID,
		]);

		const [completed] = await transaction.unsafe<
			Array<{ backfill_key: string }>
		>(
			`
			SELECT backfill_key
			FROM session_ownership_backfill_state
			WHERE backfill_key = $1
			LIMIT 1
		`,
			[BACKFILL_KEY],
		);
		if (completed) {
			return { insertedCount: 0, status: "already_completed" };
		}

		const candidates = await getLegacyOwnershipCandidates();
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
		const rowsToInsert = selectOwnershipRows(
			candidates,
			existingRows,
			new Set(organizationRows.map((row) => row.id)),
			new Set(userRows.map((row) => row.id)),
		);
		const insertedCount = await insertOwnershipRows(transaction, rowsToInsert);

		await transaction.unsafe(
			`
			INSERT INTO session_ownership_backfill_state (
				backfill_key
			)
			VALUES ($1)
		`,
			[BACKFILL_KEY],
		);

		return { insertedCount, status: "completed" };
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

async function getLegacyOwnershipCandidates(): Promise<BackfillCandidate[]> {
	const clickhouse = getClickhouse();
	const rowsBySession = new Map<string, BackfillCandidate>();

	for (const adapter of getAllAdapters()) {
		const rows = await clickhouse.query<LegacyOwnershipRow>({
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
				GROUP BY organization_id, session_id
			`,
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

function selectOwnershipRows(
	candidates: BackfillCandidate[],
	existingRows: ExistingOwnershipRow[],
	organizationIds: Set<string>,
	userIds: Set<string>,
): InsertOwnershipRow[] {
	const existingOwners = new Map(
		existingRows.map((row) => [
			getOwnershipKey(row.organization_id, row.session_id),
			row.user_id,
		]),
	);
	const conflicts: BackfillCandidate[] = [];
	const rowsToInsert: InsertOwnershipRow[] = [];

	for (const candidate of candidates) {
		if (!organizationIds.has(candidate.organizationId)) {
			continue;
		}
		const currentUserIds = candidate.userIds.filter((userId) =>
			userIds.has(userId),
		);
		if (currentUserIds.length === 0) {
			continue;
		}
		const currentCandidate = { ...candidate, userIds: currentUserIds };
		const key = getOwnershipKey(candidate.organizationId, candidate.sessionId);
		const existingOwner = existingOwners.get(key);
		if (existingOwner) {
			if (!currentCandidate.userIds.includes(existingOwner)) {
				conflicts.push(currentCandidate);
			}
			continue;
		}

		const [onlyOwner] = currentCandidate.userIds;
		if (currentCandidate.userIds.length !== 1 || !onlyOwner) {
			conflicts.push(currentCandidate);
			continue;
		}
		rowsToInsert.push({
			organization_id: candidate.organizationId,
			session_id: candidate.sessionId,
			user_id: onlyOwner,
		});
	}

	if (conflicts.length > 0) {
		const sample = conflicts
			.slice(0, 10)
			.map(
				(conflict) =>
					`${conflict.organizationId}/${conflict.sessionId} (${conflict.userIds.length} owners)`,
			)
			.join(", ");
		throw new Error(
			`Session ownership backfill found ${conflicts.length} conflicting session IDs. Resolve the registered owners before deployment. Conflicts: ${sample}`,
		);
	}

	return rowsToInsert;
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

function getOwnershipKey(organizationId: string, sessionId: string): string {
	return `${organizationId}\u0000${sessionId}`;
}
