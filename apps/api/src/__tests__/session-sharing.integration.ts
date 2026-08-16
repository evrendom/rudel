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
	previewSessionOwnershipCutover,
	resolveSessionOwnershipConflict,
} from "../services/session-ownership-backfill.service.js";
import {
	type ApiTestServer,
	startApiTestServer,
} from "./helpers/api-test-server.js";

const TEST_RUN_ID = `session_sharing_${Date.now()}_${crypto.randomUUID()}`;
const OWNER_EMAIL = `${TEST_RUN_ID}_owner@example.com`;
const MEMBER_EMAIL = `${TEST_RUN_ID}_member@example.com`;
const ORGLESS_EMAIL = `${TEST_RUN_ID}_orgless@example.com`;
const TEST_PASSWORD = "session-sharing-test-password-42";
const SHARED_SESSION_ID = `${TEST_RUN_ID}_existing`;
const CONCURRENT_SESSION_ID = `${TEST_RUN_ID}_concurrent`;
const LEGACY_SESSION_ID = `${TEST_RUN_ID}_legacy`;
const AMBIGUOUS_LEGACY_SESSION_ID = `${TEST_RUN_ID}_ambiguous_legacy`;
const LATE_LEGACY_SESSION_ID = `${TEST_RUN_ID}_late_legacy`;
const CONCURRENT_CATCHUP_SESSION_ID = `${TEST_RUN_ID}_concurrent_catchup`;
const CODEX_UPLOAD_SESSION_ID = `${TEST_RUN_ID}_codex_upload`;
const LEGACY_SHADOW_SESSION_ID = `${TEST_RUN_ID}_legacy_shadow`;
const CROSS_ORG_SESSION_ID = `${TEST_RUN_ID}_cross_org`;
const ORGLESS_SESSION_ID = `${TEST_RUN_ID}_orgless`;
const UNAUTHORIZED_SESSION_ID = `${TEST_RUN_ID}_unauthorized`;
const CASCADE_SESSION_ID = `${TEST_RUN_ID}_cascade`;
const TIMESTAMPLESS_SESSION_ID = `${TEST_RUN_ID}_timestampless`;

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
let orgless: TestIdentity;
let orglessApiKey: string;
let organizationId: string;

beforeAll(async () => {
	server = await startApiTestServer();
	owner = await createTestIdentity(OWNER_EMAIL, "Session Owner");
	member = await createTestIdentity(MEMBER_EMAIL, "Organization Member");
	orgless = await createTestIdentity(ORGLESS_EMAIL, "Orgless Uploader");
	orglessApiKey = await createIngestApiKey(orgless.token);
	organizationId = owner.userId;

	await sqlClient`
		INSERT INTO member (id, organization_id, user_id, role)
		VALUES
			(
				${crypto.randomUUID()},
				${organizationId},
				${member.userId},
				'member'
			),
			(
				${crypto.randomUUID()},
				${organizationId},
				${orgless.userId},
				'member'
			)
	`;
	await sqlClient`
		DELETE FROM organization
		WHERE id = ${orgless.userId}
	`;
	await sqlClient.begin(async (transaction) => {
		await transaction.unsafe("SET LOCAL session_replication_role = replica");
		await transaction.unsafe(
			"INSERT INTO member (id, organization_id, user_id, role) VALUES ($1, $2, $3, 'owner')",
			[crypto.randomUUID(), orgless.userId, orgless.userId],
		);
	});

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

	await sqlClient.unsafe(
		"DROP TRIGGER IF EXISTS session_ownership_concurrent_claim_test_trigger ON session_ownership",
	);
	await sqlClient.unsafe(
		"DROP FUNCTION IF EXISTS simulate_session_ownership_concurrent_claim()",
	);
	await sqlClient.unsafe(
		"DROP TABLE IF EXISTS session_ownership_concurrent_claim_test",
	);

	const clickhouse = getClickhouse();
	await Promise.all(
		[
			"rudel.claude_sessions",
			"rudel.codex_sessions",
			"rudel.session_analytics",
		].map((table) =>
			clickhouse.execute({
				query: `DELETE FROM ${getSafeClickHouseTable(table)} WHERE organization_id IN ({organizationIdOne:String}, {organizationIdTwo:String}) AND session_id IN ({sessionIdOne:String}, {sessionIdTwo:String}, {sessionIdThree:String}, {sessionIdFour:String}, {sessionIdFive:String}, {sessionIdSix:String}, {sessionIdSeven:String}, {sessionIdEight:String}, {sessionIdNine:String}, {sessionIdTen:String}, {sessionIdEleven:String}, {sessionIdTwelve:String})`,
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
					sessionIdNine: LATE_LEGACY_SESSION_ID,
					sessionIdTen: CODEX_UPLOAD_SESSION_ID,
					sessionIdEleven: CONCURRENT_CATCHUP_SESSION_ID,
					sessionIdTwelve: ORGLESS_SESSION_ID,
				},
			}),
		),
	);

	await sqlClient`
		DELETE FROM organization
		WHERE id IN (${owner.userId}, ${member.userId})
	`;
	await sqlClient`
		DELETE FROM apikey
		WHERE reference_id = ${orgless.userId}
	`;
	await sqlClient`
		DELETE FROM "user"
		WHERE id IN (${owner.userId}, ${member.userId}, ${orgless.userId})
	`;
});

