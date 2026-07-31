import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import assert from "node:assert/strict";
import { getAdapter } from "@rudel/agent-adapters";
import type { IngestSessionInput } from "@rudel/api-routes";
import postgres from "postgres";
import { getClickhouse, getSafeClickHouseTable } from "../clickhouse.js";
import { sqlClient } from "../db.js";
import { deleteUserPostgresData } from "../services/user-deletion.service.js";
import {
	type ApiTestServer,
	startApiTestServer,
} from "./helpers/api-test-server.js";

const TEST_RUN_ID = `deletion_hardening_${Date.now()}_${crypto.randomUUID()}`;
const TEST_PASSWORD = "deletion-hardening-test-password-42";
const USER_IDS: string[] = [];
const ORGANIZATION_IDS: string[] = [];
const CLICKHOUSE_SESSIONS: Array<{
	organizationId: string;
	sessionId: string;
}> = [];

interface RpcResponse {
	body: unknown;
	status: number;
}

interface TestIdentity {
	token: string;
	userId: string;
}

interface CountRow {
	count: string;
}

let server: ApiTestServer;
let lockTimeoutServer: ApiTestServer;
let clickHouseFailureServer: ApiTestServer;

setDefaultTimeout(120_000);

beforeAll(async () => {
	const connectionString = getPostgresConnectionString();
	server = await startApiTestServer();
	lockTimeoutServer = await startApiTestServer({
		PG_CONNECTION_STRING: withLockTimeout(connectionString, 250),
	});
	clickHouseFailureServer = await startApiTestServer({
		CLICKHOUSE_URL: "http://127.0.0.1:1",
	});
});

afterAll(async () => {
	await server?.stop();
	await lockTimeoutServer?.stop();
	await clickHouseFailureServer?.stop();

	await Promise.all(
		CLICKHOUSE_SESSIONS.map((session) =>
			getClickhouse().execute({
				query: `DELETE FROM ${getSafeClickHouseTable("rudel.claude_sessions")} WHERE organization_id = {organizationId:String} AND session_id = {sessionId:String}`,
				query_params: session,
			}),
		),
	);

	if (ORGANIZATION_IDS.length > 0) {
		await sqlClient.unsafe(
			"DELETE FROM organization WHERE id = ANY($1::text[])",
			[ORGANIZATION_IDS],
		);
	}
	if (USER_IDS.length > 0) {
		await sqlClient.unsafe(
			"DELETE FROM apikey WHERE reference_id = ANY($1::text[])",
			[USER_IDS],
		);
		await sqlClient.unsafe('DELETE FROM "user" WHERE id = ANY($1::text[])', [
			USER_IDS,
		]);
	}
});

