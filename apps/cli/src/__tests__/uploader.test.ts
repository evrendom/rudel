import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/client";
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
});
