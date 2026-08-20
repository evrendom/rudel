import { describe, expect, test } from "bun:test";
import {
	buildClaudeSkillCorpus,
	CLAUDE_CORPUS_BODIES,
} from "./fixtures/skill-transcript-corpus.js";
import { extractHistoricalClaudeSkills } from "./historical-claude-skill-parser.js";

const FALLBACK = "2026-08-01T00:00:00.000Z";

describe("extractHistoricalClaudeSkills", () => {
	test("recovers 100% of modern corpus bodies across real transcript shapes", () => {
		const uses = extractHistoricalClaudeSkills(
			buildClaudeSkillCorpus(),
			FALLBACK,
		);
		const contentByName = new Map(uses.map((use) => [use.name, use.content]));

		expect(uses).toHaveLength(7);
		expect(contentByName.get("plain")).toBe(CLAUDE_CORPUS_BODIES.plain);
		expect(contentByName.get("atlas:humanizer")).toBe(
			CLAUDE_CORPUS_BODIES.plugin,
		);
		expect(contentByName.get("bundled")).toBe(CLAUDE_CORPUS_BODIES.bundled);
		expect(contentByName.get("interleaved")).toBe(
			CLAUDE_CORPUS_BODIES.interleaved,
		);
		expect(contentByName.get("crlf")).toBe(CLAUDE_CORPUS_BODIES.crlf);
		expect(contentByName.get("huge")).toBe(CLAUDE_CORPUS_BODIES.huge);
		expect(contentByName.get("repeated")).toBe(CLAUDE_CORPUS_BODIES.repeated);
	});

	test("keeps invocations visible when bodies are missing or mismatched", () => {
		const transcript = [
			invocation("plain"),
			meta("/tmp/skills/other", "# Wrong\n"),
			invocation("missing"),
		].join("\n");

		expect(extractHistoricalClaudeSkills(transcript, FALLBACK)).toEqual([
			{ content: null, name: "missing", usedAt: FALLBACK },
			{ content: null, name: "plain", usedAt: FALLBACK },
		]);
	});

	test("rejects meta bodies and pasted invocation JSON without a real tool use", () => {
		const spoof = JSON.stringify({
			message: {
				role: "user",
				content: JSON.stringify({
					type: "tool_use",
					name: "Skill",
					input: { skill: "spoofed" },
				}),
			},
			type: "user",
		});
		const transcript = [spoof, meta("/tmp/skills/spoofed", "# Spoofed\n")].join(
			"\n",
		);

		expect(extractHistoricalClaudeSkills(transcript, FALLBACK)).toEqual([]);
	});

	test("strips injected frontmatter and leading blank lines", () => {
		const transcript = [
			invocation("frontmatter"),
			meta(
				"/tmp/skills/frontmatter",
				"\n---\nname: frontmatter\n---\n\n# Visible\n",
			),
		].join("\n");

		expect(extractHistoricalClaudeSkills(transcript, FALLBACK)).toEqual([
			{ content: "# Visible\n", name: "frontmatter", usedAt: FALLBACK },
		]);
	});
});

function invocation(name: string): string {
	return JSON.stringify({
		message: {
			role: "assistant",
			content: [{ type: "tool_use", name: "Skill", input: { skill: name } }],
		},
		type: "assistant",
	});
}

function meta(path: string, body: string): string {
	return JSON.stringify({
		isMeta: true,
		message: {
			role: "user",
			content: `Base directory for this skill: ${path}\n\n${body}`,
		},
		type: "user",
	});
}
