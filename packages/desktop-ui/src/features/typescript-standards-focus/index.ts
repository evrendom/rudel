import type { SkillArtifact } from "@rudel/skill-schema";
import { matchesTypescriptStandards } from "../local-skill-semantics/index.js";

export const typescriptStandardsFocusFeature = {
	id: "typescript-standards-focus",
	title: "TypeScript Standards",
} as const;

export function getTypescriptStandardsArtifacts(
	artifacts: readonly SkillArtifact[],
): SkillArtifact[] {
	return artifacts.filter(matchesTypescriptStandards);
}
