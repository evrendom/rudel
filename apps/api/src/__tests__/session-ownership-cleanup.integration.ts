import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { getAdapter } from "@rudel/agent-adapters";
import type { IngestSessionInput } from "@rudel/api-routes";
import { getClickhouse, getSafeClickHouseTable } from "../clickhouse.js";
import { sqlClient } from "../db.js";
import {
	cleanupNonCanonicalSessionRows,
	previewNonCanonicalSessionCleanup,
} from "../services/session-ownership-cleanup.service.js";
import {
	type ApiTestServer,
	startApiTestServer,
} from "./helpers/api-test-server.js";

const TEST_STARTED_AT = Date.now();
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const TEST_RUN_ID = `session_cleanup_${TEST_STARTED_AT}_${crypto.randomUUID()}`;
const OWNER_EMAIL = `${TEST_RUN_ID}_owner@example.com`;
const OTHER_USER_EMAIL = `${TEST_RUN_ID}_other@example.com`;
const TEST_PASSWORD = "session-cleanup-test-password-42";
const CANONICAL_SESSION_ID = `${TEST_RUN_ID}_canonical`;
const MISMATCHED_SESSION_ID = `${TEST_RUN_ID}_mismatched`;
const UNCLAIMED_SESSION_ID = `${TEST_RUN_ID}_unclaimed`;
const RECENT_SESSION_DATE = formatUtcDate(TEST_STARTED_AT - ONE_DAY_IN_MS);
const EARLIER_SESSION_DATE = formatUtcDate(TEST_STARTED_AT - 2 * ONE_DAY_IN_MS);
const FIXTURE_INGESTED_AT = new Date(
	TEST_STARTED_AT - ONE_DAY_IN_MS / 2,
).toISOString();
const CLEANUP_CUTOFF = new Date(TEST_STARTED_AT);
const LIMITED_CLEANUP_USER = `cleanup_test_${Date.now()}_${crypto.randomUUID().replaceAll("-", "")}`;
const LIMITED_CLEANUP_PASSWORD = "cleanup-limited-test-password-42";
const MONOREPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");

setDefaultTimeout(120_000);

interface TestIdentity {
	token: string;
	userId: string;
}

interface RpcResponse {
	body: unknown;
	status: number;
}

let server: ApiTestServer;
let owner: TestIdentity;
let otherUser: TestIdentity;
let organizationId: string;

beforeAll(async () => {
	server = await startApiTestServer();
	owner = await createTestIdentity(OWNER_EMAIL, "Cleanup Owner");
	otherUser = await createTestIdentity(OTHER_USER_EMAIL, "Cleanup Other");
	organizationId = owner.userId;

	await sqlClient`
		INSERT INTO member (id, organization_id, user_id, role)
		VALUES (
			${crypto.randomUUID()},
			${organizationId},
			${otherUser.userId},
			'member'
		)
	`;

	const activeOrganizationResponse = await fetch(
		`${server.baseUrl}/api/auth/organization/set-active`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${otherUser.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ organizationId }),
		},
	);
	if (!activeOrganizationResponse.ok) {
		throw new Error(
			`Could not activate the cleanup organization: ${await activeOrganizationResponse.text()}`,
		);
	}

	await sqlClient`
		INSERT INTO session_ownership (organization_id, session_id, user_id)
		VALUES
			(${organizationId}, ${CANONICAL_SESSION_ID}, ${owner.userId}),
			(${organizationId}, ${MISMATCHED_SESSION_ID}, ${owner.userId})
	`;

	await ingestSession(
		CANONICAL_SESSION_ID,
		owner.userId,
		RECENT_SESSION_DATE,
		FIXTURE_INGESTED_AT,
	);
	await ingestSession(
		MISMATCHED_SESSION_ID,
		otherUser.userId,
		EARLIER_SESSION_DATE,
		FIXTURE_INGESTED_AT,
	);
	await ingestSession(
		MISMATCHED_SESSION_ID,
		owner.userId,
		RECENT_SESSION_DATE,
		FIXTURE_INGESTED_AT,
	);
	await ingestSession(
		UNCLAIMED_SESSION_ID,
		otherUser.userId,
		RECENT_SESSION_DATE,
		FIXTURE_INGESTED_AT,
	);
	await Promise.all([
		ingestSkillRows(CANONICAL_SESSION_ID, owner.userId),
		ingestSkillRows(MISMATCHED_SESSION_ID, otherUser.userId),
		ingestSkillRows(MISMATCHED_SESSION_ID, owner.userId),
		ingestSkillRows(UNCLAIMED_SESSION_ID, otherUser.userId),
	]);
});

