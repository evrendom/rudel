import { afterAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { getAdapter } from "@rudel/agent-adapters";
import type { IngestSessionInput } from "@rudel/api-routes";
import {
	ingestRudelWrappedUserArchetypeSnapshotsV1,
	type RudelWrappedUserArchetypeSnapshotsV1Row,
} from "@rudel/ch-schema";
import { getClickhouse, getSafeClickHouseTable } from "../clickhouse.js";
import {
	deleteOrgSessions,
	deleteUserSessions,
} from "../services/org-session.service.js";

const testRunId = `del_test_${Date.now()}_${Math.random()
	.toString(36)
	.slice(2, 8)}`;
const orgId = `org_${testRunId}`;
const userIdAlpha = `user_${testRunId}_alpha`;
const userIdBeta = `user_${testRunId}_beta`;
const sessionByOrgId = `${testRunId}_by_org`;
const sessionByUserAlpha = `${testRunId}_by_user_alpha`;
const sessionByUserBeta = `${testRunId}_by_user_beta`;
const snapshotByOrgId = `${testRunId}_snapshot_by_org`;
const snapshotByUserAlpha = `${testRunId}_snapshot_by_user_alpha`;
const snapshotByUserBeta = `${testRunId}_snapshot_by_user_beta`;

const ch = getClickhouse();

setDefaultTimeout(120_000);

interface CountRow {
	count: string;
}

async function countByOrg(targetOrgId: string): Promise<number> {
	const rows = await ch.query<CountRow>({
		query: `SELECT count() AS count FROM ${getSafeClickHouseTable("rudel.claude_sessions")} WHERE organization_id = {orgId:String}`,
		query_params: { orgId: targetOrgId },
	});
	return Number(rows[0]?.count ?? 0);
}

async function countByUser(targetUserId: string): Promise<number> {
	const rows = await ch.query<CountRow>({
		query: `SELECT count() AS count FROM ${getSafeClickHouseTable("rudel.claude_sessions")} WHERE user_id = {userId:String}`,
		query_params: { userId: targetUserId },
	});
	return Number(rows[0]?.count ?? 0);
}

async function countSnapshotsByOrg(targetOrgId: string): Promise<number> {
	const rows = await ch.query<CountRow>({
		query: `SELECT count() AS count FROM ${getSafeClickHouseTable("rudel.wrapped_user_archetype_snapshots_v1")} WHERE organization_id = {orgId:String}`,
		query_params: { orgId: targetOrgId },
	});
	return Number(rows[0]?.count ?? 0);
}

async function countSnapshotsByUser(targetUserId: string): Promise<number> {
	const rows = await ch.query<CountRow>({
		query: `SELECT count() AS count FROM ${getSafeClickHouseTable("rudel.wrapped_user_archetype_snapshots_v1")} WHERE user_id = {userId:String}`,
		query_params: { userId: targetUserId },
	});
	return Number(rows[0]?.count ?? 0);
}

async function ingestSession(
	sessionId: string,
	userId: string,
	targetOrgId: string,
): Promise<void> {
	const input: IngestSessionInput = {
		source: "claude_code",
		sessionId,
		projectPath: "/test/delete-sessions",
		gitBranch: "main",
		gitSha: "deadbeef",
		tag: "tests",
		content: JSON.stringify({
			type: "user",
			timestamp: "2026-07-29T10:00:00.000Z",
		}),
		subagents: [],
	};
	const adapter = getAdapter(input.source);
	await adapter.ingest(ch, input, {
		ingestedAt: new Date(),
		userId,
		organizationId: targetOrgId,
	});
}

async function ingestSnapshot(
	snapshotId: string,
	userId: string,
	targetOrgId: string,
): Promise<void> {
	await ingestRudelWrappedUserArchetypeSnapshotsV1(ch, [
		createSnapshot(snapshotId, userId, targetOrgId),
	]);
}

function createSnapshot(
	snapshotId: string,
	userId: string,
	targetOrgId: string,
): RudelWrappedUserArchetypeSnapshotsV1Row {
	return {
		active_days: 1,
		archetype_distance: 0.1,
		archetype_distance_ratio_to_max: 0.2,
		archetype_id: 1,
		archetype_key: "test",
		archetype_name: "Test",
		breadth: null,
		breadth_available: 0,
		breadth_raw: null,
		centroid_version: "test",
		claude_session_count: 1,
		codex_session_count: 0,
		commit_sessions: 0,
		consistency: 0.1,
		consistency_raw: 0.1,
		cost_intensity: 0.1,
		cost_intensity_raw: 0.1,
		days_since_first_session: 0,
		distinct_repos: null,
		estimated_spend_usd: 0,
		first_session_at: "2026-07-24 12:00:00.000",
		intensity: 0.1,
		intensity_raw: 0.1,
		last_session_at: "2026-07-24 12:00:00.000",
		longest_session_min: 1,
		mean_session_min: 1,
		organization_id: targetOrgId,
		output: 0.1,
		output_raw: 0.1,
		pipeline_version: "test",
		range: 0.1,
		range_entropy: 0.1,
		range_raw: 0.1,
		scope: "test",
		session_shape: 0.1,
		session_shape_raw: 0.1,
		snapshot_created_at: "2026-07-24 12:00:00.000",
		snapshot_id: snapshotId,
		total_sessions: 1,
		total_tokens: "1",
		user_id: userId,
	};
}

async function waitFor(
	predicate: () => Promise<boolean>,
	timeoutMs = 30000,
	intervalMs = 1000,
): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (await predicate()) return true;
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	return predicate();
}

