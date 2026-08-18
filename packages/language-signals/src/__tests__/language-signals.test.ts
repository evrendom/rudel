import { describe, expect, test } from "bun:test";
import {
	LANGUAGE_SIGNAL_RULES_VERSION,
	MAX_LANGUAGE_SIGNAL_MATCHES,
	scanLanguageSignals,
	splitDisplayTextParts,
} from "../index.js";
import { LANGUAGE_SIGNAL_RULES } from "../rules.js";

describe("language signal rules", () => {
	test("keeps the ruleset explicitly versioned", () => {
		expect(LANGUAGE_SIGNAL_RULES_VERSION).toBe(2);
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