afterAll(async () => {
	await server?.stop();

	const clickhouse = getClickhouse();
	await clickhouse
		.execute({ query: `DROP USER IF EXISTS ${LIMITED_CLEANUP_USER}` })
		.catch(() => {});
	await Promise.all(
		[
			"rudel.claude_sessions",
			"rudel.codex_sessions",
			"rudel.session_analytics",
			"rudel.skill_receipts",
			"rudel.skill_uses",
			"rudel.skill_version_contents",
		].map((table) =>
			clickhouse
				.execute({
					query: `DELETE FROM ${getSafeClickHouseTable(table)} WHERE organization_id = {organizationId:String}`,
					query_params: { organizationId },
				})
				.catch(() => {}),
		),
	);
	await sqlClient`
		DELETE FROM organization
		WHERE id IN (${owner.userId}, ${otherUser.userId})
	`;
	await sqlClient`
		DELETE FROM "user"
		WHERE id IN (${owner.userId}, ${otherUser.userId})
	`;
});

describe("non-canonical session cleanup", () => {
	test("keeps canonical rows, deletes mismatches, and is safe to retry", async () => {
		const preview = await previewNonCanonicalSessionCleanup(CLEANUP_CUTOFF);
		expect(preview.status).toBe("preview");
		expect(preview.nonCanonicalKeyCount).toBeGreaterThanOrEqual(4);
		expect(preview.nonCanonicalRowCount).toBeGreaterThanOrEqual(4);
		expect(preview.tables).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					keyCount: expect.any(Number),
					rowCount: expect.any(Number),
					table: "rudel.claude_sessions",
				}),
				expect.objectContaining({
					keyCount: expect.any(Number),
					rowCount: expect.any(Number),
					table: "rudel.session_analytics",
				}),
				expect.objectContaining({
					keyCount: expect.any(Number),
					rowCount: expect.any(Number),
					table: "rudel.skill_receipts",
				}),
				expect.objectContaining({
					keyCount: expect.any(Number),
					rowCount: expect.any(Number),
					table: "rudel.skill_uses",
				}),
				expect.objectContaining({
					keyCount: expect.any(Number),
					rowCount: expect.any(Number),
					table: "rudel.skill_version_contents",
				}),
			]),
		);
		expect(await countSkillContentRows(owner.userId)).toBeGreaterThan(0);
		expect(await countSkillContentRows(otherUser.userId)).toBeGreaterThan(0);
		await expect(
			cleanupNonCanonicalSessionRows(
				CLEANUP_CUTOFF,
				preview.nonCanonicalRowCount - 1,
			),
		).rejects.toThrow("exceeds the previewed maximum");
		expect(
			await countSessionRows(MISMATCHED_SESSION_ID, otherUser.userId),
		).toBeGreaterThan(0);

		await configureLimitedCleanupUser();
		const partialCleanup = await runCleanupWithLimitedDeleteAccess(
			preview.nonCanonicalRowCount,
		);
		expect(partialCleanup.exitCode).not.toBe(0);
		expect(`${partialCleanup.stdout}\n${partialCleanup.stderr}`).toMatch(
			/not enough privileges|required grant/iu,
		);
		expect(
			await countSessionRowsInTable(
				"rudel.claude_sessions",
				MISMATCHED_SESSION_ID,
				otherUser.userId,
			),
		).toBe(0);
		expect(
			await countSessionRowsInTable(
				"rudel.session_analytics",
				MISMATCHED_SESSION_ID,
				otherUser.userId,
			),
		).toBeGreaterThan(0);
		const [ownershipAfterPartialFailure] = await sqlClient<
			Array<{ user_id: string }>
		>`
				SELECT user_id
				FROM session_ownership
				WHERE organization_id = ${organizationId}
					AND session_id = ${MISMATCHED_SESSION_ID}
			`;
		expect(ownershipAfterPartialFailure?.user_id).toBe(owner.userId);

		const retryPreview =
			await previewNonCanonicalSessionCleanup(CLEANUP_CUTOFF);
		expect(retryPreview.nonCanonicalRowCount).toBeLessThan(
			preview.nonCanonicalRowCount,
		);
		const cleanup = await cleanupNonCanonicalSessionRows(
			CLEANUP_CUTOFF,
			preview.nonCanonicalRowCount,
		);
		expect(cleanup.status).toBe("completed");
		expect(cleanup.deletedRowCount).toBe(retryPreview.nonCanonicalRowCount);

		expect(
			await countSessionRows(CANONICAL_SESSION_ID, owner.userId),
		).toBeGreaterThan(0);
		expect(
			await countSessionRows(MISMATCHED_SESSION_ID, owner.userId),
		).toBeGreaterThan(0);
		expect(
			await countSessionRows(MISMATCHED_SESSION_ID, otherUser.userId),
		).toBe(0);
		expect(await countSessionRows(UNCLAIMED_SESSION_ID, otherUser.userId)).toBe(
			0,
		);
		expect(await countSkillRows(CANONICAL_SESSION_ID, owner.userId)).toBe(2);
		expect(await countSkillRows(MISMATCHED_SESSION_ID, owner.userId)).toBe(2);
		expect(await countSkillRows(MISMATCHED_SESSION_ID, otherUser.userId)).toBe(
			0,
		);
		expect(await countSkillRows(UNCLAIMED_SESSION_ID, otherUser.userId)).toBe(
			0,
		);
		expect(await countSkillContentRows(owner.userId)).toBeGreaterThan(0);
		expect(await countSkillContentRows(otherUser.userId)).toBe(0);

		await expectCleanupApiResults();

		const replay = await cleanupNonCanonicalSessionRows(
			CLEANUP_CUTOFF,
			preview.nonCanonicalRowCount,
		);
		expect(replay.status).toBe("already_clean");
		expect(replay.deletedRowCount).toBe(0);
		expect(replay.nonCanonicalRowCount).toBe(0);
	}, 120_000);
});

