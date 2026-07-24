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
import {
	type IngestSessionInput,
	SESSION_OWNERSHIP_CONFLICT_CODE,
} from "@rudel/api-routes";
import { getClickhouse, getSafeClickHouseTable } from "../clickhouse.js";
import { sqlClient } from "../db.js";
import {
	backfillSessionOwnership,
	resolveSessionOwnershipConflict,
} from "../services/session-ownership-backfill.service.js";
import {
	type ApiTestServer,
	startApiTestServer,
} from "./helpers/api-test-server.js";

const TEST_RUN_ID = `session_sharing_${Date.now()}_${crypto.randomUUID()}`;
const OWNER_EMAIL = `${TEST_RUN_ID}_owner@example.com`;
const MEMBER_EMAIL = `${TEST_RUN_ID}_member@example.com`;
const TEST_PASSWORD = "session-sharing-test-password-42";
const SHARED_SESSION_ID = `${TEST_RUN_ID}_existing`;
const CONCURRENT_SESSION_ID = `${TEST_RUN_ID}_concurrent`;
const LEGACY_SESSION_ID = `${TEST_RUN_ID}_legacy`;
const AMBIGUOUS_LEGACY_SESSION_ID = `${TEST_RUN_ID}_ambiguous_legacy`;
const LEGACY_SHADOW_SESSION_ID = `${TEST_RUN_ID}_legacy_shadow`;
const CROSS_ORG_SESSION_ID = `${TEST_RUN_ID}_cross_org`;
const UNAUTHORIZED_SESSION_ID = `${TEST_RUN_ID}_unauthorized`;
const CASCADE_SESSION_ID = `${TEST_RUN_ID}_cascade`;

setDefaultTimeout(60_000);

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
let member: TestIdentity;
let organizationId: string;

beforeAll(async () => {
	await sqlClient`
		DELETE FROM session_ownership_backfill_state
		WHERE backfill_key = 'session_ownership_v1'
	`;
	server = await startApiTestServer();
	owner = await createTestIdentity(OWNER_EMAIL, "Session Owner");
	member = await createTestIdentity(MEMBER_EMAIL, "Organization Member");
	organizationId = owner.userId;

	await sqlClient`
		INSERT INTO member (id, organization_id, user_id, role)
		VALUES (
			${crypto.randomUUID()},
			${organizationId},
			${member.userId},
			'member'
		)
	`;

	const activeOrganizationResponse = await fetch(
		`${server.baseUrl}/api/auth/organization/set-active`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${member.token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ organizationId }),
		},
	);
	if (!activeOrganizationResponse.ok) {
		throw new Error(
			`Could not activate the shared organization: ${await activeOrganizationResponse.text()}`,
		);
	}
});

afterAll(async () => {
	await server?.stop();

	const clickhouse = getClickhouse();
	await Promise.all(
		[
			"rudel.claude_sessions",
			"rudel.codex_sessions",
			"rudel.session_analytics",
		].map((table) =>
			clickhouse.execute({
				query: `DELETE FROM ${getSafeClickHouseTable(table)} WHERE organization_id IN ({organizationIdOne:String}, {organizationIdTwo:String}) AND session_id IN ({sessionIdOne:String}, {sessionIdTwo:String}, {sessionIdThree:String}, {sessionIdFour:String}, {sessionIdFive:String}, {sessionIdSix:String}, {sessionIdSeven:String}, {sessionIdEight:String})`,
				query_params: {
					organizationIdOne: owner.userId,
					organizationIdTwo: member.userId,
					sessionIdOne: SHARED_SESSION_ID,
					sessionIdTwo: CONCURRENT_SESSION_ID,
					sessionIdThree: LEGACY_SESSION_ID,
					sessionIdFour: CROSS_ORG_SESSION_ID,
					sessionIdFive: UNAUTHORIZED_SESSION_ID,
					sessionIdSix: LEGACY_SHADOW_SESSION_ID,
					sessionIdSeven: CASCADE_SESSION_ID,
					sessionIdEight: AMBIGUOUS_LEGACY_SESSION_ID,
				},
			}),
		),
	);

	await sqlClient`
		DELETE FROM session_ownership_backfill_state
		WHERE backfill_key = 'session_ownership_v1'
	`;
	await sqlClient`
		DELETE FROM organization
		WHERE id IN (${owner.userId}, ${member.userId})
	`;
	await sqlClient`
		DELETE FROM "user"
		WHERE id IN (${owner.userId}, ${member.userId})
	`;
});

