import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
	MAX_LANGUAGE_SIGNAL_MATCHES,
	scanLanguageSignals,
	scanMemberLanguageSignals,
	scanModelLanguageSignals,
	splitDisplayTextParts,
	summarize,
} from "../index.js";
import { LANGUAGE_SIGNAL_RULES } from "../rules.js";

describe("language signal rules", () => {
	test("has exactly one exported version authority", async () => {
		const packageRoot = fileURLToPath(new URL("../..", import.meta.url));
		const sourceFiles = Array.from(
			new Bun.Glob("src/**/*.ts").scanSync({ cwd: packageRoot }),
		);
		const declarations: string[] = [];
		for (const sourceFile of sourceFiles) {
			const source = await readFile(`${packageRoot}/${sourceFile}`, "utf8");
			for (const match of source.matchAll(
				/export const ([A-Z][A-Z0-9_]*VERSION[A-Z0-9_]*)\s*=/gu,
			)) {
				declarations.push(`${sourceFile}:${match[1]}`);
			}
		}

		expect(declarations).toEqual(["src/index.ts:SCAN_VERSION"]);
	});

	for (const rule of LANGUAGE_SIGNAL_RULES) {
		for (const surface of rule.surfaces) {
			test(`${rule.ruleId} matches ${surface}`, () => {
				const [match] = scanLanguageSignals(surface);

				expect(match).toEqual({
					category: rule.category,
					ruleId: rule.ruleId,
					matchedText: surface,
					start: 0,
					end: surface.length,
				});
			});
		}
	}

	test("matches without regard to case", () => {
		expect(scanLanguageSignals("FUCK Sorry EXCELLENT")).toEqual([
			{
				category: "swear",
				ruleId: "swear.fuck",
				matchedText: "FUCK",
				start: 0,
				end: 4,
			},
			{
				category: "apology",
				ruleId: "apology.sorry",
				matchedText: "Sorry",
				start: 5,
				end: 10,
			},
			{
				category: "positive",
				ruleId: "positive.praise",
				matchedText: "EXCELLENT",
				start: 11,
				end: 20,
			},
		]);
	});

	test("excludes system-instruction blocks while preserving member offsets", () => {
		const text =
			"Great <system_instruction>Sorry, this is fishy</system_instruction> fishy";

		expect(
			scanMemberLanguageSignals(text).map(
				({ category, matchedText, start, end }) => ({
					category,
					matchedText,
					start,
					end,
				}),
			),
		).toEqual([
			{ category: "positive", end: 5, matchedText: "Great", start: 0 },
			{
				category: "negative",
				end: text.length,
				matchedText: "fishy",
				start: text.length - "fishy".length,
			},
		]);
	});

	test("keeps model signals while removing positive noise", () => {
		expect(
			scanModelLanguageSignals("Excellent, sorry, this feels fishy fuck??").map(
				({ category, matchedText }) => ({ category, matchedText }),
			),
		).toEqual([
			{ category: "apology", matchedText: "sorry" },
			{ category: "negative", matchedText: "fishy" },
			{ category: "swear", matchedText: "fuck" },
			{ category: "negative", matchedText: "??" },
		]);
	});

	test("treats fishy and consecutive question marks as negative", () => {
		const text = "Fishy? One? Two?? Three??? Four????";

		expect(scanLanguageSignals(text)).toEqual([
			{
				category: "negative",
				ruleId: "negative.fishy",
				matchedText: "Fishy",
				start: 0,
				end: 5,
			},
			{
				category: "negative",
				ruleId: "negative.question-run",
				matchedText: "??",
				start: 15,
				end: 17,
			},
			{
				category: "negative",
				ruleId: "negative.question-run",
				matchedText: "???",
				start: 23,
				end: 26,
			},
			{
				category: "negative",
				ruleId: "negative.question-run",
				matchedText: "????",
				start: 31,
				end: 35,
			},
		]);
	});

	test("classifies failed-work phrases and unchanged results as negative", () => {
		const matches = scanLanguageSignals(
			"Didn't work. didnt work. did not work. Doesn't work. does not work. still not working. won't work. never worked. exactly the same. Exactly.",
		);

		expect(
			matches.map(({ category, matchedText }) => ({ category, matchedText })),
		).toEqual([
			{ category: "negative", matchedText: "Didn't work" },
			{ category: "negative", matchedText: "didnt work" },
			{ category: "negative", matchedText: "did not work" },
			{ category: "negative", matchedText: "Doesn't work" },
			{ category: "negative", matchedText: "does not work" },
			{ category: "negative", matchedText: "still not working" },
			{ category: "negative", matchedText: "won't work" },
			{ category: "negative", matchedText: "never worked" },
			{ category: "negative", matchedText: "exactly the same" },
		]);
	});

	test("keeps good positive unless the phrase is not good", () => {
		const matches = scanLanguageSignals("Good. Not good. not\n good.");

		expect(
			matches.map(({ category, ruleId, matchedText }) => ({
				category,
				ruleId,
				matchedText,
			})),
		).toEqual([
			{
				category: "positive",
				ruleId: "positive.praise",
				matchedText: "Good",
			},
			{
				category: "negative",
				ruleId: "negative.not-good",
				matchedText: "Not good",
			},
			{
				category: "negative",
				ruleId: "negative.not-good",
				matchedText: "not\n good",
			},
		]);
	});

	test("classifies directly negated positive surfaces as negative", () => {
		const positiveSurfaces = LANGUAGE_SIGNAL_RULES.filter(
			(rule) => rule.category === "positive",
		).flatMap((rule) => rule.surfaces);

		for (const surface of positiveSurfaces) {
			for (const prefix of ["don't", "dont", "do not", "not"] as const) {
				const text = `${prefix} ${surface}`;
				const matches = scanLanguageSignals(text);

				expect(matches.some((match) => match.category === "negative")).toBe(
					true,
				);
				expect(matches.some((match) => match.category === "positive")).toBe(
					false,
				);
			}
		}
	});

	test("classifies common forms of dislike as negative without making like positive", () => {
		const matches = scanLanguageSignals(
			"I don't like it. I dont like it. I do not like it. I don’t like it. Like this example.",
		);

		expect(
			matches.map(({ category, ruleId, matchedText }) => ({
				category,
				ruleId,
				matchedText,
			})),
		).toEqual([
			{
				category: "negative",
				ruleId: "negative.dislike",
				matchedText: "don't like",
			},
			{
				category: "negative",
				ruleId: "negative.dislike",
				matchedText: "dont like",
			},
			{
				category: "negative",
				ruleId: "negative.dislike",
				matchedText: "do not like",
			},
			{
				category: "negative",
				ruleId: "negative.dislike",
				matchedText: "don’t like",
			},
		]);
	});

	test("keeps negative punctuation independent of word boundaries", () => {
		expect(
			scanLanguageSignals("what??really fishyish").map(
				({ matchedText }) => matchedText,
			),
		).toEqual(["??"]);
	});

	test("categorizes researched completion and correction surfaces", () => {
		const matches = scanLanguageSignals(
			"Works now. It worked. You were right.",
		);

		expect(
			matches.map(({ category, ruleId, matchedText }) => ({
				category,
				ruleId,
				matchedText,
			})),
		).toEqual([
			{
				category: "positive",
				ruleId: "positive.looks-good",
				matchedText: "Works now",
			},
			{
				category: "positive",
				ruleId: "positive.looks-good",
				matchedText: "It worked",
			},
			{
				category: "apology",
				ruleId: "apology.correction",
				matchedText: "You were right",
			},
		]);
	});

	test("accepts straight and curly apostrophes", () => {
		const matches = scanLanguageSignals(
			"I'm sorry. I’m sorry. You're right. You’re absolutely right.",
		);

		expect(matches.map(({ matchedText }) => matchedText)).toEqual([
			"I'm sorry",
			"I’m sorry",
			"You're right",
			"You’re absolutely right",
		]);
	});

	test("allows flexible whitespace inside phrases", () => {
		const matches = scanLanguageSignals(
			"thank \n\t you — we   were wrong — sounds\n good",
		);

		expect(matches.map(({ ruleId }) => ruleId)).toEqual([
			"positive.thanks",
			"apology.mistake",
			"positive.looks-good",
		]);
	});

	test("uses Unicode letter and number boundaries", () => {
		expect(
			scanLanguageSignals(
				"class assessment asshole42 shell hellish élégantfuck fucküber",
			),
		).toEqual([]);
		expect(scanLanguageSignals("(ass), ‘hell’; 💥fuck!")).toEqual([
			{
				category: "swear",
				ruleId: "swear.ass",
				matchedText: "ass",
				start: 1,
				end: 4,
			},
			{
				category: "swear",
				ruleId: "swear.hell",
				matchedText: "hell",
				start: 8,
				end: 12,
			},
			{
				category: "swear",
				ruleId: "swear.fuck",
				matchedText: "fuck",
				start: 17,
				end: 21,
			},
		]);
	});

	test("reports exact end-exclusive UTF-16 positions", () => {
		const text = "🧭 Well done — I'm sorry.";
		const matches = scanLanguageSignals(text);
		const wellDoneStart = text.indexOf("Well done");
		const apologyStart = text.indexOf("I'm sorry");

		expect(matches).toEqual([
			{
				category: "positive",
				ruleId: "positive.done",
				matchedText: "Well done",
				start: wellDoneStart,
				end: wellDoneStart + "Well done".length,
			},
			{
				category: "apology",
				ruleId: "apology.sorry",
				matchedText: "I'm sorry",
				start: apologyStart,
				end: apologyStart + "I'm sorry".length,
			},
		]);
	});

	test("prefers the longest alternative at an overlapping position", () => {
		const matches = scanLanguageSignals(
			"good job; you're absolutely right; love it",
		);

		expect(matches.map(({ matchedText }) => matchedText)).toEqual([
			"good job",
			"you're absolutely right",
			"love it",
		]);
		expect(matches.map(({ ruleId }) => ruleId)).toEqual([
			"positive.good-job",
			"positive.right",
			"positive.love",
		]);
	});

	test("returns source-ordered non-overlapping matches", () => {
		const matches = scanLanguageSignals(
			"Absolutely right. My bad. Bullshit. Great work.",
		);

		expect(matches.map(({ category }) => category)).toEqual([
			"positive",
			"apology",
			"swear",
			"positive",
		]);
		expect(matches.map(({ matchedText }) => matchedText)).toEqual([
			"Absolutely",
			"My bad",
			"Bullshit",
			"Great work",
		]);
	});

	test("caps matches per input string", () => {
		const matches = scanLanguageSignals(
			"fuck ".repeat(MAX_LANGUAGE_SIGNAL_MATCHES + 1),
		);

		expect(matches).toHaveLength(MAX_LANGUAGE_SIGNAL_MATCHES);
		expect(matches.at(-1)?.start).toBe(
			(MAX_LANGUAGE_SIGNAL_MATCHES - 1) * "fuck ".length,
		);
	});
});

