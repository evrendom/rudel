import { expect, test } from "bun:test";
import type { SkillArtifact, SkillLockfileEntry } from "@rudel/skill-schema";
import {
	inferArtifactSlug,
	isManagedArtifact,
	matchesTypescriptStandards,
} from "./index.js";

test("inferArtifactSlug uses frontmatter name first", () => {
	const artifact = skillArtifact({
		name: "TypeScript Standards",
		path: "/repo/.claude/skills/old-name/SKILL.md",
	});

	expect(inferArtifactSlug(artifact)).toBe("typescript-standards");
});

test("inferArtifactSlug falls back to the skill folder name", () => {
	const artifact = skillArtifact({
		path: "/repo/.agents/skills/typescript-standards/SKILL.md",
	});

	expect(inferArtifactSlug(artifact)).toBe("typescript-standards");
});

test("matchesTypescriptStandards accepts context files owned by the lockfile", () => {
	const artifact = skillArtifact({
		path: "/repo/AGENTS.md",
		lockfileEntry: lockfileEntry(),
	});

	expect(matchesTypescriptStandards(artifact)).toBe(true);
});

test("isManagedArtifact requires a lockfile entry", () => {
	const artifact = skillArtifact({
		path: "/repo/.claude/skills/typescript-standards/SKILL.md",
		lockfileEntry: lockfileEntry(),
	});

	expect(isManagedArtifact(artifact)).toBe(true);
});

function skillArtifact(input: {
	path: string;
	name?: string;
	lockfileEntry?: SkillLockfileEntry;
}): SkillArtifact {
	return {
		id: "artifact",
		sourceScope: "repo",
		artifactTarget: "claude_code",
		absolutePathHash: "path-hash",
		path: input.path,
		repoRelativePath: input.path.replace("/repo/", ""),
		name: input.name,
		description: undefined,
		contentHash: "content-hash",
		normalizedContentHash: "normalized-content-hash",
		lockfileEntry: input.lockfileEntry,
	};
}

function lockfileEntry(): SkillLockfileEntry {
	return {
		blueprintId: "typescript-standards",
		blueprintVersion: "v1",
		repoOverlayHash: "overlay",
		generatedHash: "generated",
		artifactTarget: "agents_md",
		targetPath: "AGENTS.md",
		schemaVersion: "1",
		compilerVersion: "1",
		status: "current",
	};
}
