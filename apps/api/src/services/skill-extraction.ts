import { createHash } from "node:crypto";
import { extractHistoricalClaudeSkills } from "./historical-claude-skill-parser.js";
import { extractHistoricalCodexSkills } from "./historical-codex-skill-parser.js";
import type {
	SkillAgent,
	SkillExtractionResult,
} from "./skill-extraction.types.js";

export const SKILL_PARSER_VERSION = 1;

export interface SkillExtractionInput {
	readonly content: string;
	readonly parserVersion?: number;
	readonly sessionDate: string;
	readonly source: "claude_code" | "codex";
}

export function extractSessionSkills(
	input: SkillExtractionInput,
): SkillExtractionResult {
	const agent: SkillAgent = input.source === "claude_code" ? "claude" : "codex";
	const uses =
		input.source === "claude_code"
			? extractHistoricalClaudeSkills(input.content, input.sessionDate)
			: extractHistoricalCodexSkills(input.content, input.sessionDate);

	return {
		agent,
		parserVersion: input.parserVersion ?? SKILL_PARSER_VERSION,
		sourceContentSha256: hashSkillSourceContent(input.content),
		uses,
	};
}

export function hashSkillSourceContent(content: string): string {
	return createHash("sha256").update(content, "utf8").digest("hex");
}