describe("language signal summaries", () => {
	test("returns only persisted member and model counts", () => {
		expect(
			summarize({
				memberText: ["Great, sorry, this is shit and still fishy??"],
				modelText: ["Perfect. Sorry. Damn, this did not work."],
			}),
		).toEqual({
			member_swears: 1,
			member_apologies: 1,
			member_positive: 1,
			model_swears: 1,
			model_apologies: 1,
			model_positive: 0,
		});
	});

	test("matches UI display boundaries and keeps turns isolated", () => {
		expect(
			summarize({
				memberText: [
					"thank `you` **great job** ```text\nfuck\n``` <context>sorry</context>",
					"you",
				],
				modelText: ["Excellent **sorry**", "damn"],
			}),
		).toEqual({
			member_swears: 0,
			member_apologies: 0,
			member_positive: 1,
			model_swears: 1,
			model_apologies: 1,
			model_positive: 0,
		});
	});
});

describe("display boundary splitting", () => {
	test("emits ordered prose, strong, code, and XML parts", () => {
		const input =
			"Good **great job** `damn`.\n```ts\nconst value = 'fuck';\n```\n<context kind=\"test\">sorry</context> Thanks";

		expect(splitDisplayTextParts(input)).toEqual([
			{ type: "text", content: "Good " },
			{ type: "strong", content: "great job" },
			{ type: "text", content: " " },
			{ type: "inline-code", content: "damn" },
			{ type: "text", content: ".\n" },
			{
				type: "fenced-code",
				content: "const value = 'fuck';\n",
				language: "ts",
			},
			{ type: "text", content: "\n" },
			{ type: "xml", tag: "context", content: "sorry" },
			{ type: "text", content: " Thanks" },
		]);
	});

	test("keeps signal scanning out of inline code, fenced code, and XML", () => {
		const parts = splitDisplayTextParts(
			"Good **great job** `damn` ```text\nfuck\n``` <context>sorry</context> Thanks",
		);
		const eligibleMatches = parts.flatMap((part) =>
			part.type === "text" || part.type === "strong"
				? scanLanguageSignals(part.content)
				: [],
		);

		expect(eligibleMatches.map(({ matchedText }) => matchedText)).toEqual([
			"Good",
			"great job",
			"Thanks",
		]);
	});

	test("does not let formatting phrases cross display boundaries", () => {
		const parts = splitDisplayTextParts("great **job** and thank `you`");
		const eligibleMatches = parts.flatMap((part) =>
			part.type === "text" || part.type === "strong"
				? scanLanguageSignals(part.content)
				: [],
		);

		expect(eligibleMatches.map(({ matchedText }) => matchedText)).toEqual([
			"great",
		]);
	});

	test("preserves unmatched formatting as plain text", () => {
		expect(splitDisplayTextParts("before **unfinished and `open")).toEqual([
			{ type: "text", content: "before **unfinished and `open" },
		]);
	});

	test("returns no parts for empty input", () => {
		expect(splitDisplayTextParts("")).toEqual([]);
	});
});
