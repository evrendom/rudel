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
import { getClickhouse, getSafeClickHouseTable } from "../clickhouse.js";
import { sqlClient } from "../db.js";
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
const CROSS_ORG_SESSION_ID = `${TEST_RUN_ID}_cross_org`;
const UNAUTHORIZED_SESSION_ID = `${TEST_RUN_ID}_unauthorized`;

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
				query: `DELETE FROM ${getSafeClickHouseTable(table)} WHERE organization_id IN ({organizationIdOne:String}, {organizationIdTwo:String}) AND session_id IN ({sessionIdOne:String}, {sessionIdTwo:String}, {sessionIdThree:String}, {sessionIdFour:String}, {sessionIdFive:String})`,
				query_params: {
					organizationIdOne: owner.userId,
					organizationIdTwo: member.userId,
					sessionIdOne: SHARED_SESSION_ID,
					sessionIdTwo: CONCURRENT_SESSION_ID,
					sessionIdThree: LEGACY_SESSION_ID,
					sessionIdFour: CROSS_ORG_SESSION_ID,
					sessionIdFive: UNAUTHORIZED_SESSION_ID,
				},
			}),
		),
	);

	await sqlClient`
		DELETE FROM organization
		WHERE id IN (${owner.userId}, ${member.userId})
	`;
	await sqlClient`
		DELETE FROM "user"
		WHERE id IN (${owner.userId}, ${member.userId})
	`;
});

describe("organization session sharing", () => {
	test("lets a member read a teammate session but not replace it", async () => {
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
		expect(memberRead.status).toBe(200);
		expect(readRpcJsonProperty(memberRead.body, "session_id")).toBe(
			SHARED_SESSION_ID,
		);
		expect(readRpcJsonProperty(memberRead.body, "user_id")).toBe(owner.userId);

		const replacementAttempt = await callRpc(
			member.token,
			"ingestSession",
			createSessionInput(SHARED_SESSION_ID, "member"),
		);
		expect(replacementAttempt.status).toBe(409);
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

	test("protects a session that predates the ownership registry", async () => {
		const legacyInput = createSessionInput(
			LEGACY_SESSION_ID,
			"legacy-owner",
			organizationId,
			"codex",
		);
		await getAdapter(legacyInput.source).ingest(getClickhouse(), legacyInput, {
			organizationId,
			userId: owner.userId,
		});

		const replacementAttempt = await callRpc(
			member.token,
			"ingestSession",
			createSessionInput(LEGACY_SESSION_ID, "legacy-member"),
		);
		expect(replacementAttempt.status).toBe(409);
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
): IngestSessionInput {
	return {
		content: [
			JSON.stringify({
				message: {
					content: `Session content from ${contentMarker}`,
					role: "user",
				},
				timestamp: "2026-07-23T10:00:00.000Z",
				type: "user",
			}),
			JSON.stringify({
				message: {
					content: "Acknowledged",
					role: "assistant",
					usage: { input_tokens: 2, output_tokens: 1 },
				},
				timestamp: "2026-07-23T10:00:01.000Z",
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

function readRpcJsonProperty(
	value: unknown,
	property: "id" | "session_id" | "user_id",
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
