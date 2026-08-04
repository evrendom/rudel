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
import {
	USAGE_EVENT_EXTRACTION_VERSION,
	USAGE_EVENT_IDENTITY_VERSION,
	USAGE_EVENT_MODEL_RATE_CARD_VERSION,
} from "@rudel/usage-events";
import { getClickhouse } from "../clickhouse.js";
import { sqlClient } from "../db.js";
import { getIngestContentShape } from "../lib/ingest-content-shape.js";
import {
	claimSessionIngestOwnership,
	recordSessionIngestContent,
	reserveUsageExtractionGeneration,
	UsageExtractionSupersededError,
} from "../services/session-ownership.service.js";
import { buildActiveUsageEventsCte } from "../services/usage-event-ingest.service.js";
import {
	type ApiTestServer,
	startApiTestServer,
} from "./helpers/api-test-server.js";

setDefaultTimeout(30_000);

const TEST_RUN_ID = `session_ingest_content_${crypto.randomUUID()}`;
const CLAIM_SESSION_ID = `${TEST_RUN_ID}_claim`;
const MONOTONIC_SESSION_ID = `${TEST_RUN_ID}_monotonic`;
const RECEIPT_SESSION_ID = `${TEST_RUN_ID}_receipt`;
const LEGACY_PASS_SESSION_ID = `${TEST_RUN_ID}_legacy_pass`;
const LEGACY_SHRINK_SESSION_ID = `${TEST_RUN_ID}_legacy_shrink`;
const FORCE_REPLACE_SESSION_ID = `${TEST_RUN_ID}_force_replace`;
const RAW_FIRST_FAILURE_SESSION_ID = `${TEST_RUN_ID}_raw_first_failure`;
const EXTRACTION_BYPASS_SESSION_ID = `${TEST_RUN_ID}_extraction_bypass`;
const GENERATION_HEDGE_SESSION_ID = `${TEST_RUN_ID}_generation_hedge`;

let server: ApiTestServer;
let userId: string;
let bearerToken: string;

beforeAll(async () => {
	server = await startApiTestServer();
	({ bearerToken, userId } = await createTestUser(server.baseUrl));
});

