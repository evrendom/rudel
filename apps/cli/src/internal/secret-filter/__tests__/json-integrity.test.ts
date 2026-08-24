import { describe, expect, test } from "bun:test";
import {
	assertFilteredJsonValidity,
	filterSessionTextFields,
	SecretFilterJsonIntegrityError,
} from "../index.js";

describe("post-filter JSON validity", () => {
	test("keeps valid JSONL parseable after redaction", () => {
		const anthropicApiKey = `sk-ant-api03-${"CANARY".padEnd(93, "A")}AA`;
		const content = [
			JSON.stringify({ token: anthropicApiKey }),
			JSON.stringify({ message: "still valid" }),
		].join("\n");
		const result = filterSessionTextFields({ content, subagents: undefined });

		expect(result.content).toContain("[REDACTED:");
		for (const line of result.content.split("\n")) {
			expect(() => JSON.parse(line)).not.toThrow();
		}
	});

	test("fails closed if a future rule damages valid transcript JSON", () => {
		expect(() =>
			assertFilteredJsonValidity('{"message":"safe"}', '{"message":'),
		).toThrow(SecretFilterJsonIntegrityError);
	});

	test("does not impose JSON parsing on plain text fields", () => {
		expect(() =>
			assertFilteredJsonValidity("plain transcript text", "plain [REDACTED]"),
		).not.toThrow();
	});
});