async function ingestSession(
	sessionId: string,
	userId: string,
	sessionDate: string,
	ingestedAt: string,
): Promise<void> {
	const input: IngestSessionInput = {
		content: [
			JSON.stringify({
				message: { content: "Cleanup test", role: "user" },
				timestamp: `${sessionDate}T10:00:00.000Z`,
				type: "user",
			}),
		].join("\n"),
		gitBranch: "main",
		gitSha: "deadbeef",
		organizationId,
		projectPath: "/test/session-ownership-cleanup",
		sessionId,
		source: "claude_code",
		subagents: [],
		tag: "tests",
		upload_mode: "manual",
	};
	await getAdapter(input.source).ingest(getClickhouse(), input, {
		ingestedAt: new Date(ingestedAt),
		organizationId,
		userId,
	});
}

async function ingestSkillRows(
	sessionId: string,
	userId: string,
): Promise<void> {
	const extractedAt = toClickHouseTimestamp(new Date(FIXTURE_INGESTED_AT));
	const sourceContentSha256 = "a".repeat(64);
	const contentSha256 = "b".repeat(64);
	const clickhouse = getClickhouse();
	await clickhouse.insert({
		table: "rudel.skill_version_contents",
		values: [
			{
				content: "shared ownership cleanup body",
				content_sha256: contentSha256,
				extracted_at: extractedAt,
				extraction_seq: "1",
				organization_id: organizationId,
				parser_version: 1,
				skill_name: "ownership-cleanup-skill",
				user_id: userId,
			},
		],
	});
	await clickhouse.insert({
		table: "rudel.skill_uses",
		values: [
			{
				agent: "claude",
				content_sha256: contentSha256,
				extracted_at: extractedAt,
				extraction_seq: "1",
				organization_id: organizationId,
				parser_version: 1,
				session_id: sessionId,
				skill_name: "ownership-cleanup-skill",
				source_content_sha256: sourceContentSha256,
				used_at: extractedAt,
				user_id: userId,
			},
		],
	});
	await clickhouse.insert({
		table: "rudel.skill_receipts",
		values: [
			{
				agent: "claude",
				extracted_at: extractedAt,
				extraction_seq: "1",
				organization_id: organizationId,
				parser_version: 1,
				session_id: sessionId,
				source_content_sha256: sourceContentSha256,
				user_id: userId,
			},
		],
	});
}

