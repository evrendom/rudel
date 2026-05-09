import type {
	CodeRepo,
	MachineScanResult,
	SkillArtifact,
} from "@rudel/skill-schema";
import {
	isManagedArtifact,
	matchesTypescriptStandards,
} from "../local-skill-semantics/index.js";

export const repositoriesOverviewFeature = {
	id: "repositories-overview",
	title: "Repositories",
} as const;

export type RepoOverviewRow = {
	repoRootPath: string;
	displayName: string;
	identity: string;
	skillContextCount: number;
	managedCount: number;
	typescriptStandardsCount: number;
	hasRudelLockfile: boolean;
};

export type RepositoriesOverview = {
	rows: RepoOverviewRow[];
	repoCount: number;
	skillContextCount: number;
	managedCount: number;
	typescriptStandardsCount: number;
	globalArtifactCount: number;
	warningCount: number;
};

export function buildRepositoriesOverview(
	scanResult: MachineScanResult | undefined,
): RepositoriesOverview {
	const artifacts = scanResult?.artifacts ?? [];
	const artifactsByRepoRoot = groupArtifactsByRepoRoot(artifacts);
	const rows = (scanResult?.repos ?? [])
		.map((repo) => buildRepoOverviewRow(repo, artifactsByRepoRoot))
		.sort(
			(left, right) =>
				left.displayName.localeCompare(right.displayName) ||
				left.repoRootPath.localeCompare(right.repoRootPath),
		);

	return {
		rows,
		repoCount: rows.length,
		skillContextCount: artifacts.length,
		managedCount: artifacts.filter(isManagedArtifact).length,
		typescriptStandardsCount: artifacts.filter(matchesTypescriptStandards)
			.length,
		globalArtifactCount: artifacts.filter(
			(artifact) => artifact.sourceScope === "global_user",
		).length,
		warningCount: scanResult?.warnings.length ?? 0,
	};
}

function buildRepoOverviewRow(
	repo: CodeRepo,
	artifactsByRepoRoot: ReadonlyMap<string, readonly SkillArtifact[]>,
): RepoOverviewRow {
	const artifacts = artifactsByRepoRoot.get(repo.repoRootPath) ?? [];
	return {
		repoRootPath: repo.repoRootPath,
		displayName: displayNameForRepo(repo),
		identity: identityForRepo(repo),
		skillContextCount: artifacts.length,
		managedCount: artifacts.filter(isManagedArtifact).length,
		typescriptStandardsCount: artifacts.filter(matchesTypescriptStandards)
			.length,
		hasRudelLockfile: repo.hasRudelLockfile,
	};
}

function groupArtifactsByRepoRoot(
	artifacts: readonly SkillArtifact[],
): ReadonlyMap<string, readonly SkillArtifact[]> {
	const groups = new Map<string, SkillArtifact[]>();
	for (const artifact of artifacts) {
		if (!artifact.repoRootPath) continue;
		groups.set(artifact.repoRootPath, [
			...(groups.get(artifact.repoRootPath) ?? []),
			artifact,
		]);
	}
	return groups;
}

function displayNameForRepo(repo: CodeRepo): string {
	if (repo.repoKey.kind === "github") {
		const segments = repo.repoKey.value.split("/").filter(Boolean);
		return segments[segments.length - 1] ?? pathBasename(repo.repoRootPath);
	}
	return pathBasename(repo.repoRootPath);
}

function identityForRepo(repo: CodeRepo): string {
	if (repo.repoKey.kind === "github") {
		return repo.repoKey.value;
	}
	return "local-only";
}

function pathBasename(path: string): string {
	const segments = path.replaceAll("\\", "/").split("/").filter(Boolean);
	return segments[segments.length - 1] ?? path;
}