afterAll(async () => {
	await server?.stop();
	await getClickhouse().execute({
		query: `DELETE FROM rudel.usage_events WHERE organization_id = {organizationId:String} SETTINGS lightweight_deletes_sync = 3`,
		query_params: { organizationId: userId },
	});
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

	test("only the latest reserved generation can certify a usage receipt", async () => {
		const initialClaim = await claimSessionIngestOwnership(
			userId,
			RECEIPT_SESSION_ID,
			userId,
		);
		assert(initialClaim.owned);
		const olderGeneration = await reserveUsageExtractionGeneration(
			userId,
			RECEIPT_SESSION_ID,
			userId,
		);
		const latestGeneration = await reserveUsageExtractionGeneration(
			userId,
			RECEIPT_SESSION_ID,
			userId,
		);
		const contentHash = "d".repeat(64);
		const receipt = {
			checksum: "e".repeat(64),
			diagnostics: "[]",
			eventCount: 2,
			extractionVersion: USAGE_EVENT_EXTRACTION_VERSION,
			eventIdentityVersion: USAGE_EVENT_IDENTITY_VERSION,
			modelRateCardVersion: USAGE_EVENT_MODEL_RATE_CARD_VERSION,
		};

		await expect(
			recordSessionIngestContent(
				userId,
				RECEIPT_SESSION_ID,
				contentHash,
				contentShape(2_000, 2),
				5,
				new Date("2026-08-03T09:30:00.000Z"),
				new Date("2026-08-03T10:00:00.000Z"),
				{ ...receipt, generation: olderGeneration },
			),
		).rejects.toBeInstanceOf(UsageExtractionSupersededError);
		const afterRejectedGeneration = await claimSessionIngestOwnership(
			userId,
			RECEIPT_SESSION_ID,
			userId,
		);
		assert(afterRejectedGeneration.owned);
		expect(afterRejectedGeneration.lastContentSha256).toBeNull();
		expect(afterRejectedGeneration.lastUsageContentSha256).toBeNull();
		await expect(
			recordSessionIngestContent(
				userId,
				RECEIPT_SESSION_ID,
				contentHash,
				contentShape(2_000, 2),
				5,
				new Date("2026-08-03T09:30:00.000Z"),
				new Date("2026-08-03T10:00:01.000Z"),
				{ ...receipt, generation: latestGeneration },
			),
		).resolves.toBeUndefined();

		const completedClaim = await claimSessionIngestOwnership(
			userId,
			RECEIPT_SESSION_ID,
			userId,
		);
		assert(completedClaim.owned);
		expect(completedClaim.lastUsageContentSha256).toBe(contentHash);
		expect(completedClaim.lastUsageChecksum).toBe(receipt.checksum);
		expect(completedClaim.lastUsageExtractionVersion).toBe(
			USAGE_EVENT_EXTRACTION_VERSION,
		);
		expect(completedClaim.lastUsageEventIdentityVersion).toBe(
			USAGE_EVENT_IDENTITY_VERSION,
		);
		expect(completedClaim.lastUsageModelRateCardVersion).toBe(
			USAGE_EVENT_MODEL_RATE_CARD_VERSION,
		);
	});

	test("V11 generations survive a Postgres row reset by using the epoch floor", async () => {
		const claim = await claimSessionIngestOwnership(
			userId,
			GENERATION_HEDGE_SESSION_ID,
			userId,
		);
		assert(claim.owned);
		const [beforeReservation] = await sqlClient<Array<{ epoch_ms: string }>>`
			SELECT FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint::text AS epoch_ms
		`;
		assert(beforeReservation);
		const first = BigInt(
			await reserveUsageExtractionGeneration(
				userId,
				GENERATION_HEDGE_SESSION_ID,
				userId,
			),
		);
		const second = BigInt(
			await reserveUsageExtractionGeneration(
				userId,
				GENERATION_HEDGE_SESSION_ID,
				userId,
			),
		);
		const [afterReservation] = await sqlClient<Array<{ epoch_ms: string }>>`
			SELECT FLOOR(EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::bigint::text AS epoch_ms
		`;
		assert(afterReservation);

		expect(first).toBeGreaterThanOrEqual(BigInt(beforeReservation.epoch_ms));
		expect(first).toBeLessThanOrEqual(BigInt(afterReservation.epoch_ms));
		expect(second).toBeGreaterThan(first);
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

	test("force replacement retires request facts absent from the accepted generation", async () => {
		const completeInput = makeClaudeInput(FORCE_REPLACE_SESSION_ID, 1);
		expect((await callIngest(completeInput)).status).toBe(200);
		expect(await readActiveUsageEventCount(FORCE_REPLACE_SESSION_ID)).toBe(2);

		const replacementInput = makeClaudeInput(FORCE_REPLACE_SESSION_ID, 0);
		replacementInput.force_replace = true;
		expect((await callIngest(replacementInput)).status).toBe(200);
		expect(await readActiveUsageEventCount(FORCE_REPLACE_SESSION_ID)).toBe(1);
	});

	test("stores raw before rejecting genuinely usage-bearing malformed telemetry", async () => {
		const malformedInput = makeClaudeInput(RAW_FIRST_FAILURE_SESSION_ID, 0);
		malformedInput.content += '\n{"type":"assistant","message":{"usage":';

		const response = await callIngest(malformedInput);

		expect(response.status).toBe(503);
		expect(await rawClaudeSessionExists(RAW_FIRST_FAILURE_SESSION_ID)).toBe(
			true,
		);
		expect(
			await readLatestReceiptCompleteness(RAW_FIRST_FAILURE_SESSION_ID),
		).toBe(0);
	});

	test("the operational bypass acknowledges raw without claiming extraction", async () => {
		const previous = process.env.USAGE_EVENT_EXTRACTION_ENABLED;
		process.env.USAGE_EVENT_EXTRACTION_ENABLED = "false";
		try {
			const response = await callIngest(
				makeClaudeInput(EXTRACTION_BYPASS_SESSION_ID, 0),
			);

			expect(response.status).toBe(200);
			expect(await rawClaudeSessionExists(EXTRACTION_BYPASS_SESSION_ID)).toBe(
				true,
			);
			expect(
				await readLatestReceiptCompleteness(EXTRACTION_BYPASS_SESSION_ID),
			).toBeNull();
		} finally {
			if (previous === undefined) {
				delete process.env.USAGE_EVENT_EXTRACTION_ENABLED;
			} else {
				process.env.USAGE_EVENT_EXTRACTION_ENABLED = previous;
			}
		}
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

async function readActiveUsageEventCount(sessionId: string): Promise<number> {
	const [row] = await getClickhouse().query<{ event_count: number }>({
		query: `
			WITH ${buildActiveUsageEventsCte()}
			SELECT count() AS event_count
			FROM active_usage_events
		`,
		query_params: {
			organizationId: userId,
			sessionId,
			source: "claude_code",
			userId,
		},
	});
	return row?.event_count ?? 0;
}

async function rawClaudeSessionExists(sessionId: string): Promise<boolean> {
	const [row] = await getClickhouse().query<{ present: number }>({
		query: `
			SELECT 1 AS present
			FROM rudel.claude_sessions
			WHERE organization_id = {organizationId:String}
				AND user_id = {userId:String}
				AND session_id = {sessionId:String}
			LIMIT 1
		`,
		query_params: { organizationId: userId, sessionId, userId },
	});
	return row?.present === 1;
}

async function readLatestReceiptCompleteness(
	sessionId: string,
): Promise<number | null> {
	const [row] = await getClickhouse().query<{ complete: number }>({
		query: `
			SELECT argMax(receipt_is_complete, event_version) AS complete
			FROM rudel.usage_events
			WHERE organization_id = {organizationId:String}
				AND user_id = {userId:String}
				AND source = 'claude_code'
				AND session_id = {sessionId:String}
				AND record_kind = 'receipt'
			HAVING count() > 0
		`,
		query_params: { organizationId: userId, sessionId, userId },
	});
	return row?.complete ?? null;
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