describe("deletion data-loss hardening", () => {
	test("serializes concurrent organization deletions so the user retains an organization", async () => {
		const identity = await createTestIdentity("org-race");
		const secondOrganizationId = await createOwnedOrganization(
			identity.userId,
			"org-race-second",
		);
		const lockClient = createPostgresClient();
		const lock = holdRowLock(
			lockClient,
			'SELECT id FROM "user" WHERE id = $1 FOR UPDATE',
			identity.userId,
		);
		await lock.acquired;

		let settledRequestCount = 0;
		const deletionRequests = [
			callRpc(identity.token, "deleteOrganization", {
				organizationId: identity.userId,
			}),
			callRpc(identity.token, "deleteOrganization", {
				organizationId: secondOrganizationId,
			}),
		].map((request) =>
			request.then((response) => {
				settledRequestCount += 1;
				return response;
			}),
		);

		await Bun.sleep(250);
		const settledBeforeRelease = settledRequestCount;
		lock.release();
		await lock.completed;
		const responses = await Promise.all(deletionRequests);
		await lockClient.end();

		expect(settledBeforeRelease).toBe(0);
		expect(responses).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ status: 200 }),
				expect.objectContaining({ status: 400 }),
			]),
		);

		const [membershipSummary] = await sqlClient<Array<{ count: number }>>`
			SELECT COUNT(*)::int AS count
			FROM member
			WHERE user_id = ${identity.userId}
		`;
		expect(membershipSummary?.count).toBe(1);
	});

	test("preserves a candidate organization that gains another member before account deletion commits", async () => {
		const victim = await createTestIdentity("account-race-victim");
		const survivor = await createTestIdentity("account-race-survivor");
		const lockClient = createPostgresClient();
		const addMember = createSignal();
		const lockAcquired = createSignal();
		const lockTransaction = lockClient.begin(async (transaction) => {
			await transaction.unsafe(
				"SELECT id FROM organization WHERE id = $1 FOR UPDATE",
				[victim.userId],
			);
			lockAcquired.release();
			await addMember.wait;
			await transaction.unsafe(
				`
					INSERT INTO member (id, organization_id, user_id, role)
					VALUES ($1, $2, $3, 'member')
				`,
				[crypto.randomUUID(), victim.userId, survivor.userId],
			);
		});
		await lockAcquired.wait;

		let deletionSettled = false;
		const deletionRequest = callRpc(victim.token, "profile/deleteMine").then(
			(response) => {
				deletionSettled = true;
				return response;
			},
		);
		await Bun.sleep(250);
		const settledBeforeMemberJoin = deletionSettled;
		addMember.release();
		await lockTransaction;
		const response = await deletionRequest;
		await lockClient.end();

		expect(settledBeforeMemberJoin).toBe(false);
		expect(response.status).toBe(200);

		const [victimUser] = await sqlClient<Array<{ id: string }>>`
			SELECT id FROM "user" WHERE id = ${victim.userId}
		`;
		const [survivingOrganization] = await sqlClient<Array<{ id: string }>>`
			SELECT id FROM organization WHERE id = ${victim.userId}
		`;
		const [survivorMembership] = await sqlClient<Array<{ id: string }>>`
			SELECT id
			FROM member
			WHERE organization_id = ${victim.userId}
				AND user_id = ${survivor.userId}
		`;
		expect(victimUser).toBeUndefined();
		expect(survivingOrganization?.id).toBe(victim.userId);
		expect(survivorMembership?.id).toBeDefined();
	});

	test("returns committed organization IDs and clears stale active organization references", async () => {
		const victim = await createTestIdentity("active-org-victim");
		const observer = await createTestIdentity("active-org-observer");
		await sqlClient`
			UPDATE session
			SET active_organization_id = ${victim.userId}
			WHERE user_id = ${observer.userId}
		`;

		const result = await deleteUserPostgresData(victim.userId, { sqlClient });

		expect(result.deletedOrganizationIds).toEqual([victim.userId]);
		const [victimOrganization] = await sqlClient<Array<{ id: string }>>`
			SELECT id FROM organization WHERE id = ${victim.userId}
		`;
		const [observerSession] = await sqlClient<
			Array<{ activeOrganizationId: string | null }>
		>`
			SELECT active_organization_id AS "activeOrganizationId"
			FROM session
			WHERE user_id = ${observer.userId}
			LIMIT 1
		`;
		expect(victimOrganization).toBeUndefined();
		expect(observerSession?.activeOrganizationId).toBeNull();
	});

	test("does not purge account ClickHouse rows when the Postgres transaction cannot acquire its user lock", async () => {
		const identity = await createTestIdentity("account-ordering");
		const sessionId = `${TEST_RUN_ID}_account_ordering`;
		await ingestSession(sessionId, identity.userId, identity.userId);
		CLICKHOUSE_SESSIONS.push({
			organizationId: identity.userId,
			sessionId,
		});
		expect(await waitForRawSession(identity.userId, sessionId)).toBe(true);

		const lockClient = createPostgresClient();
		const lock = holdRowLock(
			lockClient,
			'SELECT id FROM "user" WHERE id = $1 FOR UPDATE',
			identity.userId,
		);
		await lock.acquired;

		const response = await callRpc(
			identity.token,
			"profile/deleteMine",
			undefined,
			lockTimeoutServer.baseUrl,
		);
		lock.release();
		await lock.completed;
		await lockClient.end();

		expect(response.status).toBe(500);
		expect(await countRawSessions(identity.userId, sessionId)).toBeGreaterThan(
			0,
		);
		const [user] = await sqlClient<Array<{ id: string }>>`
			SELECT id FROM "user" WHERE id = ${identity.userId}
		`;
		expect(user?.id).toBe(identity.userId);
	});

	test("does not purge organization ClickHouse rows when the Postgres transaction cannot acquire its user lock", async () => {
		const identity = await createTestIdentity("organization-ordering");
		const targetOrganizationId = await createOwnedOrganization(
			identity.userId,
			"organization-ordering-target",
		);
		const sessionId = `${TEST_RUN_ID}_organization_ordering`;
		await ingestSession(sessionId, identity.userId, targetOrganizationId);
		CLICKHOUSE_SESSIONS.push({
			organizationId: targetOrganizationId,
			sessionId,
		});
		expect(await waitForRawSession(identity.userId, sessionId)).toBe(true);

		const lockClient = createPostgresClient();
		const lock = holdRowLock(
			lockClient,
			'SELECT id FROM "user" WHERE id = $1 FOR UPDATE',
			identity.userId,
		);
		await lock.acquired;

		const response = await callRpc(
			identity.token,
			"deleteOrganization",
			{ organizationId: targetOrganizationId },
			lockTimeoutServer.baseUrl,
		);
		lock.release();
		await lock.completed;
		await lockClient.end();

		expect(response.status).toBe(500);
		expect(await countRawSessions(identity.userId, sessionId)).toBeGreaterThan(
			0,
		);
		const [organization] = await sqlClient<Array<{ id: string }>>`
			SELECT id FROM organization WHERE id = ${targetOrganizationId}
		`;
		expect(organization?.id).toBe(targetOrganizationId);
	});

	test("commits account deletion and logs each table when ClickHouse is unreachable", async () => {
		const identity = await createTestIdentity("clickhouse-failure");

		const response = await callRpc(
			identity.token,
			"profile/deleteMine",
			undefined,
			clickHouseFailureServer.baseUrl,
		);

		expect(response.status).toBe(200);
		const output = clickHouseFailureServer.readOutput();
		expect(output).toContain(`user_id=${identity.userId}`);
		expect(output).toContain("rudel.claude_sessions");
		expect(output).toContain("rudel.codex_sessions");
		expect(output).toContain("rudel.session_analytics");
		expect(output).toContain("rudel.wrapped_user_archetype_snapshots_v1");
		expect(output.match(/purge outcome unknown/gu)).toHaveLength(4);

		const [user] = await sqlClient<Array<{ id: string }>>`
			SELECT id FROM "user" WHERE id = ${identity.userId}
		`;
		expect(user).toBeUndefined();
	});
});

