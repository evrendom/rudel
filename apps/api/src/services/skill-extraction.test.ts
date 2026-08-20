import { describe, expect, test } from "bun:test";
import {
	buildClaudeSkillCorpus,
	buildCodexSkillCorpus,
} from "./fixtures/skill-transcript-corpus.js";
import {
	extractSessionSkills,
	SKILL_PARSER_VERSION,
} from "./skill-extraction.js";

describe("extractSessionSkills", () => {
	test("records 100% Claude body recovery and preserves plugin names", () => {
		const result = extractSessionSkills({
			content: buildClaudeSkillCorpus(),
			sessionDate: "2026-08-01T00:00:00.000Z",
			source: "claude_code",
		});

		expect(result.agent).toBe("claude");
		expect(result.parserVersion).toBe(SKILL_PARSER_VERSION);
		expect(result.sourceContentSha256).toHaveLength(64);
		expect(result.uses.every((use) => use.content !== null)).toBe(true);
		expect(result.uses.some((use) => use.name === "atlas:humanizer")).toBe(
			true,
		);
	});

	test("meets the documented 60% Codex corpus recovery floor without hiding gaps", () => {
		const result = extractSessionSkills({
			content: buildCodexSkillCorpus(),
			sessionDate: "2026-08-02T00:00:00.000Z",
			source: "codex",
		});
		const recovered = result.uses.filter((use) => use.content !== null).length;
		const recoveryRate = recovered / result.uses.length;

		expect(result.uses).toHaveLength(5);
		expect(recovered).toBe(3);
		expect(recoveryRate).toBeGreaterThanOrEqual(0.6);
		expect(result.uses.filter((use) => use.content === null)).toHaveLength(2);
	});

	test("accepts an explicit parser version for controlled re-extraction", () => {
		const result = extractSessionSkills({
			content: "",
			parserVersion: SKILL_PARSER_VERSION + 1,
			sessionDate: "2026-08-02T00:00:00.000Z",
			source: "codex",
		});

		expect(result.parserVersion).toBe(SKILL_PARSER_VERSION + 1);
	});
});
