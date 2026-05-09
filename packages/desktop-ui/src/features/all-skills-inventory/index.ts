import type { SkillArtifact } from "@rudel/skill-schema";
import type { AllSkillsInventoryItem } from "../../ports/local-engine.js";
import {
	inferArtifactSlug,
	isManagedArtifact,
} from "../local-skill-semantics/index.js";

export const allSkillsInventoryFeature = {
	id: "all-skills-inventory",
	title: "All Skills Inventory",
} as const;

export function buildAllSkillsInventory(
	artifacts: readonly SkillArtifact[],
): AllSkillsInventoryItem[] {
	const groups = new Map<string, SkillArtifact[]>();
	for (const artifact of artifacts) {
		const slug = inferArtifactSlug(artifact);
		groups.set(slug, [...(groups.get(slug) ?? []), artifact]);
	}

	return [...groups.entries()]
		.map(([skillSlug, groupArtifacts]) => {
			const repoKeys = new Map<string, NonNullable<SkillArtifact["repoKey"]>>();
			for (const artifact of groupArtifacts) {
				if (!artifact.repoKey) continue;
				repoKeys.set(JSON.stringify(artifact.repoKey), artifact.repoKey);
			}

			return {
				skillSlug,
				artifacts: groupArtifacts,
				managedCount: groupArtifacts.filter((artifact) =>
					isManagedArtifact(artifact),
				).length,
				unmanagedCount: groupArtifacts.filter(
					(artifact) => !isManagedArtifact(artifact),
				).length,
				repoKeys: [...repoKeys.values()],
			};
		})
		.sort((left, right) => {
			if (left.skillSlug === "typescript-standards") return -1;
			if (right.skillSlug === "typescript-standards") return 1;
			return right.artifacts.length - left.artifacts.length;
		});
}
