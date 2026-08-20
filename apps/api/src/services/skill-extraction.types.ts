export type SkillAgent = "claude" | "codex";

export interface ExtractedSkillUse {
	readonly content: string | null;
	readonly name: string;
	readonly usedAt: string;
}

export interface SkillExtractionResult {
	readonly agent: SkillAgent;
	readonly parserVersion: number;
	readonly sourceContentSha256: string;
	readonly uses: readonly ExtractedSkillUse[];
}
