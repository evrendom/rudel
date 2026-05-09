import type {
	DriftFinding,
	GeneratedArtifact,
	LockfileStatus,
	SkillArtifact,
	SkillLockfileEntry,
} from "@rudel/skill-schema";

export const driftInboxFeature = {
	id: "drift-inbox",
	title: "Drift Inbox",
} as const;

export type DriftClassificationInput = {
	repoId: string;
	artifact: SkillArtifact | undefined;
	generatedArtifact: GeneratedArtifact;
	currentBlueprintVersionId: string;
};

export function classifyDrift(input: DriftClassificationInput): DriftFinding {
	const status = classifyDriftStatus(input);
	return {
		id: `${input.repoId}:${input.generatedArtifact.targetPath}`,
		repoId: input.repoId,
		blueprintId: input.generatedArtifact.blueprintId,
		artifactTarget: input.generatedArtifact.artifactTarget,
		targetPath: input.generatedArtifact.targetPath,
		status,
		message: driftMessage(status),
	};
}

export function buildLockfileEntryForGeneratedArtifact(
	generatedArtifact: GeneratedArtifact,
	currentFileHash: string | undefined,
	status: LockfileStatus = "current",
): SkillLockfileEntry {
	return {
		blueprintId: generatedArtifact.blueprintId,
		blueprintVersion: generatedArtifact.blueprintVersionId,
		repoOverlayHash: generatedArtifact.overlayHash,
		generatedHash: generatedArtifact.contentHash,
		currentFileHash,
		artifactTarget: generatedArtifact.artifactTarget,
		targetPath: generatedArtifact.targetPath,
		schemaVersion: generatedArtifact.schemaVersion,
		compilerVersion: generatedArtifact.compilerVersion,
		status,
	};
}

function classifyDriftStatus(input: DriftClassificationInput): LockfileStatus {
	const { artifact, currentBlueprintVersionId, generatedArtifact } = input;
	if (!artifact) return "missing";

	const lockfileEntry = artifact.lockfileEntry;
	if (!lockfileEntry) return "unmanaged";
	if (lockfileEntry.status === "forked") return "forked";

	const hasNewerBlueprint =
		lockfileEntry.blueprintVersion !== currentBlueprintVersionId;
	const hasLocalChanges =
		artifact.normalizedContentHash !== lockfileEntry.generatedHash;

	if (hasNewerBlueprint && hasLocalChanges) return "conflict";
	if (hasNewerBlueprint) return "behind";
	if (artifact.normalizedContentHash === generatedArtifact.contentHash) {
		return "current";
	}
	return "modified";
}

function driftMessage(status: LockfileStatus): string {
	switch (status) {
		case "current":
			return "File matches the expected generated output.";
		case "missing":
			return "Expected generated file is missing.";
		case "modified":
			return "Local file differs from the generated output.";
		case "behind":
			return "A newer published blueprint version is available.";
		case "conflict":
			return "Local file is modified and a newer blueprint version is available.";
		case "forked":
			return "This file is intentionally forked from managed updates.";
		case "unmanaged":
			return "A similar skill exists without a lockfile entry.";
	}
}