describe("organization session ownership", () => {
	test("keeps teammate transcripts private and prevents replacement", async () => {
		const ownerUpload = await callRpc(
			owner.token,
			"ingestSession",
			createSessionInput(SHARED_SESSION_ID, "owner"),
		);
		expect(ownerUpload.status).toBe(200);

		await waitForAnalyticsSession(SHARED_SESSION_ID);

		const memberRead = await callRpc(
			member.token,
			"analytics/sessions/detail",
			{ sessionId: SHARED_SESSION_ID },
		);
		expect(memberRead.status).toBe(403);
		expect(JSON.stringify(memberRead.body)).toContain(
			"You can only view your own sessions",
		);

		const replacementAttempt = await callRpc(
			member.token,
			"ingestSession",
			createSessionInput(SHARED_SESSION_ID, "member"),
		);
		expect(replacementAttempt.status).toBe(409);
		expect(readRpcErrorCode(replacementAttempt.body)).toBe(
			SESSION_OWNERSHIP_CONFLICT_CODE,
		);
		expect(JSON.stringify(replacementAttempt.body)).toContain(
			"This session belongs to another organization member",
		);
		await expectRawSessionOwner(
			"rudel.claude_sessions",
			organizationId,
			SHARED_SESSION_ID,
			owner.userId,
		);
	}, 60_000);

	test("atomically assigns a new session ID to one uploader", async () => {
		const uploads = await Promise.all([
			callRpc(
				owner.token,
				"ingestSession",
				createSessionInput(CONCURRENT_SESSION_ID, "owner"),
			),
			callRpc(
				member.token,
				"ingestSession",
				createSessionInput(CONCURRENT_SESSION_ID, "member"),
			),
		]);

		expect(uploads.map((response) => response.status).sort()).toEqual([
			200, 409,
		]);
		const rejection = uploads.find((response) => response.status === 409);
		assert(rejection);
		expect(readRpcErrorCode(rejection.body)).toBe(
			SESSION_OWNERSHIP_CONFLICT_CODE,
		);
		expect(JSON.stringify(rejection.body)).toContain(
			"This session belongs to another organization member",
		);

		const winnerIndex = uploads.findIndex(
			(response) => response.status === 200,
		);
		const winner = winnerIndex === 0 ? owner : member;
		const retry = await callRpc(
			winner.token,
			"ingestSession",
			createSessionInput(CONCURRENT_SESSION_ID, "winner-retry"),
		);
		expect(retry.status).toBe(200);

		const [ownership] = await sqlClient<
			Array<{ user_id: string }>
		>`SELECT user_id FROM session_ownership WHERE organization_id = ${organizationId} AND session_id = ${CONCURRENT_SESSION_ID}`;
		expect(ownership?.user_id).toBe(winner.userId);
	}, 60_000);

	test("backfills a legacy owner once and protects the session", async () => {
		const legacyInput = createSessionInput(
			LEGACY_SESSION_ID,
			"legacy-owner",
			organizationId,
			"codex",
		);
		await getAdapter(legacyInput.source).ingest(getClickhouse(), legacyInput, {
			ingestedAt: new Date(),
			organizationId,
			userId: owner.userId,
		});

		const ambiguousOwnerInput = createSessionInput(
			AMBIGUOUS_LEGACY_SESSION_ID,
			"ambiguous-owner",
			organizationId,
			"codex",
			"2026-07-21",
		);
		await getAdapter(ambiguousOwnerInput.source).ingest(
			getClickhouse(),
			ambiguousOwnerInput,
			{
				ingestedAt: new Date(),
				organizationId,
				userId: owner.userId,
			},
		);
		const ambiguousMemberInput = createSessionInput(
			AMBIGUOUS_LEGACY_SESSION_ID,
			"ambiguous-member",
			organizationId,
			"codex",
			"2026-07-22",
		);
		await getAdapter(ambiguousMemberInput.source).ingest(
			getClickhouse(),
			ambiguousMemberInput,
			{
				ingestedAt: new Date(),
				organizationId,
				userId: member.userId,
			},
		);

		await expect(backfillSessionOwnership()).rejects.toThrow(
			"conflicting session IDs",
		);
		const legacyBeforeResolution = await sqlClient<Array<{ user_id: string }>>`
			SELECT user_id
			FROM session_ownership
			WHERE organization_id = ${organizationId}
				AND session_id = ${LEGACY_SESSION_ID}
		`;
		expect(legacyBeforeResolution).toHaveLength(0);

		await expect(
			resolveSessionOwnershipConflict({
				organizationId,
				sessionId: AMBIGUOUS_LEGACY_SESSION_ID,
				userId: crypto.randomUUID(),
			}),
		).rejects.toThrow("does not exist in this session's legacy upload history");
		await resolveSessionOwnershipConflict({
			organizationId,
			sessionId: AMBIGUOUS_LEGACY_SESSION_ID,
			userId: owner.userId,
		});
		const firstBackfill = await backfillSessionOwnership();
		expect(firstBackfill.status).toBe("completed");

		const secondBackfill = await backfillSessionOwnership();
		expect(secondBackfill).toEqual({
			insertedCount: 0,
			status: "already_completed",
		});

		await waitForAnalyticsOwners(AMBIGUOUS_LEGACY_SESSION_ID, 2);
		const resolvedLegacyRead = await callRpc(
			owner.token,
			"analytics/sessions/detail",
			{ sessionId: AMBIGUOUS_LEGACY_SESSION_ID },
		);
		expect(resolvedLegacyRead.status).toBe(200);
		expect(readRpcJsonProperty(resolvedLegacyRead.body, "user_id")).toBe(
			owner.userId,
		);
		expect(readRpcJsonProperty(resolvedLegacyRead.body, "content")).toContain(
			"ambiguous-owner",
		);

		const replacementAttempt = await callRpc(
			member.token,
			"ingestSession",
			createSessionInput(LEGACY_SESSION_ID, "legacy-member"),
		);
		expect(replacementAttempt.status).toBe(409);
		expect(readRpcErrorCode(replacementAttempt.body)).toBe(
			SESSION_OWNERSHIP_CONFLICT_CODE,
		);
		expect(JSON.stringify(replacementAttempt.body)).toContain(
			"This session belongs to another organization member",
		);
		await expectRawSessionOwner(
			"rudel.codex_sessions",
			organizationId,
			LEGACY_SESSION_ID,
			owner.userId,
		);
	}, 60_000);

	test("reads the registered owner's content for a shadowed legacy ID", async () => {
		const memberInput = createSessionInput(
			LEGACY_SHADOW_SESSION_ID,
			"legacy-member-owner",
			organizationId,
			"claude_code",
			"2026-07-22",
		);
		await getAdapter(memberInput.source).ingest(getClickhouse(), memberInput, {
			ingestedAt: new Date(),
			organizationId,
			userId: member.userId,
		});
		await sqlClient`
			INSERT INTO session_ownership (
				organization_id,
				session_id,
				user_id
			)
			VALUES (
				${organizationId},
				${LEGACY_SHADOW_SESSION_ID},
				${member.userId}
			)
		`;

		const attackerInput = createSessionInput(
			LEGACY_SHADOW_SESSION_ID,
			"newer-attacker",
			organizationId,
			"claude_code",
			"2026-07-23",
		);
		await getAdapter(attackerInput.source).ingest(
			getClickhouse(),
			attackerInput,
			{
				ingestedAt: new Date(),
				organizationId,
				userId: owner.userId,
			},
		);
		await waitForAnalyticsOwners(LEGACY_SHADOW_SESSION_ID, 2);

		const memberRead = await callRpc(
			member.token,
			"analytics/sessions/detail",
			{ sessionId: LEGACY_SHADOW_SESSION_ID },
		);
		expect(memberRead.status).toBe(200);
		expect(readRpcJsonProperty(memberRead.body, "user_id")).toBe(member.userId);
		expect(readRpcJsonProperty(memberRead.body, "content")).toContain(
			"legacy-member-owner",
		);

		const adminRead = await callRpc(owner.token, "analytics/sessions/detail", {
			sessionId: LEGACY_SHADOW_SESSION_ID,
		});
		expect(adminRead.status).toBe(200);
		expect(readRpcJsonProperty(adminRead.body, "user_id")).toBe(member.userId);
		expect(readRpcJsonProperty(adminRead.body, "content")).toContain(
			"legacy-member-owner",
		);
	}, 60_000);

	test("scopes ownership to one organization", async () => {
		const ownerUpload = await callRpc(
			owner.token,
			"ingestSession",
			createSessionInput(CROSS_ORG_SESSION_ID, "organization-one"),
		);
		const memberUpload = await callRpc(
			member.token,
			"ingestSession",
			createSessionInput(
				CROSS_ORG_SESSION_ID,
				"organization-two",
				member.userId,
			),
		);

		expect(ownerUpload.status).toBe(200);
		expect(memberUpload.status).toBe(200);
		await expectRawSessionOwner(
			"rudel.claude_sessions",
			owner.userId,
			CROSS_ORG_SESSION_ID,
			owner.userId,
		);
		await expectRawSessionOwner(
			"rudel.claude_sessions",
			member.userId,
			CROSS_ORG_SESSION_ID,
			member.userId,
		);
	}, 60_000);

	test("does not let a non-member reserve a session ID", async () => {
		const unauthorizedAttempt = await callRpc(
			owner.token,
			"ingestSession",
			createSessionInput(UNAUTHORIZED_SESSION_ID, "non-member", member.userId),
		);
		expect(unauthorizedAttempt.status).toBe(403);
		expect(JSON.stringify(unauthorizedAttempt.body)).toContain(
			"Not a member of the specified organization",
		);

		const authorizedUpload = await callRpc(
			member.token,
			"ingestSession",
			createSessionInput(
				UNAUTHORIZED_SESSION_ID,
				"organization-owner",
				member.userId,
			),
		);
		expect(authorizedUpload.status).toBe(200);

		const [ownership] = await sqlClient<
			Array<{ user_id: string }>
		>`SELECT user_id FROM session_ownership WHERE organization_id = ${member.userId} AND session_id = ${UNAUTHORIZED_SESSION_ID}`;
		expect(ownership?.user_id).toBe(member.userId);
	}, 60_000);

	test("releases ownership when its organization is deleted", async () => {
		await sqlClient`
			INSERT INTO session_ownership (
				organization_id,
				session_id,
				user_id
			)
			VALUES (
				${member.userId},
				${CASCADE_SESSION_ID},
				${member.userId}
			)
		`;
		await sqlClient`
			DELETE FROM organization
			WHERE id = ${member.userId}
		`;

		const ownership = await sqlClient<Array<{ user_id: string }>>`
			SELECT user_id
			FROM session_ownership
			WHERE organization_id = ${member.userId}
				AND session_id = ${CASCADE_SESSION_ID}
		`;
		expect(ownership).toHaveLength(0);
	}, 60_000);
});

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

	return {
		token,
		userId: readRpcJsonProperty(meResponse.body, "id"),
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

function createSessionInput(
	sessionId: string,
	contentMarker: string,
	targetOrganizationId = organizationId,
	source: IngestSessionInput["source"] = "claude_code",
	sessionDate = "2026-07-23",
): IngestSessionInput {
	return {
		content: [
			JSON.stringify({
				message: {
					content: `Session content from ${contentMarker}`,
					role: "user",
				},
				timestamp: `${sessionDate}T10:00:00.000Z`,
				type: "user",
			}),
			JSON.stringify({
				message: {
					content: "Acknowledged",
					role: "assistant",
					usage: { input_tokens: 2, output_tokens: 1 },
				},
				timestamp: `${sessionDate}T10:00:01.000Z`,
				type: "assistant",
			}),
		].join("\n"),
		organizationId: targetOrganizationId,
		projectPath: "/test/session-sharing",
		sessionId,
		source,
		upload_mode: "manual",
	};
}

async function expectRawSessionOwner(
	table: string,
	targetOrganizationId: string,
	sessionId: string,
	expectedUserId: string,
): Promise<void> {
	const rows = await getClickhouse().query<{ user_id: string }>({
		query: `SELECT user_id FROM ${getSafeClickHouseTable(table)} FINAL WHERE organization_id = {organizationId:String} AND session_id = {sessionId:String} LIMIT 1`,
		query_params: {
			organizationId: targetOrganizationId,
			sessionId,
		},
	});
	expect(rows).toEqual([{ user_id: expectedUserId }]);
}

async function waitForAnalyticsSession(sessionId: string): Promise<void> {
	const clickhouse = getClickhouse();
	const deadline = Date.now() + 30_000;

	while (Date.now() < deadline) {
		const rows = await clickhouse.query<{ session_id: string }>({
			query: `SELECT session_id FROM ${getSafeClickHouseTable("rudel.session_analytics")} FINAL WHERE organization_id = {organizationId:String} AND session_id = {sessionId:String} LIMIT 1`,
			query_params: { organizationId, sessionId },
		});
		if (rows.length > 0) return;
		await Bun.sleep(250);
	}

	throw new Error(`Session ${sessionId} did not reach session analytics`);
}

async function waitForAnalyticsOwners(
	sessionId: string,
	expectedOwnerCount: number,
): Promise<void> {
	const clickhouse = getClickhouse();
	const deadline = Date.now() + 30_000;

	while (Date.now() < deadline) {
		const [row] = await clickhouse.query<{ owner_count: number }>({
			query: `SELECT uniqExact(user_id) AS owner_count FROM ${getSafeClickHouseTable("rudel.session_analytics")} FINAL WHERE organization_id = {organizationId:String} AND session_id = {sessionId:String}`,
			query_params: { organizationId, sessionId },
		});
		if (Number(row?.owner_count ?? 0) === expectedOwnerCount) return;
		await Bun.sleep(250);
	}

	throw new Error(
		`Session ${sessionId} did not reach ${expectedOwnerCount} analytics owners`,
	);
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

function readRpcErrorCode(value: unknown): string {
	if (
		typeof value === "object" &&
		value !== null &&
		"json" in value &&
		typeof value.json === "object" &&
		value.json !== null &&
		"code" in value.json &&
		typeof value.json.code === "string"
	) {
		return value.json.code;
	}

	throw new Error("RPC response did not include json.code");
}

function readRpcJsonProperty(
	value: unknown,
	property: "content" | "id" | "session_id" | "user_id",
): string {
	if (
		typeof value !== "object" ||
		value === null ||
		!("json" in value) ||
		typeof value.json !== "object" ||
		value.json === null
	) {
		throw new Error(`RPC response did not include json.${property}`);
	}

	if (
		property === "content" &&
		"content" in value.json &&
		typeof value.json.content === "string"
	) {
		return value.json.content;
	}
	if (
		property === "id" &&
		"id" in value.json &&
		typeof value.json.id === "string"
	) {
		return value.json.id;
	}
	if (
		property === "session_id" &&
		"session_id" in value.json &&
		typeof value.json.session_id === "string"
	) {
		return value.json.session_id;
	}
	if (
		property === "user_id" &&
		"user_id" in value.json &&
		typeof value.json.user_id === "string"
	) {
		return value.json.user_id;
	}

	throw new Error(`RPC response json.${property} was not a string`);
}