afterAll(async () => {
	await ch
		.execute({
			query: `DELETE FROM ${getSafeClickHouseTable("rudel.claude_sessions")} WHERE organization_id = {orgId:String} OR user_id IN ({u1:String}, {u2:String})`,
			query_params: {
				orgId,
				u1: userIdAlpha,
				u2: userIdBeta,
			},
		})
		.catch(() => {});
	await ch
		.execute({
			query: `DELETE FROM ${getSafeClickHouseTable("rudel.wrapped_user_archetype_snapshots_v1")} WHERE organization_id = {orgId:String} OR user_id IN ({u1:String}, {u2:String})`,
			query_params: {
				orgId,
				u1: userIdAlpha,
				u2: userIdBeta,
			},
		})
		.catch(() => {});
});

describe("delete session helpers (integration)", () => {
	test("deleteOrgSessions removes rows scoped to organization_id", async () => {
		await ingestSession(sessionByOrgId, userIdAlpha, orgId);
		await ingestSnapshot(snapshotByOrgId, userIdAlpha, orgId);
		const inserted = await waitFor(
			async () =>
				(await countByOrg(orgId)) > 0 && (await countSnapshotsByOrg(orgId)) > 0,
		);
		expect(inserted).toBe(true);

		await deleteOrgSessions(orgId);

		const cleared = await waitFor(
			async () =>
				(await countByOrg(orgId)) === 0 &&
				(await countSnapshotsByOrg(orgId)) === 0,
		);
		expect(cleared).toBe(true);
	}, 120000);

	test("deleteUserSessions removes rows scoped to user_id only", async () => {
		await ingestSession(sessionByUserAlpha, userIdAlpha, orgId);
		await ingestSession(sessionByUserBeta, userIdBeta, orgId);
		await ingestSnapshot(snapshotByUserAlpha, userIdAlpha, orgId);
		await ingestSnapshot(snapshotByUserBeta, userIdBeta, orgId);

		const inserted = await waitFor(
			async () =>
				(await countByUser(userIdAlpha)) > 0 &&
				(await countByUser(userIdBeta)) > 0 &&
				(await countSnapshotsByUser(userIdAlpha)) > 0 &&
				(await countSnapshotsByUser(userIdBeta)) > 0,
		);
		expect(inserted).toBe(true);

		await deleteUserSessions(userIdAlpha);

		const alphaCleared = await waitFor(
			async () => (await countByUser(userIdAlpha)) === 0,
		);
		expect(alphaCleared).toBe(true);
		expect(await countByUser(userIdBeta)).toBeGreaterThan(0);
		expect(await countSnapshotsByUser(userIdAlpha)).toBe(0);
		expect(await countSnapshotsByUser(userIdBeta)).toBeGreaterThan(0);

		await deleteUserSessions(userIdBeta);
	}, 120000);
});
