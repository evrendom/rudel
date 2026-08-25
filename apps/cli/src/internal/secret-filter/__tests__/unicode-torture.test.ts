import { describe, expect, test } from "bun:test";
import { filterKnownSecrets, getUtf8ByteLength } from "../index.js";
import { AWS_CANARY, isWellFormedUtf16 } from "./helpers/rule-corpus.js";

// The torture canaries are \b-anchored (aws) or unanchored (slack, twilio)
// rules on purpose: delimiter-anchored rules legitimately do not redact when
// an emoji or direction mark directly follows the secret — that gap is pinned
// separately below.
const SLACK_BOT_CANARY = "xoxb-1234567890-1234567890-CANARY";
const TWILIO_CANARY = `SK${"CA".repeat(16)}`;
const SENDGRID_CANARY = `SG.${"CANARY".padEnd(66, "A")}`;
const GOOGLE_CANARY = `AIza${"CANARY".padEnd(35, "A")}`;

// Invisible characters spelled out so the fixtures stay reviewable.
const RLE = "\u202B"; // right-to-left embedding
const PDF = "\u202C"; // pop directional formatting
const RLM = "\u200F"; // right-to-left mark
const ZWJ = "\u200D"; // zero-width joiner
const NUL = "\u0000";
const BOM = "\uFEFF";
const COMBINING_ACUTE = "\u0301";
const FAMILY_EMOJI = `👨${ZWJ}👩${ZWJ}👧${ZWJ}👦`;
const RAINBOW_FLAG = `🏳️${ZWJ}🌈`;

interface TortureCase {
	readonly label: string;
	readonly input: string;
	readonly expectedText: string;
	readonly ruleId: string;
	readonly secret: string;
}

const TORTURE_CASES: readonly TortureCase[] = [
	{
		label: "RTL text with embedding and right-to-left marks",
		input: `التقرير ${RLE}سري${PDF} ${RLM}${AWS_CANARY}${RLM} نهاية`,
		expectedText: `التقرير ${RLE}سري${PDF} ${RLM}[REDACTED:aws-access-key-id]${RLM} نهاية`,
		ruleId: "aws-access-key-id",
		secret: AWS_CANARY,
	},
	{
		label: "emoji-ZWJ-dense surroundings",
		input: `${FAMILY_EMOJI}${RAINBOW_FLAG}${SLACK_BOT_CANARY}${FAMILY_EMOJI}`,
		expectedText: `${FAMILY_EMOJI}${RAINBOW_FLAG}[REDACTED:slack-bot-token]${FAMILY_EMOJI}`,
		ruleId: "slack-bot-token",
		secret: SLACK_BOT_CANARY,
	},
	{
		label: "secret after a NUL byte",
		input: `${NUL}${AWS_CANARY}${NUL}end`,
		expectedText: `${NUL}[REDACTED:aws-access-key-id]${NUL}end`,
		ruleId: "aws-access-key-id",
		secret: AWS_CANARY,
	},
	{
		label: "secret after a BOM",
		input: `${BOM}${AWS_CANARY} rest`,
		expectedText: `${BOM}[REDACTED:aws-access-key-id] rest`,
		ruleId: "aws-access-key-id",
		secret: AWS_CANARY,
	},
	{
		label: "secret between combining marks",
		input: `nai${COMBINING_ACUTE}ve ${COMBINING_ACUTE}${TWILIO_CANARY}${COMBINING_ACUTE} done`,
		expectedText: `nai${COMBINING_ACUTE}ve ${COMBINING_ACUTE}[REDACTED:twilio-api-key]${COMBINING_ACUTE} done`,
		ruleId: "twilio-api-key",
		secret: TWILIO_CANARY,
	},
];

describe("secrets embedded in hostile unicode", () => {
	for (const torture of TORTURE_CASES) {
		test(`${torture.label} still redacts byte-exactly`, () => {
			const result = filterKnownSecrets(torture.input);

			expect(result.text).toBe(torture.expectedText);
			expect(result.text).not.toContain(torture.secret);
			expect(result.counts).toEqual({ [torture.ruleId]: 1 });
			expect(result.redactedBytes).toBe(getUtf8ByteLength(torture.secret));
			expect(isWellFormedUtf16(result.text)).toBe(true);
		});
	}
});

describe("lone surrogates", () => {
	const input = `\uD83D ${AWS_CANARY} \uDE00`;

	test("survive filtering untouched while accounting stays consistent", () => {
		const result = filterKnownSecrets(input);

		expect(result.text).toBe(`\uD83D [REDACTED:aws-access-key-id] \uDE00`);
		// The surrogates pass through as-is, not repaired or replaced: input
		// and output are equally ill-formed.
		expect(isWellFormedUtf16(input)).toBe(false);
		expect(isWellFormedUtf16(result.text)).toBe(false);
		expect(result.text.charCodeAt(0)).toBe(0xd83d);
		expect(result.text.charCodeAt(result.text.length - 1)).toBe(0xde00);
		// redactedBytes counts only the secret and never exceeds what the
		// input (with lone surrogates encoded as replacement characters)
		// could contain.
		expect(result.redactedBytes).toBe(getUtf8ByteLength(AWS_CANARY));
		expect(result.redactedBytes).toBeLessThanOrEqual(getUtf8ByteLength(input));
	});
});

describe("known delimiter-anchor gap under unicode", () => {
	/**
	 * Same pinned gap as in pressure-corpus.test.ts: an emoji or a direction
	 * mark directly after a delimiter-anchored secret is outside the trailing
	 * group, so the secret survives. These fail loudly when the ruleset fix
	 * lands.
	 */
	const gapCases: readonly (readonly [string, string])[] = [
		["before an emoji", `key ${SENDGRID_CANARY}🚀`],
		["before an RLM mark", `key ${GOOGLE_CANARY}${RLM}`],
	];

	for (const [label, input] of gapCases) {
		test(`delimiter-anchored secret ${label} passes through (pinned gap)`, () => {
			expect(filterKnownSecrets(input)).toEqual({
				text: input,
				counts: {},
				redactedBytes: 0,
			});
		});
	}
});

describe("idempotence over the torture corpus", () => {
	const allInputs: readonly string[] = [
		...TORTURE_CASES.map((torture) => torture.input),
		`\uD83D ${AWS_CANARY} \uDE00`,
		`key ${SENDGRID_CANARY}🚀`,
		`key ${GOOGLE_CANARY}${RLM}`,
	];

	test("every torture input is a fixpoint after one call", () => {
		for (const input of allInputs) {
			const first = filterKnownSecrets(input);
			const second = filterKnownSecrets(first.text);

			expect(second.text).toBe(first.text);
			expect(second.counts).toEqual({});
			expect(second.redactedBytes).toBe(0);
		}
	});
});
