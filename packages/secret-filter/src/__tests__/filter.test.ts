import { describe, expect, test } from "bun:test";
import { applyCompiledSecretRule, compileSecretRule } from "../filter.js";
import { GENERATED_SECRET_RULES } from "../generated-rules.js";
import {
	filterKnownSecrets,
	filterSessionTextFields,
	getRedactionCount,
} from "../index.js";
import type { SecretRule } from "../types.js";

interface PositiveCase {
	readonly ruleId: string;
	readonly secret: string;
	readonly input: string;
}

const OPENAI_CANARY = `sk-${"CANARY".padEnd(20, "A")}T3BlbkFJ${"CANARY".padEnd(20, "B")}`;
const AWS_CANARY = "AKIACANARY234567ABCD";

const POSITIVE_CASES: readonly PositiveCase[] = [
	{
		ruleId: "anthropic-admin-api-key",
		secret: `sk-ant-admin01-${"CANARY".padEnd(93, "A")}AA`,
		input: `ANTHROPIC_ADMIN=${`sk-ant-admin01-${"CANARY".padEnd(93, "A")}AA`}`,
	},
	{
		ruleId: "anthropic-api-key",
		secret: `sk-ant-api03-${"CANARY".padEnd(93, "A")}AA`,
		input: `ANTHROPIC_API_KEY=${`sk-ant-api03-${"CANARY".padEnd(93, "A")}AA`}`,
	},
	{
		ruleId: "aws-access-key-id",
		secret: AWS_CANARY,
		input: `AWS_ACCESS_KEY_ID=${AWS_CANARY}`,
	},
	{
		ruleId: "google-api-key",
		secret: `AIza${"CANARY".padEnd(35, "A")}`,
		input: `GOOGLE_API_KEY=AIza${"CANARY".padEnd(35, "A")}`,
	},
	{
		ruleId: "github-app-token",
		secret: `ghs_${"CANARY".padEnd(36, "A")}`,
		input: `token=ghs_${"CANARY".padEnd(36, "A")}`,
	},
	{
		ruleId: "github-fine-grained-pat",
		secret: `github_pat_${"CANARY".padEnd(82, "A")}`,
		input: `token=github_pat_${"CANARY".padEnd(82, "A")}`,
	},
	{
		ruleId: "github-oauth",
		secret: `gho_${"CANARY".padEnd(36, "A")}`,
		input: `token=gho_${"CANARY".padEnd(36, "A")}`,
	},
	{
		ruleId: "github-pat",
		secret: `ghp_${"CANARY".padEnd(36, "A")}`,
		input: `token=ghp_${"CANARY".padEnd(36, "A")}`,
	},
	{
		ruleId: "gitlab-pat",
		secret: `glpat-${"CANARY".padEnd(20, "A")}`,
		input: `token=glpat-${"CANARY".padEnd(20, "A")}`,
	},
	{
		ruleId: "npm-access-token",
		secret: `npm_${"CANARY".padEnd(36, "A")}`,
		input: `//registry.npmjs.org/:_authToken=npm_${"CANARY".padEnd(36, "A")}`,
	},
	{
		ruleId: "openai-api-key",
		secret: OPENAI_CANARY,
		input: `OPENAI_API_KEY=${OPENAI_CANARY}`,
	},
	{
		ruleId: "private-key",
		secret: [
			"-----BEGIN PRIVATE KEY-----",
			"CANARY".padEnd(64, "A"),
			"-----END PRIVATE KEY-----",
		].join("\n"),
		input: [
			"key:",
			"-----BEGIN PRIVATE KEY-----",
			"CANARY".padEnd(64, "A"),
			"-----END PRIVATE KEY-----",
		].join("\n"),
	},
	{
		ruleId: "sendgrid-api-token",
		secret: `SG.${"CANARY".padEnd(66, "A")}`,
		input: `SENDGRID_API_KEY=SG.${"CANARY".padEnd(66, "A")}`,
	},
	{
		ruleId: "slack-bot-token",
		secret: "xoxb-1234567890-1234567890-CANARY",
		input: "SLACK_BOT_TOKEN=xoxb-1234567890-1234567890-CANARY",
	},
	{
		ruleId: "slack-user-token",
		secret: `xoxp-1234567890-1234567890-1234567890-${"CANARY".padEnd(28, "A")}`,
		input: `SLACK_USER_TOKEN=xoxp-1234567890-1234567890-1234567890-${"CANARY".padEnd(28, "A")}`,
	},
	{
		ruleId: "slack-webhook-url",
		secret: `https://hooks.slack.com/services/${"CANARY".padEnd(43, "A")}`,
		input: `webhook=https://hooks.slack.com/services/${"CANARY".padEnd(43, "A")}`,
	},
	{
		ruleId: "stripe-access-token",
		secret: `sk_live_${"CANARY".padEnd(24, "A")}`,
		input: `STRIPE_SECRET_KEY=sk_live_${"CANARY".padEnd(24, "A")}`,
	},
	{
		ruleId: "stripe-access-token",
		secret: `rk_live_${"CANARY".padEnd(24, "A")}`,
		input: `STRIPE_RESTRICTED_KEY=rk_live_${"CANARY".padEnd(24, "A")}`,
	},
	{
		ruleId: "twilio-api-key",
		secret: `SK${"CA".repeat(16)}`,
		input: `TWILIO_API_KEY=SK${"CA".repeat(16)}`,
	},
];

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
	for (const positiveCase of POSITIVE_CASES) {
		test(`redacts ${positiveCase.ruleId}`, () => {
			const result = filterKnownSecrets(positiveCase.input);

			expect(result.text.includes(positiveCase.secret)).toBe(false);
			expect(result.text).toContain(`[REDACTED:${positiveCase.ruleId}]`);
			expect(result.counts).toEqual({ [positiveCase.ruleId]: 1 });
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

	test("preserves UUIDs byte-identically", () => {
		const input = "550e8400-e29b-41d4-a716-446655440000";
		expect(filterKnownSecrets(input)).toEqual({ text: input, counts: {} });
	});

	test("preserves git SHAs and content hashes byte-identically", () => {
		const input = [
			"0123456789abcdef0123456789abcdef01234567",
			"0123456789abcdef".repeat(4),
		].join("\n");
		expect(filterKnownSecrets(input)).toEqual({ text: input, counts: {} });
	});

	test("preserves base64 assets byte-identically", () => {
		const input = `data:image/png;base64,${"aGVsbG8td29ybGQ=".repeat(64)}`;
		expect(filterKnownSecrets(input)).toEqual({ text: input, counts: {} });
	});

	test("preserves minified JavaScript byte-identically", () => {
		const input = `(()=>{const e="0123456789abcdef",t={a:1,b:2};return\`\${e}:\${JSON.stringify(t)}\`})();`;
		expect(filterKnownSecrets(input)).toEqual({ text: input, counts: {} });
	});

	test("preserves the SendGrid rule's case-sensitive prefix", () => {
		const input = `sg.${"a".repeat(66)}`;
		expect(filterKnownSecrets(input)).toEqual({ text: input, counts: {} });
	});

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
	});
});
