import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import assert from "node:assert/strict";
import {
	type IngestSessionInput,
	SESSION_UPLOAD_SHRINK_REJECTED_CODE,
} from "@rudel/api-routes";
import { sqlClient } from "../db.js";
import { getIngestContentShape } from "../lib/ingest-content-shape.js";
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
const LEGACY_PASS_SESSION_ID = `${TEST_RUN_ID}_legacy_pass`;
const LEGACY_SHRINK_SESSION_ID = `${TEST_RUN_ID}_legacy_shrink`;

let server: ApiTestServer;
let userId: string;
let bearerToken: string;

beforeAll(async () => {
	server = await startApiTestServer();
	({ bearerToken, userId } = await createTestUser(server.baseUrl));
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
			contentShape(12_345, 42),
			5,
			new Date("2026-07-24T09:30:00.000Z"),
			new Date("2026-07-24T10:00:00.000Z"),
		);

		const repeatedClaim = await claimSessionIngestOwnership(
			userId,
			CLAIM_SESSION_ID,
			userId,
		);
		assert(repeatedClaim.owned);
		expect(repeatedClaim.lastContentSha256).toBe(contentHash);
		expect(repeatedClaim.lastContentBytes).toBe(12_345);
		expect(repeatedClaim.lastAssistantLineCount).toBe(42);
		expect(repeatedClaim.lastContentShape).toEqual(contentShape(12_345, 42));
		expect(repeatedClaim.lastFilterVersion).toBe(5);
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
			contentShape(20_000, 20),
			5,
			new Date("2026-07-24T09:30:00.000Z"),
			newerIngestedAt,
		);
		await recordSessionIngestContent(
			userId,
			MONOTONIC_SESSION_ID,
			"c".repeat(64),
			contentShape(10_000, 10),
			5,
			new Date("2026-07-24T09:30:00.000Z"),
			new Date("2026-07-24T11:00:00.000Z"),
		);

		const [row] = await sqlClient<
			Array<{
				last_assistant_line_count: number | null;
				last_content_bytes: number | null;
				last_content_sha256: string | null;
				last_ingested_at: string | null;
			}>
		>`
			SELECT
				last_content_sha256,
				last_content_bytes,
				last_assistant_line_count,
				last_ingested_at
			FROM session_ownership
			WHERE organization_id = ${userId}
				AND session_id = ${MONOTONIC_SESSION_ID}
		`;
		expect(row?.last_content_sha256).toBe(newerHash);
		expect(row?.last_content_bytes).toBe(20_000);
		expect(row?.last_assistant_line_count).toBe(20);
		expect(new Date(row?.last_ingested_at ?? "")).toEqual(newerIngestedAt);
	});

	test("drives the legacy fallback through total-vs-total pass and shrink rejection", async () => {
		const completeInput = makeClaudeInput(LEGACY_PASS_SESSION_ID, 5);
		await seedLegacyContentShape(completeInput);

		const legitimateResponse = await callIngest(completeInput);
		expect(legitimateResponse.status).toBe(200);

		const legacyShrinkBaseline = makeClaudeInput(LEGACY_SHRINK_SESSION_ID, 5);
		await seedLegacyContentShape(legacyShrinkBaseline);
		const truncatedInput = makeClaudeInput(LEGACY_SHRINK_SESSION_ID, 0);

		const shrinkResponse = await callIngest(truncatedInput);
		expect(shrinkResponse.status).toBe(409);
		expect(readRpcErrorCode(shrinkResponse.body)).toBe(
			SESSION_UPLOAD_SHRINK_REJECTED_CODE,
		);
	});
});

function contentShape(contentBytes: number, assistantLineCount: number) {
	return {
		assistantLineCount,
		contentBytes,
		main: { assistantLineCount, contentBytes },
		subagents: {},
		version: 1 as const,
	};
}

async function createTestUser(
	baseUrl: string,
): Promise<{ bearerToken: string; userId: string }> {
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
	return { bearerToken: body.token, userId: meBody.json.id };
}

async function seedLegacyContentShape(
	input: IngestSessionInput,
): Promise<void> {
	const ownership = await claimSessionIngestOwnership(
		userId,
		input.sessionId,
		userId,
	);
	assert(ownership.owned);
	const shape = getIngestContentShape(input);

	await sqlClient`
		UPDATE session_ownership
		SET
			last_content_bytes = ${shape.contentBytes},
			last_assistant_line_count = ${shape.assistantLineCount},
			last_content_shape_json = NULL
		WHERE organization_id = ${userId}
			AND session_id = ${input.sessionId}
	`;
}

async function callIngest(input: IngestSessionInput) {
	const response = await fetch(`${server.baseUrl}/rpc/ingestSession`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${bearerToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ json: input }),
	});

	return { body: await response.json(), status: response.status };
}

function makeClaudeInput(
	sessionId: string,
	subagentAssistantLines: number,
): IngestSessionInput {
	const assistantLine = (index: number) =>
		JSON.stringify({
			message: {
				content: `Assistant content ${index}`,
				role: "assistant",
				usage: { input_tokens: 2, output_tokens: 1 },
			},
			timestamp: `2026-07-24T09:30:${String(index).padStart(2, "0")}.000Z`,
			type: "assistant",
		});

	return {
		content: [
			JSON.stringify({
				message: { content: "Session content", role: "user" },
				timestamp: "2026-07-24T09:30:00.000Z",
				type: "user",
			}),
			assistantLine(1),
		].join("\n"),
		projectPath: "/test/session-ingest-content",
		sessionId,
		source: "claude_code",
		subagents:
			subagentAssistantLines === 0
				? []
				: [
						{
							agentId: "worker",
							content: Array.from(
								{ length: subagentAssistantLines },
								(_, index) => assistantLine(index + 2),
							).join("\n"),
						},
					],
		upload_mode: "manual",
	};
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