async function countSessionRows(
	sessionId: string,
	userId: string,
): Promise<number> {
	const counts = await Promise.all(
		["rudel.claude_sessions", "rudel.session_analytics"].map((table) =>
			countSessionRowsInTable(table, sessionId, userId),
		),
	);
	return counts.reduce((total, count) => total + count, 0);
}

async function countSkillRows(
	sessionId: string,
	userId: string,
): Promise<number> {
	const counts = await Promise.all(
		["rudel.skill_receipts", "rudel.skill_uses"].map((table) =>
			countSessionRowsInTable(table, sessionId, userId),
		),
	);
	return counts.reduce((total, count) => total + count, 0);
}

async function countSkillContentRows(userId: string): Promise<number> {
	const [row] = await getClickhouse().query<{ count: string }>({
		query: `
			SELECT count() AS count
			FROM ${getSafeClickHouseTable("rudel.skill_version_contents")}
			WHERE organization_id = {organizationId:String}
				AND user_id = {userId:String}
		`,
		query_params: { organizationId, userId },
	});
	return Number(row?.count ?? 0);
}

async function countSessionRowsInTable(
	table: string,
	sessionId: string,
	userId: string,
): Promise<number> {
	const [row] = await getClickhouse().query<{ count: string }>({
		query: `
			SELECT count() AS count
			FROM ${getSafeClickHouseTable(table)}
			WHERE organization_id = {organizationId:String}
				AND session_id = {sessionId:String}
				AND user_id = {userId:String}
		`,
		query_params: {
			organizationId,
			sessionId,
			userId,
		},
	});
	return Number(row?.count ?? 0);
}

async function configureLimitedCleanupUser(): Promise<void> {
	const clickhouse = getClickhouse();
	await clickhouse.execute({
		query: `DROP USER IF EXISTS ${LIMITED_CLEANUP_USER}`,
	});
	await clickhouse.execute({
		query: `CREATE USER ${LIMITED_CLEANUP_USER} IDENTIFIED WITH sha256_password BY '${LIMITED_CLEANUP_PASSWORD}'`,
	});
	await clickhouse.execute({
		query: `GRANT SELECT ON rudel.* TO ${LIMITED_CLEANUP_USER}`,
	});
	await clickhouse.execute({
		query: `GRANT ALTER DELETE, ALTER UPDATE(_row_exists) ON rudel.claude_sessions TO ${LIMITED_CLEANUP_USER}`,
	});
}

async function runCleanupWithLimitedDeleteAccess(
	expectedRowCount: number,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
	const subprocess = Bun.spawn(
		[
			"bun",
			"apps/api/src/scripts/cleanup-session-ownership.ts",
			"--cutoff",
			CLEANUP_CUTOFF.toISOString(),
			"--expected-row-count",
			String(expectedRowCount),
			"--execute",
		],
		{
			cwd: MONOREPO_ROOT,
			env: {
				...process.env,
				CLICKHOUSE_PASSWORD: LIMITED_CLEANUP_PASSWORD,
				CLICKHOUSE_USER: undefined,
				CLICKHOUSE_USERNAME: LIMITED_CLEANUP_USER,
			},
			stderr: "pipe",
			stdout: "pipe",
		},
	);

	const [exitCode, stderr, stdout] = await Promise.all([
		subprocess.exited,
		readProcessOutput(subprocess.stderr),
		readProcessOutput(subprocess.stdout),
	]);
	return { exitCode, stderr, stdout };
}

function readProcessOutput(
	stream: ReadableStream<Uint8Array> | number | null,
): Promise<string> {
	if (!(stream instanceof ReadableStream)) {
		throw new Error("Expected piped process output");
	}
	return new Response(stream).text();
}

