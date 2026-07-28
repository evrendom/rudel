import { describe, expect, test } from "bun:test";
import { applyCompiledSecretRule, compileSecretRule } from "../filter.js";
import {
	filterKnownSecrets,
	getUtf8ByteLength,
	MAX_REDACTION_SPAN_BYTES,
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

describe("redaction span cap on a real rule", () => {
	test("a whole 8191-byte secret redacts with exact byte equality", () => {
		const secret = buildSlackSecretOfBytes(MAX_REDACTION_SPAN_BYTES - 1);
		const result = filterKnownSecrets(secret);

		expect(result.text).toBe("[REDACTED:slack-bot-token]");
		expect(result.counts).toEqual({ "slack-bot-token": 1 });
		// Non-truncated spans keep the redactedBytes === utf8(secret) contract.
		expect(result.redactedBytes).toBe(getUtf8ByteLength(secret));
		expect(result.redactedBytes).toBe(MAX_REDACTION_SPAN_BYTES - 1);
	});

	test("an 8192-byte secret sits exactly at the cap without truncation", () => {
		const secret = buildSlackSecretOfBytes(MAX_REDACTION_SPAN_BYTES);
		const result = filterKnownSecrets(secret);

		expect(result.text).toBe("[REDACTED:slack-bot-token]");
		expect(result.counts).toEqual({ "slack-bot-token": 1 });
		expect(result.redactedBytes).toBe(getUtf8ByteLength(secret));
		expect(result.redactedBytes).toBe(MAX_REDACTION_SPAN_BYTES);
	});

	test("an 8193-byte secret truncates to the cap and counts overlong-truncated", () => {
		const secret = buildSlackSecretOfBytes(MAX_REDACTION_SPAN_BYTES + 1);
		const result = filterKnownSecrets(secret);

		// The byte past the cap survives as preserved tail after the marker.
		expect(result.text).toBe("[REDACTED:slack-bot-token]A");
		expect(result.counts).toEqual({
			"slack-bot-token": 1,
			[OVERLONG_REDACTION_RULE_ID]: 1,
		});
		// Truncated spans do NOT satisfy redactedBytes === utf8(secret); they
		// land at the cap.
		expect(result.redactedBytes).toBe(MAX_REDACTION_SPAN_BYTES);
		expect(getUtf8ByteLength(secret)).toBe(MAX_REDACTION_SPAN_BYTES + 1);
	});
});

describe("multi-byte UTF-8 characters straddling the cap", () => {
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
		readonly expectedBytes: number;
		readonly expectedTail: string;
	}[] = [
		{
			label: "2-byte é at offset 8191 backs off to 8191",
			character: "é",
			characterBytes: 2,
			asciiPrefixLength: 8191,
			expectedBytes: 8191,
			expectedTail: "éTAIL",
		},
		{
			label: "3-byte 日 at offset 8191 backs off to 8191",
			character: "日",
			characterBytes: 3,
			asciiPrefixLength: 8191,
			expectedBytes: 8191,
			expectedTail: "日TAIL",
		},
		{
			label: "3-byte 日 at offset 8190 backs off to 8190",
			character: "日",
			characterBytes: 3,
			asciiPrefixLength: 8190,
			expectedBytes: 8190,
			expectedTail: "日TAIL",
		},
		{
			label: "3-byte 日 at offset 8189 fits the cap exactly and is consumed",
			character: "日",
			characterBytes: 3,
			asciiPrefixLength: 8189,
			expectedBytes: 8192,
			expectedTail: "TAIL",
		},
		{
			label: "4-byte 🔑 at offset 8190 backs off to 8190",
			character: "🔑",
			characterBytes: 4,
			asciiPrefixLength: 8190,
			expectedBytes: 8190,
			expectedTail: "🔑TAIL",
		},
	];

	for (const straddle of straddleCases) {
		test(straddle.label, () => {
			expect(getUtf8ByteLength(straddle.character)).toBe(
				straddle.characterBytes,
			);
			const secret = `${"a".repeat(straddle.asciiPrefixLength)}${straddle.character}TAIL`;
			const result = applyCompiledSecretRule(`BEGINSPAN${secret}`, compiled);

			expect(result.text).toBe(
				`BEGINSPAN[REDACTED:synthetic-multibyte]${straddle.expectedTail}`,
			);
			expect(result.counts).toEqual({
				"synthetic-multibyte": 1,
				[OVERLONG_REDACTION_RULE_ID]: 1,
			});
			expect(result.redactedBytes).toBe(straddle.expectedBytes);
			// Truncated multi-byte spans land in [cap - 3, cap]: the engine backs
			// off up to characterBytes - 1 bytes rather than splitting the code
			// point, so exact utf8(secret) equality does not apply here.
			expect(result.redactedBytes).toBeLessThanOrEqual(
				MAX_REDACTION_SPAN_BYTES,
			);
			expect(result.redactedBytes).toBeGreaterThanOrEqual(
				MAX_REDACTION_SPAN_BYTES - 3,
			);
			// Never split a code point: the output stays valid UTF-16 with the
			// straddling character intact, no replacement characters introduced.
			expect(isWellFormedUtf16(result.text)).toBe(true);
			expect(result.text).not.toContain("�");
		});
	}
});

describe("a real secret hidden in the preserved tail of an overlong match", () => {
	test("the fixpoint loop still catches an AWS canary beyond the cap", () => {
		// The AWS canary starts exactly at byte 8192 of the slack-bot secret, so
		// truncation puts it at the head of the preserved tail. In the raw text
		// it is embedded mid-token (no word boundary), so only the pass after
		// the slack redaction can see it — behind the marker's "]".
		const filler = "A".repeat(MAX_REDACTION_SPAN_BYTES - SLACK_PREFIX.length);
		const secret = `${SLACK_PREFIX}${filler}${AWS_CANARY}-${"B".repeat(9)}`;
		expect(getUtf8ByteLength(`${SLACK_PREFIX}${filler}`)).toBe(
			MAX_REDACTION_SPAN_BYTES,
		);

		const result = filterKnownSecrets(secret);

		expect(result.text).toBe(
			`[REDACTED:slack-bot-token][REDACTED:aws-access-key-id]-${"B".repeat(9)}`,
		);
		expect(result.text).not.toContain(AWS_CANARY);
		expect(result.counts).toEqual({
			"slack-bot-token": 1,
			[OVERLONG_REDACTION_RULE_ID]: 1,
			"aws-access-key-id": 1,
		});
		expect(result.redactedBytes).toBe(
			MAX_REDACTION_SPAN_BYTES + getUtf8ByteLength(AWS_CANARY),
		);
	});
});
