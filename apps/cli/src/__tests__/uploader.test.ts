import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import {
	INGEST_LIMIT_REASONS,
	SESSION_OWNERSHIP_CONFLICT_CODE,
} from "@rudel/api-routes";
import { formatUploadError, uploadSession } from "../lib/uploader.js";

describe("formatUploadError", () => {
	test("explains API key rate limits from ingest auth", () => {
		const error = new ORPCError("TOO_MANY_REQUESTS", {
			message: "API key rate limit exceeded",
			data: {
				reason: "api_key_rate_limited",
				code: "RATE_LIMITED",
				authMessage: "Rate limit exceeded",
			},
		});

		expect(formatUploadError(error)).toBe(
			"API key rate limit reached. Run `rudel login` to create a fresh ingest key, or wait for the key's rate-limit window to reset.",
		);
	});

	test("keeps existing session ingest rate limit message", () => {
		const error = new ORPCError("TOO_MANY_REQUESTS", {
			message: "Rate limit exceeded",
			data: {
				limit: 500,
				windowSeconds: 3600,
			},
		});

		expect(formatUploadError(error)).toBe(
			"Rate limit reached (500 sessions per 60 min). Wait and retry with: rudel upload --retry",
		);
	});

	test("explains ingest request limits", () => {
		const error = new ORPCError("TOO_MANY_REQUESTS", {
			data: {
				limit: 15_000,
				reason: INGEST_LIMIT_REASONS.requestLimit,
				windowSeconds: 3600,
			},
		});

		expect(formatUploadError(error)).toBe(
			"Ingest request limit reached (15000 requests per 60 min). Wait and retry with: rudel upload --retry",
		);
	});

	test("explains ingest byte limits", () => {
		const error = new ORPCError("TOO_MANY_REQUESTS", {
			data: {
				limit: 10 * 1024 * 1024 * 1024,
				reason: INGEST_LIMIT_REASONS.byteLimit,
				windowSeconds: 3600,
			},
		});

		expect(formatUploadError(error)).toBe(
			"Ingest byte limit reached (10240.00 MiB per 60 min). Wait and retry with: rudel upload --retry",
		);
	});

	test("keeps plain unauthorized errors unchanged", () => {
		const error = new ORPCError("UNAUTHORIZED");

		expect(formatUploadError(error)).toBe("401 Unauthorized");
	});

	test("explains session ownership conflicts", () => {
		const error = new ORPCError(SESSION_OWNERSHIP_CONFLICT_CODE, {
			status: 409,
		});

		expect(formatUploadError(error)).toBe(
			"This session ID is already owned by another organization member. Upload it from the original member account or use a different session ID.",
		);
	});

	test("explains oversized upload requests", () => {
		const error = new ORPCError("PAYLOAD_TOO_LARGE", {
			status: 413,
			data: {
				body: {
					error: "Request body too large. Maximum size is 500 MB.",
				},
			},
		});

		expect(formatUploadError(error)).toBe(
			"Upload request is too large (413 Payload Too Large). Request body too large. Maximum size is 500 MB. This is a request-size limit, not an auth or proxy issue. This session will keep failing until its transcript/subagent payload is smaller; other failed sessions can still be retried with: rudel upload --retry",
		);
	});

	test("explains the per-session transcript limit", () => {
		const error = new ORPCError("PAYLOAD_TOO_LARGE", {
			data: {
				actualBytes: 5 * 1024 * 1024,
				maxBytes: 4 * 1024 * 1024,
				reason: INGEST_LIMIT_REASONS.transcriptTooLarge,
			},
		});

		expect(formatUploadError(error)).toBe(
			"Session transcript payload is 5.00 MiB, above the 4.00 MiB per-session limit. Reduce the transcript/subagent payload before retrying.",
		);
	});

	test("explains transient gateway errors", () => {
		const error = new ORPCError("BAD_GATEWAY");

		expect(formatUploadError(error)).toBe(
			"Temporary Rudel server/proxy error (502 Bad Gateway). The CLI retries these automatically; retry remaining failed uploads with: rudel upload --retry",
		);
	});

	test("explains non-retryable server errors", () => {
		const error = new ORPCError("INTERNAL_SERVER_ERROR");

		expect(formatUploadError(error)).toBe(
			"Rudel server error (500 Internal Server Error). This is not an auth problem. Retry later with: rudel upload --retry; if it repeats, share this status with the Rudel team.",
		);
	});

	test("explains network errors", () => {
		const error = new TypeError("fetch failed");

		expect(formatUploadError(error)).toBe(
			"Network error while contacting Rudel API: fetch failed. Check your connection and retry with: rudel upload --retry",
		);
	});
});

describe("uploadSession aggregate size guard", () => {
	test("rejects an oversized aggregate before making a network attempt", async () => {
		const result = await uploadSession(
			{
				source: "claude_code",
				sessionId: "oversized-test",
				projectPath: "/test/project",
				content: "a".repeat(1024 * 1024),
				subagents: [{ agentId: "subagent", content: "b".repeat(1024 * 1024) }],
			},
			{
				endpoint: "http://127.0.0.1:1/rpc",
				maxAggregateBytes: 1024 * 1024,
				token: "unused",
			},
		);

		expect(result).toEqual({
			success: false,
			error:
				"Session transcript payload is 2.00 MiB, above the 1.00 MiB per-session limit. Reduce the transcript/subagent payload before retrying.",
			attempts: 0,
		});
	});
});
