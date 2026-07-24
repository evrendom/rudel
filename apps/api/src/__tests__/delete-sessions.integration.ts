import { afterAll, describe, expect, test } from "bun:test";
import { getAdapter } from "@rudel/agent-adapters";
import type { IngestSessionInput } from "@rudel/api-routes";
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

const ch = getClickhouse();

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
		content: "delete-sessions integration test",
		subagents: [],
	};
	const adapter = getAdapter(input.source);
	await adapter.ingest(ch, input, {
		ingestedAt: new Date(),
		userId,
		organizationId: targetOrgId,
	});
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
});

describe("delete session helpers (integration)", () => {
	test("deleteOrgSessions removes rows scoped to organization_id", async () => {
		await ingestSession(sessionByOrgId, userIdAlpha, orgId);
		const inserted = await waitFor(async () => (await countByOrg(orgId)) > 0);
		expect(inserted).toBe(true);

		await deleteOrgSessions(orgId);

		const cleared = await waitFor(async () => (await countByOrg(orgId)) === 0);
		expect(cleared).toBe(true);
	}, 120000);

	test("deleteUserSessions removes rows scoped to user_id only", async () => {
		await ingestSession(sessionByUserAlpha, userIdAlpha, orgId);
		await ingestSession(sessionByUserBeta, userIdBeta, orgId);

		const inserted = await waitFor(
			async () =>
				(await countByUser(userIdAlpha)) > 0 &&
				(await countByUser(userIdBeta)) > 0,
		);
		expect(inserted).toBe(true);

		await deleteUserSessions(userIdAlpha);

		const alphaCleared = await waitFor(
			async () => (await countByUser(userIdAlpha)) === 0,
		);
		expect(alphaCleared).toBe(true);
		expect(await countByUser(userIdBeta)).toBeGreaterThan(0);

		await deleteUserSessions(userIdBeta);
	}, 120000);
});
