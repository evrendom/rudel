import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import assert from "node:assert/strict";
import { sqlClient } from "../db.js";
import {
	claimSessionIngestOwnership,
	recordSessionIngestContent,
} from "../services/session-ownership.service.js";
import {
	type ApiTestServer,
	startApiTestServer,
} from "./helpers/api-test-server.js";

setDefaultTimeout(30_000);

const TEST_RUN_ID = `session_ingest_content_${crypto.randomUUID()}`;
const CLAIM_SESSION_ID = `${TEST_RUN_ID}_claim`;
const MONOTONIC_SESSION_ID = `${TEST_RUN_ID}_monotonic`;

let server: ApiTestServer;
let userId: string;

beforeAll(async () => {
	server = await startApiTestServer();
	userId = await createTestUser(server.baseUrl);
});

afterAll(async () => {
	await server?.stop();
	await sqlClient`
		DELETE FROM organization
		WHERE id = ${userId}
	`;
	await sqlClient`
		DELETE FROM "user"
		WHERE id = ${userId}
	`;
});

describe("session ingest content bookkeeping", () => {
	test("returns a null hash, records it, then returns the stored hash", async () => {
		const initialClaim = await claimSessionIngestOwnership(
			userId,
			CLAIM_SESSION_ID,
			userId,
		);
		assert(initialClaim.owned);
		expect(initialClaim.lastContentSha256).toBeNull();

		const contentHash = "a".repeat(64);
		await recordSessionIngestContent(
			userId,
			CLAIM_SESSION_ID,
			contentHash,
			new Date("2026-07-24T10:00:00.000Z"),
		);

		const repeatedClaim = await claimSessionIngestOwnership(
			userId,
			CLAIM_SESSION_ID,
			userId,
		);
		assert(repeatedClaim.owned);
		expect(repeatedClaim.lastContentSha256).toBe(contentHash);
	});

	test("does not let older bookkeeping overwrite a newer ingest", async () => {
		const initialClaim = await claimSessionIngestOwnership(
			userId,
			MONOTONIC_SESSION_ID,
			userId,
		);
		assert(initialClaim.owned);

		const newerHash = "b".repeat(64);
		const newerIngestedAt = new Date("2026-07-24T12:00:00.000Z");
		await recordSessionIngestContent(
			userId,
			MONOTONIC_SESSION_ID,
			newerHash,
			newerIngestedAt,
		);
		await recordSessionIngestContent(
			userId,
			MONOTONIC_SESSION_ID,
			"c".repeat(64),
			new Date("2026-07-24T11:00:00.000Z"),
		);

		const [row] = await sqlClient<
			Array<{
				last_content_sha256: string | null;
				last_ingested_at: string | null;
			}>
		>`
			SELECT last_content_sha256, last_ingested_at
			FROM session_ownership
			WHERE organization_id = ${userId}
				AND session_id = ${MONOTONIC_SESSION_ID}
		`;
		expect(row?.last_content_sha256).toBe(newerHash);
		expect(new Date(row?.last_ingested_at ?? "")).toEqual(newerIngestedAt);
	});
});

async function createTestUser(baseUrl: string): Promise<string> {
	const response = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email: `${TEST_RUN_ID}@example.com`,
			name: "Session Ingest Content Test",
			password: "session-ingest-content-test-password",
		}),
	});
	expect(response.ok).toBe(true);
	const body: unknown = await response.json();
	assert(isAuthResponse(body));

	const meResponse = await fetch(`${baseUrl}/rpc/me`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${body.token}`,
			"Content-Type": "application/json",
		},
		body: "{}",
	});
	expect(meResponse.ok).toBe(true);
	const meBody: unknown = await meResponse.json();
	assert(isMeResponse(meBody));
	return meBody.json.id;
}

function isAuthResponse(value: unknown): value is { token: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"token" in value &&
		typeof value.token === "string"
	);
}

function isMeResponse(value: unknown): value is { json: { id: string } } {
	return (
		typeof value === "object" &&
		value !== null &&
		"json" in value &&
		typeof value.json === "object" &&
		value.json !== null &&
		"id" in value.json &&
		typeof value.json.id === "string"
	);
}
