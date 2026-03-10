import { describe, expect, test } from "bun:test";
import type { IngestSessionInput } from "@rudel/api-routes";
import {
	createIngestSecurityConfig,
	createInMemoryRateLimiter,
	getTotalSubagentByteLength,
	isIngestRequestTooLarge,
	validateIngestPayload,
} from "../ingest-security.js";

function makeInput(
	overrides: Partial<IngestSessionInput> = {},
): IngestSessionInput {
	return {
		source: "claude_code",
		sessionId: "session-1",
		projectPath: "/tmp/project",
		content: "hello",
		...overrides,
	};
}

describe("ingest security", () => {
	test("rejects transcripts that exceed the configured size", () => {
		const config = createIngestSecurityConfig({
			INGEST_MAX_CONTENT_BYTES: "4",
		});

		expect(() =>
			validateIngestPayload(makeInput({ content: "hello" }), config),
		).toThrow(/Transcript exceeds 4 bytes/);
	});

	test("rejects excessive aggregate subagent payloads", () => {
		const config = createIngestSecurityConfig({
			INGEST_MAX_TOTAL_SUBAGENT_BYTES: "5",
		});

		expect(() =>
			validateIngestPayload(
				makeInput({
					subagents: [
						{ agentId: "a", content: "123" },
						{ agentId: "b", content: "456" },
					],
				}),
				config,
			),
		).toThrow(/Subagent transcripts exceed 5 bytes/);
	});

	test("computes total subagent size in bytes", () => {
		expect(
			getTotalSubagentByteLength([
				{ agentId: "a", content: "123" },
				{ agentId: "b", content: "45" },
			]),
		).toBe(5);
	});

	test("flags oversized ingest requests by content-length header", () => {
		const config = createIngestSecurityConfig({
			INGEST_MAX_REQUEST_BYTES: "10",
		});
		const request = new Request("http://localhost/rpc/ingestSession", {
			method: "POST",
			headers: {
				"Content-Length": "11",
			},
			body: "x",
		});

		expect(isIngestRequestTooLarge(request, config)).toBe(true);
	});

	test("rate limiter blocks once the window budget is exhausted", () => {
		const limiter = createInMemoryRateLimiter({
			windowMs: 60_000,
			maxRequests: 2,
		});

		limiter.check("user-1", 1);
		limiter.check("user-1", 2);

		expect(() => limiter.check("user-1", 3)).toThrow(/rate limit exceeded/i);

		limiter.check("user-1", 61_000);
	});
});
