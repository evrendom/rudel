import { describe, expect, test } from "bun:test";
import { applyCompiledSecretRule, compileSecretRule } from "../filter.js";
import { GENERATED_SECRET_RULES } from "../generated-rules.js";
import {
	filterKnownSecrets,
	filterSessionTextFields,
	getRedactionCount,
	getUtf8ByteLength,
	MAX_REDACTION_SPAN_BYTES,
	OVERLONG_REDACTION_RULE_ID,
} from "../index.js";
import type { SecretRule } from "../types.js";
import {
	AWS_CANARY,
	CANONICAL_SECRETS,
	OPENAI_CANARY,
	PRESERVED_CORPUS,
} from "./helpers/rule-corpus.js";

test("generated rules avoid unsupported inline pattern modifiers", () => {
	for (const rule of GENERATED_SECRET_RULES) {
		for (const source of [rule.regexSource, ...rule.allowlistRegexSources]) {
			expect(source).not.toMatch(/\(\?[ims](?::|\))/u);
		}
	}
});

test("uses capture indices when the full match repeats the secret", () => {
	const rule: SecretRule = {
		id: "capture-span-regression",
		sourceId: "capture-span-regression",
		regexSource: "(secret) then (secret)",
		caseInsensitive: false,
		secretGroup: 2,
		allowlistRegexSources: [],
	};

	expect(
		applyCompiledSecretRule("secret then secret", compileSecretRule(rule)).text,
	).toBe("secret then [REDACTED:capture-span-regression]");
});

describe("filterKnownSecrets", () => {
	for (const positiveCase of CANONICAL_SECRETS) {
		test(`redacts ${positiveCase.ruleId}`, () => {
			const result = filterKnownSecrets(positiveCase.input);

			expect(result.text.includes(positiveCase.secret)).toBe(false);
			expect(result.text).toContain(`[REDACTED:${positiveCase.ruleId}]`);
			expect(result.counts).toEqual({ [positiveCase.ruleId]: 1 });
			expect(result.redactedBytes).toBe(getUtf8ByteLength(positiveCase.secret));
		});
	}

	test("counts repeated matches without exposing their values", () => {
		const result = filterKnownSecrets(
			`${OPENAI_CANARY}\n${OPENAI_CANARY}\n${AWS_CANARY}`,
		);

		expect(result.counts).toEqual({
			"aws-access-key-id": 1,
			"openai-api-key": 2,
		});
		expect(getRedactionCount(result.counts)).toBe(3);
	});

	for (const [name, input] of PRESERVED_CORPUS) {
		test(`preserves ${name} byte-identically`, () => {
			expect(filterKnownSecrets(input)).toEqual({
				text: input,
				counts: {},
				redactedBytes: 0,
			});
		});
	}

	test("preserves text after a scoped case-insensitive match", () => {
		const input = `SG.${"a".repeat(66)};next=true`;
		expect(filterKnownSecrets(input).text).toBe(
			"[REDACTED:sendgrid-api-token];next=true",
		);
	});

	test("preserves the surrounding transcript structure", () => {
		const input = `{"key":"${AWS_CANARY}","next":true}`;
		expect(filterKnownSecrets(input).text).toBe(
			'{"key":"[REDACTED:aws-access-key-id]","next":true}',
		);
	});

	test("preserves the 390-byte PEM prose repro byte-identically", () => {
		const falseMention = [
			"my cert tool prints -----BEGIN PRIVATE KEY----- as a header",
			"then emits ordinary prose, punctuation, and a code block:",
			"```ts",
			'console.log("this is documentation, not key material");',
			"```",
			"and the footer is -----END PRIVATE KEY-----, right?",
		]
			.join("\n")
			.padEnd(390, "x");
		const genuineKey = [
			"-----BEGIN PRIVATE KEY-----",
			"CANARY".padEnd(128, "A"),
			"-----END PRIVATE KEY-----",
		].join("\n");
		const input = `${falseMention}\n\nActual fixture:\n${genuineKey}`;
		const result = filterKnownSecrets(input);

		expect(getUtf8ByteLength(falseMention)).toBe(390);
		expect(result.text).toBe(
			`${falseMention}\n\nActual fixture:\n[REDACTED:private-key]`,
		);
		expect(result.counts).toEqual({ "private-key": 1 });
		expect(result.redactedBytes).toBe(getUtf8ByteLength(genuineKey));
	});
});

test("caps an overlong span and resumes scanning at the truncation boundary", () => {
	const rule: SecretRule = {
		id: "synthetic-overlong",
		sourceId: "synthetic-overlong",
		regexSource: "(?:RUN|SECRET)([A-Z]+)",
		caseInsensitive: false,
		secretGroup: 1,
		allowlistRegexSources: [],
	};
	const preservedTail = "A".repeat(9000 - MAX_REDACTION_SPAN_BYTES);
	const result = applyCompiledSecretRule(
		`RUN${"A".repeat(9000)}SECRETTAIL`,
		compileSecretRule(rule),
	);

	expect(result.text).toBe(
		`RUN[REDACTED:synthetic-overlong]${preservedTail}SECRET[REDACTED:synthetic-overlong]`,
	);
	expect(result.counts).toEqual({
		[OVERLONG_REDACTION_RULE_ID]: 1,
		"synthetic-overlong": 2,
	});
	expect(result.redactedBytes).toBe(MAX_REDACTION_SPAN_BYTES + 4);
});

test("engine-bounds worst-case generated rule redactions", () => {
	const worstCases = new Map(
		CANONICAL_SECRETS.map((positiveCase) => [
			positiveCase.ruleId,
			positiveCase.input,
		]),
	);
	worstCases.set(
		"private-key",
		[
			"-----BEGIN PRIVATE KEY-----",
			"A".repeat(6900),
			"-----END PRIVATE KEY-----",
		].join("\n"),
	);
	worstCases.set(
		"slack-bot-token",
		`xoxb-1234567890-1234567890-${"A".repeat(MAX_REDACTION_SPAN_BYTES * 2)}`,
	);

	expect([...worstCases.keys()].sort()).toEqual(
		GENERATED_SECRET_RULES.map((rule) => rule.id).sort(),
	);
	for (const rule of GENERATED_SECRET_RULES) {
		const input = worstCases.get(rule.id);
		expect(input).toBeDefined();
		const result = applyCompiledSecretRule(
			input ?? "",
			compileSecretRule(rule),
		);
		expect(result.redactedBytes).toBeLessThanOrEqual(MAX_REDACTION_SPAN_BYTES);
	}
});

describe("filterSessionTextFields", () => {
	test("filters the transcript and every subagent while preserving metadata", () => {
		const result = filterSessionTextFields({
			content: OPENAI_CANARY,
			subagents: [
				{ agentId: "agent-1", content: AWS_CANARY, rank: 1 },
				{ agentId: "agent-2", content: "benign", rank: 2 },
			],
		});

		expect(result.content).toBe("[REDACTED:openai-api-key]");
		expect(result.subagents).toEqual([
			{
				agentId: "agent-1",
				content: "[REDACTED:aws-access-key-id]",
				rank: 1,
			},
			{ agentId: "agent-2", content: "benign", rank: 2 },
		]);
		expect(result.counts).toEqual({
			"aws-access-key-id": 1,
			"openai-api-key": 1,
		});
		expect(result.redactedBytes).toBe(
			getUtf8ByteLength(OPENAI_CANARY) + getUtf8ByteLength(AWS_CANARY),
		);
	});
});
