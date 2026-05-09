import type { SkillArtifact } from "@rudel/skill-schema";

export const typescriptStandardsFocusFeature = {
	id: "typescript-standards-focus",
	title: "TypeScript Standards",
} as const;

export function getTypescriptStandardsArtifacts(
	artifacts: readonly SkillArtifact[],
): SkillArtifact[] {
	return artifacts.filter(
		(artifact) =>
			artifact.detectedSlug === "typescript-standards" ||
			artifact.matchedBlueprintId === "typescript-standards",
	);
}
