import { expect, test } from "bun:test";
import type {
	GeneratedArtifact,
	SkillArtifact,
	SkillLockfileEntry,
} from "@rudel/skill-schema";
import {
	buildLockfileEntryForGeneratedArtifact,
	classifyDrift,
} from "./index.js";

test("classifyDrift reports missing when no artifact exists", () => {
	const generatedArtifact = generated("expected", "v1");

	const finding = classifyDrift({
		repoId: "repo",
		artifact: undefined,
		generatedArtifact,
		currentBlueprintVersionId: "v1",
	});

	expect(finding.status).toBe("missing");
});

test("classifyDrift reports unmanaged when the artifact lacks a lockfile entry", () => {
	const generatedArtifact = generated("expected", "v1");

	const finding = classifyDrift({
		repoId: "repo",
		artifact: observed("local-hash", undefined),
		generatedArtifact,
		currentBlueprintVersionId: "v1",
	});

	expect(finding.status).toBe("unmanaged");
});

test("classifyDrift reports current when local content matches generated output", () => {
	const generatedArtifact = generated("expected", "v1");
	const entry = buildLockfileEntryForGeneratedArtifact(
		generatedArtifact,
		generatedArtifact.contentHash,
	);

	const finding = classifyDrift({
		repoId: "repo",
		artifact: observed(generatedArtifact.contentHash, entry),
		generatedArtifact,
		currentBlueprintVersionId: "v1",
	});

	expect(finding.status).toBe("current");
});

test("classifyDrift reports modified when local content changed", () => {
	const generatedArtifact = generated("expected", "v1");
	const entry = buildLockfileEntryForGeneratedArtifact(
		generatedArtifact,
		generatedArtifact.contentHash,
	);

	const finding = classifyDrift({
		repoId: "repo",
		artifact: observed("local-hash", entry),
		generatedArtifact,
		currentBlueprintVersionId: "v1",
	});

	expect(finding.status).toBe("modified");
});

test("classifyDrift reports behind when only the blueprint version changed", () => {
	const generatedArtifact = generated("expected", "v1");
	const entry = buildLockfileEntryForGeneratedArtifact(
		generatedArtifact,
		generatedArtifact.contentHash,
	);

	const finding = classifyDrift({
		repoId: "repo",
		artifact: observed(generatedArtifact.contentHash, entry),
		generatedArtifact,
		currentBlueprintVersionId: "v2",
	});

	expect(finding.status).toBe("behind");
});

test("classifyDrift reports conflict when local and blueprint both changed", () => {
	const generatedArtifact = generated("expected", "v1");
	const entry = buildLockfileEntryForGeneratedArtifact(
		generatedArtifact,
		generatedArtifact.contentHash,
	);

	const finding = classifyDrift({
		repoId: "repo",
		artifact: observed("local-hash", entry),
		generatedArtifact,
		currentBlueprintVersionId: "v2",
	});

	expect(finding.status).toBe("conflict");
});

test("classifyDrift preserves forked lockfile status", () => {
	const generatedArtifact = generated("expected", "v1");
	const entry = buildLockfileEntryForGeneratedArtifact(
		generatedArtifact,
		generatedArtifact.contentHash,
		"forked",
	);

	const finding = classifyDrift({
		repoId: "repo",
		artifact: observed("local-hash", entry),
		generatedArtifact,
		currentBlueprintVersionId: "v2",
	});

	expect(finding.status).toBe("forked");
});

function generated(contentHash: string, version: string): GeneratedArtifact {
	return {
		artifactTarget: "claude_code",
		targetPath: ".claude/skills/typescript-standards/SKILL.md",
		content: "expected\n",
		contentHash,
		blueprintId: "typescript-standards",
		blueprintVersionId: version,
		overlayHash: "overlay",
		schemaVersion: "1",
		compilerVersion: "1",
	};
}

function observed(
	normalizedContentHash: string,
	lockfileEntry: SkillLockfileEntry | undefined,
): SkillArtifact {
	return {
		id: "artifact",
		sourceScope: "repo",
		artifactTarget: "claude_code",
		absolutePathHash: "path-hash",
		path: "/repo/.claude/skills/typescript-standards/SKILL.md",
		repoRelativePath: ".claude/skills/typescript-standards/SKILL.md",
		contentHash: normalizedContentHash,
		normalizedContentHash,
		lockfileEntry,
	};
}
