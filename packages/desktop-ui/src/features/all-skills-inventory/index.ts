import type { SkillArtifact } from "@rudel/skill-schema";
import type { AllSkillsInventoryItem } from "../../ports/local-engine.js";

export const allSkillsInventoryFeature = {
	id: "all-skills-inventory",
	title: "All Skills Inventory",
} as const;

export function buildAllSkillsInventory(
	artifacts: readonly SkillArtifact[],
): AllSkillsInventoryItem[] {
	const groups = new Map<string, SkillArtifact[]>();
	for (const artifact of artifacts) {
		const slug = artifact.detectedSlug ?? "unknown";
		groups.set(slug, [...(groups.get(slug) ?? []), artifact]);
	}

	return [...groups.entries()]
		.map(([detectedSlug, groupArtifacts]) => {
			const repoKeys = new Map<string, NonNullable<SkillArtifact["repoKey"]>>();
			for (const artifact of groupArtifacts) {
				if (!artifact.repoKey) continue;
				repoKeys.set(JSON.stringify(artifact.repoKey), artifact.repoKey);
			}

			return {
				detectedSlug,
				artifacts: groupArtifacts,
				managedCount: groupArtifacts.filter((artifact) => artifact.isManaged)
					.length,
				unmanagedCount: groupArtifacts.filter((artifact) => !artifact.isManaged)
					.length,
				repoKeys: [...repoKeys.values()],
			};
		})
		.sort((left, right) => {
			if (left.detectedSlug === "typescript-standards") return -1;
			if (right.detectedSlug === "typescript-standards") return 1;
			return right.artifacts.length - left.artifacts.length;
		});
}