async function createTestIdentity(label: string): Promise<TestIdentity> {
	const response = await fetch(`${server.baseUrl}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email: `${TEST_RUN_ID}_${label}@example.com`,
			name: `Deletion Hardening ${label}`,
			password: TEST_PASSWORD,
		}),
	});
	if (!response.ok) {
		throw new Error(`Sign-up failed: ${await response.text()}`);
	}

	const body: unknown = await response.json();
	const token = readAuthToken(body);
	const meResponse = await callRpc(token, "me");
	assert.equal(meResponse.status, 200);
	const userId = readRpcId(meResponse.body);
	USER_IDS.push(userId);
	ORGANIZATION_IDS.push(userId);
	return { token, userId };
}

async function createOwnedOrganization(
	userId: string,
	label: string,
): Promise<string> {
	const organizationId = `${TEST_RUN_ID}_${label}`;
	await sqlClient`
		INSERT INTO organization (id, name, slug)
		VALUES (
			${organizationId},
			${`Deletion Hardening ${label}`},
			${`${TEST_RUN_ID}-${label}`}
		)
	`;
	await sqlClient`
		INSERT INTO member (id, organization_id, user_id, role)
		VALUES (${crypto.randomUUID()}, ${organizationId}, ${userId}, 'owner')
	`;
	ORGANIZATION_IDS.push(organizationId);
	return organizationId;
}

async function callRpc(
	token: string,
	path: string,
	input?: Record<string, unknown>,
	baseUrl = server.baseUrl,
): Promise<RpcResponse> {
	const response = await fetch(`${baseUrl}/rpc/${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(input ? { json: input } : {}),
	});
	const responseText = await response.text();
	const contentType = response.headers.get("content-type") ?? "";

	return {
		body: contentType.includes("application/json")
			? JSON.parse(responseText)
			: responseText,
		status: response.status,
	};
}

