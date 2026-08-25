import { describe, expect, test } from "bun:test";
import { applyCompiledSecretRule, compileSecretRule } from "../filter.js";
import {
	filterKnownSecrets,
	getUtf8ByteLength,
	OVERLONG_MATCH_THRESHOLD_BYTES,
	OVERLONG_REDACTION_RULE_ID,
} from "../index.js";
import type { SecretRule } from "../types.js";
import { AWS_CANARY, isWellFormedUtf16 } from "./helpers/rule-corpus.js";

// 27 bytes of fixed slack-bot prefix; the unbounded [a-zA-Z0-9-]* tail lets a
// real generated rule produce a secret of any exact byte length.
const SLACK_PREFIX = "xoxb-1234567890-1234567890-";

function buildSlackSecretOfBytes(totalBytes: number): string {
	return `${SLACK_PREFIX}${"A".repeat(totalBytes - SLACK_PREFIX.length)}`;
}

describe("overlong match diagnostics on a real rule", () => {
	test("a whole 8191-byte secret redacts with exact byte equality", () => {
		const secret = buildSlackSecretOfBytes(OVERLONG_MATCH_THRESHOLD_BYTES - 1);
		const result = filterKnownSecrets(secret);

		expect(result.text).toBe("[REDACTED:slack-bot-token]");
		expect(result.counts).toEqual({ "slack-bot-token": 1 });
		expect(result.redactedBytes).toBe(getUtf8ByteLength(secret));
		expect(result.redactedBytes).toBe(OVERLONG_MATCH_THRESHOLD_BYTES - 1);
	});

	test("an 8192-byte secret sits exactly at the diagnostic threshold", () => {
		const secret = buildSlackSecretOfBytes(OVERLONG_MATCH_THRESHOLD_BYTES);
		const result = filterKnownSecrets(secret);

		expect(result.text).toBe("[REDACTED:slack-bot-token]");
		expect(result.counts).toEqual({ "slack-bot-token": 1 });
		expect(result.redactedBytes).toBe(getUtf8ByteLength(secret));
		expect(result.redactedBytes).toBe(OVERLONG_MATCH_THRESHOLD_BYTES);
	});

	test("an 8193-byte secret fully redacts and counts an overlong match", () => {
		const secret = buildSlackSecretOfBytes(OVERLONG_MATCH_THRESHOLD_BYTES + 1);
		const result = filterKnownSecrets(secret);

		expect(result.text).toBe("[REDACTED:slack-bot-token]");
		expect(result.counts).toEqual({
			"slack-bot-token": 1,
			[OVERLONG_REDACTION_RULE_ID]: 1,
		});
		expect(result.redactedBytes).toBe(getUtf8ByteLength(secret));
		expect(result.redactedBytes).toBe(OVERLONG_MATCH_THRESHOLD_BYTES + 1);
	});
});

describe("multi-byte UTF-8 characters past the diagnostic threshold", () => {
	// No generated rule admits non-ASCII in its body, so the straddle needs a
	// synthetic rule driven through the same engine entry points filter.test.ts
	// already uses for the overlong-resume case.
	const synthetic: SecretRule = {
		id: "synthetic-multibyte",
		sourceId: "synthetic-multibyte",
		regexSource: "BEGINSPAN(\\S+)",
		caseInsensitive: false,
		secretGroup: 1,
		allowlistRegexSources: [],
	};
	const compiled = compileSecretRule(synthetic);

	const straddleCases: readonly {
		readonly label: string;
		readonly character: string;
		readonly characterBytes: number;
		readonly asciiPrefixLength: number;
	}[] = [
		{
			label: "2-byte é after 8191 ASCII bytes fully redacts",
			character: "é",
			characterBytes: 2,
			asciiPrefixLength: 8191,
		},
		{
			label: "3-byte 日 after 8191 ASCII bytes fully redacts",
			character: "日",
			characterBytes: 3,
			asciiPrefixLength: 8191,
		},
		{
			label: "3-byte 日 after 8190 ASCII bytes fully redacts",
			character: "日",
			characterBytes: 3,
			asciiPrefixLength: 8190,
		},
		{
			label: "3-byte 日 at the 8192-byte boundary fully redacts",
			character: "日",
			characterBytes: 3,
			asciiPrefixLength: 8189,
		},
		{
			label: "4-byte 🔑 after 8190 ASCII bytes fully redacts",
			character: "🔑",
			characterBytes: 4,
			asciiPrefixLength: 8190,
		},
	];

	for (const straddle of straddleCases) {
		test(straddle.label, () => {
			expect(getUtf8ByteLength(straddle.character)).toBe(
				straddle.characterBytes,
			);
			const secret = `${"a".repeat(straddle.asciiPrefixLength)}${straddle.character}TAIL`;
			const result = applyCompiledSecretRule(`BEGINSPAN${secret}`, compiled);

			expect(result.text).toBe("BEGINSPAN[REDACTED:synthetic-multibyte]");
			expect(result.counts).toEqual({
				"synthetic-multibyte": 1,
				[OVERLONG_REDACTION_RULE_ID]: 1,
			});
			expect(result.redactedBytes).toBe(getUtf8ByteLength(secret));
			expect(result.redactedBytes).toBeGreaterThan(
				OVERLONG_MATCH_THRESHOLD_BYTES,
			);
			expect(isWellFormedUtf16(result.text)).toBe(true);
			expect(result.text).not.toContain("�");
		});
	}
});

describe("a real secret embedded inside an overlong match", () => {
	test("the entire outer match is removed without preserving the nested value", () => {
		const filler = "A".repeat(
			OVERLONG_MATCH_THRESHOLD_BYTES - SLACK_PREFIX.length,
		);
		const secret = `${SLACK_PREFIX}${filler}${AWS_CANARY}-${"B".repeat(9)}`;
		expect(getUtf8ByteLength(`${SLACK_PREFIX}${filler}`)).toBe(
			OVERLONG_MATCH_THRESHOLD_BYTES,
		);

		const result = filterKnownSecrets(secret);

		expect(result.text).toBe("[REDACTED:slack-bot-token]");
		expect(result.text).not.toContain(AWS_CANARY);
		expect(result.counts).toEqual({
			"slack-bot-token": 1,
			[OVERLONG_REDACTION_RULE_ID]: 1,
		});
		expect(result.redactedBytes).toBe(getUtf8ByteLength(secret));
	});
});