async function expectCleanupApiResults(): Promise<void> {
	const canonicalDetail = await callRpc(
		owner.token,
		"analytics/sessions/detail",
		{ sessionId: CANONICAL_SESSION_ID },
	);
	expect(canonicalDetail.status).toBe(200);
	expect(readRpcJsonProperty(canonicalDetail.body, "user_id")).toBe(
		owner.userId,
	);

	const mismatchedDetail = await callRpc(
		owner.token,
		"analytics/sessions/detail",
		{ sessionId: MISMATCHED_SESSION_ID },
	);
	expect(mismatchedDetail.status).toBe(200);
	expect(readRpcJsonProperty(mismatchedDetail.body, "user_id")).toBe(
		owner.userId,
	);

	const nonOwnerDetail = await callRpc(
		otherUser.token,
		"analytics/sessions/detail",
		{ sessionId: MISMATCHED_SESSION_ID },
	);
	expect(nonOwnerDetail.status).toBe(403);

	const list = await callRpc(owner.token, "analytics/sessions/list", {
		endDate: RECENT_SESSION_DATE,
		limit: 100,
		offset: 0,
		sortBy: "session_date",
		sortOrder: "desc",
		startDate: EARLIER_SESSION_DATE,
	});
	expect(list.status).toBe(200);
	const listRows = readRpcJsonArray(list.body);
	expect(
		listRows.map((row) => readObjectStringProperty(row, "session_id")).sort(),
	).toEqual([CANONICAL_SESSION_ID, MISMATCHED_SESSION_ID].sort());
	expect(
		listRows.every(
			(row) => readObjectStringProperty(row, "user_id") === owner.userId,
		),
	).toBe(true);

	const summary = await callRpc(owner.token, "analytics/sessions/summary", {
		days: 30,
	});
	expect(summary.status).toBe(200);
	expect(readRpcJsonProperty(summary.body, "total_sessions")).toBe(2);
}

function formatUtcDate(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 10);
}

function toClickHouseTimestamp(value: Date): string {
	return value.toISOString().replace("T", " ").replace("Z", "");
}

async function createTestIdentity(
	email: string,
	name: string,
): Promise<TestIdentity> {
	const signupResponse = await fetch(
		`${server.baseUrl}/api/auth/sign-up/email`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, name, password: TEST_PASSWORD }),
		},
	);
	if (!signupResponse.ok) {
		throw new Error(`Sign-up failed: ${await signupResponse.text()}`);
	}

	const body: unknown = await signupResponse.json();
	const token = readAuthToken(body);
	const meResponse = await callRpc(token, "me");
	assert.equal(meResponse.status, 200);
	const userId = readRpcJsonProperty(meResponse.body, "id");
	if (typeof userId !== "string") {
		throw new Error("RPC response did not include a string json.id");
	}

	return {
		token,
		userId,
	};
}

async function callRpc(
	token: string,
	path: string,
	input?: Record<string, unknown>,
): Promise<RpcResponse> {
	const response = await fetch(`${server.baseUrl}/rpc/${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(input ? { json: input } : {}),
	});

	return {
		body: await response.json(),
		status: response.status,
	};
}

function readAuthToken(value: unknown): string {
	if (
		typeof value === "object" &&
		value !== null &&
		"token" in value &&
		typeof value.token === "string"
	) {
		return value.token;
	}
	if (
		typeof value === "object" &&
		value !== null &&
		"session" in value &&
		typeof value.session === "object" &&
		value.session !== null &&
		"token" in value.session &&
		typeof value.session.token === "string"
	) {
		return value.session.token;
	}
	throw new Error("Sign-up response did not include a bearer token");
}

function readRpcJsonProperty(value: unknown, key: string): string | number {
	if (
		typeof value === "object" &&
		value !== null &&
		"json" in value &&
		typeof value.json === "object" &&
		value.json !== null &&
		key in value.json
	) {
		const property = value.json[key as keyof typeof value.json];
		if (typeof property === "string" || typeof property === "number") {
			return property;
		}
	}
	throw new Error(`RPC response did not include json.${key}`);
}

function readRpcJsonArray(value: unknown): unknown[] {
	if (
		typeof value === "object" &&
		value !== null &&
		"json" in value &&
		Array.isArray(value.json)
	) {
		return value.json;
	}
	throw new Error("RPC response did not include a JSON array");
}

function readObjectStringProperty(value: unknown, key: string): string {
	if (
		typeof value === "object" &&
		value !== null &&
		key in value &&
		typeof (value as Record<string, unknown>)[key] === "string"
	) {
		return (value as Record<string, string>)[key] as string;
	}
	throw new Error(`Object did not include string property ${key}`);
}