describe("organization session ownership", () => {
	test("rejects timestamp-less transcripts before claiming ownership", async () => {
		const input = createSessionInput(TIMESTAMPLESS_SESSION_ID, "invalid");
		input.content = JSON.stringify({
			result: "Meaningful transcript data without a timestamp",
			type: "result",
		});

		const response = await callRpc(owner.token, "ingestSession", input);
		expect(response.status).toBe(400);
		expect(JSON.stringify(response.body)).toContain(
			"Claude Code transcript contains no valid timestamp",
		);

		const ownership = await sqlClient<Array<{ session_id: string }>>`
			SELECT session_id
			FROM session_ownership
			WHERE organization_id = ${organizationId}
				AND session_id = ${TIMESTAMPLESS_SESSION_ID}
		`;
		expect(ownership).toHaveLength(0);
	}, 60_000);

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

	test("claims Claude and Codex uploads through the enforced path", async () => {
		const codexUpload = await callRpc(
			owner.token,
			"ingestSession",
			createSessionInput(
				CODEX_UPLOAD_SESSION_ID,
				"codex-owner",
				organizationId,
				"codex",
			),
		);
		expect(codexUpload.status).toBe(200);
		await expectRawSessionOwner(
			"rudel.codex_sessions",
			organizationId,
			CODEX_UPLOAD_SESSION_ID,
			owner.userId,
		);
		await waitForAnalyticsSession(CODEX_UPLOAD_SESSION_ID);

		const codexRead = await callRpc(owner.token, "analytics/sessions/detail", {
			sessionId: CODEX_UPLOAD_SESSION_ID,
		});
		expect(codexRead.status).toBe(200);
		expect(readRpcJsonProperty(codexRead.body, "user_id")).toBe(owner.userId);
	}, 60_000);

	test("catches up a late legacy owner and is safe to replay", async () => {
		const originalCutoff = new Date("2026-07-23T12:00:00.000Z");
		const finalCutoff = new Date("2026-07-23T14:00:00.000Z");
		const legacyInput = createSessionInput(
			LEGACY_SESSION_ID,
			"legacy-owner",
			organizationId,
			"codex",
		);
		await getAdapter(legacyInput.source).ingest(getClickhouse(), legacyInput, {
			ingestedAt: new Date("2026-07-23T11:00:00.000Z"),
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
				ingestedAt: new Date("2026-07-23T11:10:00.000Z"),
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
				ingestedAt: new Date("2026-07-23T11:20:00.000Z"),
				organizationId,
				userId: member.userId,
			},
		);

		const conflictPreview =
			await previewSessionOwnershipCutover(originalCutoff);
		expect(conflictPreview.conflictedCount).toBeGreaterThanOrEqual(1);
		await expect(backfillSessionOwnership(originalCutoff)).rejects.toThrow(
			"conflicting sessions",
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

		const originalPreview =
			await previewSessionOwnershipCutover(originalCutoff);
		const originalCatchUp = await backfillSessionOwnership(originalCutoff);
		expect(originalCatchUp).toMatchObject({
			alreadyClaimedCount: originalPreview.alreadyClaimedCount,
			candidateCount: originalPreview.candidateCount,
			claimableCount: originalPreview.claimableCount,
			claimedCount: originalPreview.claimableCount,
			conflictedCount: 0,
			skippedCount: originalPreview.skippedCount,
			status: "completed",
		});

		const lateLegacyInput = createSessionInput(
			LATE_LEGACY_SESSION_ID,
			"late-legacy-owner",
			organizationId,
			"claude_code",
		);
		await getAdapter(lateLegacyInput.source).ingest(
			getClickhouse(),
			lateLegacyInput,
			{
				ingestedAt: new Date("2026-07-23T13:00:00.000Z"),
				organizationId,
				userId: owner.userId,
			},
		);

		const finalPreview = await previewSessionOwnershipCutover(finalCutoff);
		expect(finalPreview.claimableCount).toBeGreaterThanOrEqual(1);
		const finalCatchUp = await backfillSessionOwnership(finalCutoff);
		expect(finalCatchUp.claimedCount).toBe(finalPreview.claimableCount);

		const replay = await backfillSessionOwnership(finalCutoff);
		expect(replay.claimedCount).toBe(0);
		expect(replay.claimableCount).toBe(0);
		expect(replay.alreadyClaimedCount).toBe(
			finalPreview.alreadyClaimedCount + finalPreview.claimableCount,
		);

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

	test("does not overwrite an owner claimed concurrently during catch-up", async () => {
		const concurrentInput = createSessionInput(
			CONCURRENT_CATCHUP_SESSION_ID,
			"concurrent-catchup-owner",
			organizationId,
			"claude_code",
		);
		await getAdapter(concurrentInput.source).ingest(
			getClickhouse(),
			concurrentInput,
			{
				ingestedAt: new Date("2026-07-23T15:00:00.000Z"),
				organizationId,
				userId: owner.userId,
			},
		);
		await configureConcurrentClaim(member.userId);

		await expect(
			backfillSessionOwnership(new Date("2026-07-23T16:00:00.000Z")),
		).rejects.toThrow(
			"lost 1 claims to concurrent owners. No catch-up claims were committed",
		);

		const ownership = await sqlClient<Array<{ user_id: string }>>`
			SELECT user_id
			FROM session_ownership
			WHERE organization_id = ${organizationId}
				AND session_id = ${CONCURRENT_CATCHUP_SESSION_ID}
		`;
		expect(ownership).toHaveLength(1);
		expect(ownership[0]?.user_id).toBe(member.userId);
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

	test("ignores dangling memberships when routing an org-less API-key upload", async () => {
		const input = createSessionInput(ORGLESS_SESSION_ID, "org-less-api-key");
		delete input.organizationId;

		const response = await callApiKeyRpc(orglessApiKey, "ingestSession", input);

		expect(response.status).toBe(200);
		const [ownership] = await sqlClient<Array<{ user_id: string }>>`
			SELECT user_id
			FROM session_ownership
			WHERE organization_id = ${organizationId}
				AND session_id = ${ORGLESS_SESSION_ID}
		`;
		expect(ownership?.user_id).toBe(orgless.userId);
		await expectRawSessionOwner(
			"rudel.claude_sessions",
			organizationId,
			ORGLESS_SESSION_ID,
			orgless.userId,
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

async function configureConcurrentClaim(
	competingUserId: string,
): Promise<void> {
	const connectionString = process.env.PG_CONNECTION_STRING;
	if (!connectionString) {
		throw new Error("PG_CONNECTION_STRING is required for integration tests");
	}

	await sqlClient.unsafe("CREATE EXTENSION IF NOT EXISTS dblink");
	await sqlClient.unsafe(`
		CREATE TABLE IF NOT EXISTS session_ownership_concurrent_claim_test (
			session_id text PRIMARY KEY,
			organization_id text NOT NULL,
			planned_user_id text NOT NULL,
			competing_user_id text NOT NULL,
			connection_string text NOT NULL
		)
	`);
	await sqlClient`
		INSERT INTO session_ownership_concurrent_claim_test (
			session_id,
			organization_id,
			planned_user_id,
			competing_user_id,
			connection_string
		)
		VALUES (
			${CONCURRENT_CATCHUP_SESSION_ID},
			${organizationId},
			${owner.userId},
			${competingUserId},
			${connectionString}
		)
		ON CONFLICT (session_id) DO UPDATE SET
			organization_id = EXCLUDED.organization_id,
			planned_user_id = EXCLUDED.planned_user_id,
			competing_user_id = EXCLUDED.competing_user_id,
			connection_string = EXCLUDED.connection_string
	`;
	await sqlClient.unsafe(`
		CREATE OR REPLACE FUNCTION simulate_session_ownership_concurrent_claim()
		RETURNS trigger
		LANGUAGE plpgsql
		AS $$
		DECLARE
			competing_claim record;
		BEGIN
			SELECT *
			INTO competing_claim
			FROM session_ownership_concurrent_claim_test
			WHERE session_id = NEW.session_id
				AND organization_id = NEW.organization_id
				AND planned_user_id = NEW.user_id
			LIMIT 1;

			IF NOT FOUND THEN
				RETURN NEW;
			END IF;

			PERFORM dblink_exec(
				competing_claim.connection_string,
				format(
					'INSERT INTO session_ownership (organization_id, session_id, user_id) VALUES (%L, %L, %L) ON CONFLICT (organization_id, session_id) DO NOTHING',
					NEW.organization_id,
					NEW.session_id,
					competing_claim.competing_user_id
				)
			);
			RETURN NEW;
		END;
		$$
	`);
	await sqlClient.unsafe(
		"DROP TRIGGER IF EXISTS session_ownership_concurrent_claim_test_trigger ON session_ownership",
	);
	await sqlClient.unsafe(`
		CREATE TRIGGER session_ownership_concurrent_claim_test_trigger
		BEFORE INSERT ON session_ownership
		FOR EACH ROW
		EXECUTE FUNCTION simulate_session_ownership_concurrent_claim()
	`);
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

async function callApiKeyRpc(
	apiKey: string,
	path: string,
	input: Record<string, unknown>,
): Promise<RpcResponse> {
	const response = await fetch(`${server.baseUrl}/rpc/${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": apiKey,
		},
		body: JSON.stringify({ json: input }),
	});

	return {
		body: await response.json(),
		status: response.status,
	};
}

async function createIngestApiKey(accessToken: string): Promise<string> {
	const response = await fetch(`${server.baseUrl}/api/auth/api-key/create`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ expiresIn: null, name: "orgless-ingest-test" }),
	});
	if (!response.ok) {
		throw new Error(`API key creation failed: ${await response.text()}`);
	}

	const body: unknown = await response.json();
	if (
		typeof body !== "object" ||
		body === null ||
		!("key" in body) ||
		typeof body.key !== "string"
	) {
		throw new Error("API key creation returned an invalid response");
	}
	return body.key;
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
