import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
import { SESSION_OWNERSHIP_CONFLICT_CODE } from "@rudel/api-routes";
import { formatUploadError } from "../lib/uploader.js";

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