async function ingestSession(
	sessionId: string,
	userId: string,
	organizationId: string,
): Promise<void> {
	const input: IngestSessionInput = {
		content: JSON.stringify({
			type: "user",
			timestamp: "2026-07-29T10:00:00.000Z",
		}),
		projectPath: "/test/deletion-hardening",
		sessionId,
		source: "claude_code",
		subagents: [],
	};
	await getAdapter(input.source).ingest(getClickhouse(), input, {
		ingestedAt: new Date(),
		organizationId,
		userId,
	});
}

async function waitForRawSession(
	userId: string,
	sessionId: string,
): Promise<boolean> {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		if ((await countRawSessions(userId, sessionId)) > 0) {
			return true;
		}
		await Bun.sleep(250);
	}
	return (await countRawSessions(userId, sessionId)) > 0;
}

async function countRawSessions(
	userId: string,
	sessionId: string,
): Promise<number> {
	const [row] = await getClickhouse().query<CountRow>({
		query: `SELECT count() AS count FROM ${getSafeClickHouseTable("rudel.claude_sessions")} WHERE user_id = {userId:String} AND session_id = {sessionId:String}`,
		query_params: { sessionId, userId },
	});
	return Number(row?.count ?? 0);
}

function createPostgresClient(): postgres.Sql {
	return postgres(getPostgresConnectionString(), { max: 1 });
}

function holdRowLock(
	client: postgres.Sql,
	query: string,
	id: string,
): {
	acquired: Promise<void>;
	completed: Promise<void>;
	release: () => void;
} {
	const acquired = createSignal();
	const release = createSignal();
	const completed = client.begin(async (transaction) => {
		await transaction.unsafe(query, [id]);
		acquired.release();
		await release.wait;
	});

	return {
		acquired: acquired.wait,
		completed,
		release: release.release,
	};
}

function createSignal(): { release: () => void; wait: Promise<void> } {
	let releaseSignal: () => void = () => {};
	const wait = new Promise<void>((resolve) => {
		releaseSignal = resolve;
	});
	return { release: releaseSignal, wait };
}

function getPostgresConnectionString(): string {
	const connectionString = process.env.PG_CONNECTION_STRING;
	if (!connectionString) {
		throw new Error("PG_CONNECTION_STRING is required for integration tests");
	}
	return connectionString;
}

function withLockTimeout(connectionString: string, timeoutMs: number): string {
	const url = new URL(connectionString);
	url.searchParams.set("options", `-c lock_timeout=${timeoutMs}ms`);
	return url.toString();
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

function readRpcId(value: unknown): string {
	if (
		typeof value === "object" &&
		value !== null &&
		"json" in value &&
		typeof value.json === "object" &&
		value.json !== null &&
		"id" in value.json &&
		typeof value.json.id === "string"
	) {
		return value.json.id;
	}
	throw new Error("RPC response did not include json.id");
}
