import type { CodeRepo, MachineScanResult } from "@rudel/skill-schema";

export const repositoriesOverviewFeature = {
	id: "repositories-overview",
	title: "Repositories",
} as const;

export type RepoOverviewRow = {
	id: string;
	rowKind: "group" | "worktree";
	repoRootPath: string;
	displayName: string;
	identity: string;
	worktreeCount: number;
	branchName: string;
	state: "clean" | "dirty";
};

export type RepositoriesOverview = {
	rows: RepoOverviewRow[];
	repoCount: number;
	worktreeCount: number;
	dirtyCount: number;
	warningCount: number;
};

export function buildRepositoriesOverview(
	scanResult: MachineScanResult | undefined,
): RepositoriesOverview {
	const repos = scanResult?.repos ?? [];
	const repoGroups = groupReposByKey(repos);
	const rows = repoGroups
		.flatMap(buildRepoOverviewRows)
		.sort(
			(left, right) =>
				left.displayName.localeCompare(right.displayName) ||
				left.repoRootPath.localeCompare(right.repoRootPath),
		);

	return {
		rows,
		repoCount: repoGroups.length,
		worktreeCount: repos.length,
		dirtyCount: repos.filter((repo) => repo.isDirty).length,
		warningCount: scanResult?.warnings.length ?? 0,
	};
}

function buildRepoOverviewRows(repos: readonly CodeRepo[]): RepoOverviewRow[] {
	const defaultRepo = chooseDefaultRepo(repos);
	const groupRow = buildRepoOverviewRow(defaultRepo, repos.length, "group");
	const breakoutRows = repos
		.filter((repo) => shouldBreakOutWorktree(repo, defaultRepo))
		.map((repo) => buildRepoOverviewRow(repo, 1, "worktree"));
	return [groupRow, ...breakoutRows];
}

function buildRepoOverviewRow(
	repo: CodeRepo,
	worktreeCount: number,
	rowKind: RepoOverviewRow["rowKind"],
): RepoOverviewRow {
	return {
		id: `${repoKeyLabel(repo.repoKey)}:${rowKind}:${repo.repoRootPath}`,
		rowKind,
		repoRootPath: repo.repoRootPath,
		displayName: displayNameForRepo(repo),
		identity: identityForRepo(repo),
		worktreeCount,
		branchName: repo.branchName ?? repo.headSha?.slice(0, 7) ?? "unknown",
		state: repo.isDirty ? "dirty" : "clean",
	};
}

function groupReposByKey(
	repos: readonly CodeRepo[],
): readonly (readonly CodeRepo[])[] {
	const groups = new Map<string, CodeRepo[]>();
	for (const repo of repos) {
		const key = repoKeyLabel(repo.repoKey);
		groups.set(key, [...(groups.get(key) ?? []), repo]);
	}
	return [...groups.values()];
}

function chooseDefaultRepo(repos: readonly CodeRepo[]): CodeRepo {
	const sorted = [...repos].sort((left, right) => {
		const leftScore = defaultRepoScore(left);
		const rightScore = defaultRepoScore(right);
		return (
			leftScore - rightScore ||
			left.repoRootPath.localeCompare(right.repoRootPath)
		);
	});
	const first = sorted[0];
	if (!first) {
		throw new Error("Repository group must contain at least one repo.");
	}
	return first;
}

function defaultRepoScore(repo: CodeRepo): number {
	if (!repo.isDirty && repo.branchName === "main") return 0;
	if (!repo.isDirty && repo.branchName === "master") return 1;
	if (!repo.isDirty) return 2;
	return 3;
}

function shouldBreakOutWorktree(
	repo: CodeRepo,
	defaultRepo: CodeRepo,
): boolean {
	if (repo.repoRootPath === defaultRepo.repoRootPath) return false;
	return (
		repo.isDirty ||
		repo.branchName !== defaultRepo.branchName ||
		repo.headSha !== defaultRepo.headSha
	);
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

function repoKeyLabel(repoKey: CodeRepo["repoKey"]): string {
	return `${repoKey.kind}:${repoKey.value}`;
}

function pathBasename(path: string): string {
	const segments = path.replaceAll("\\", "/").split("/").filter(Boolean);
	return segments[segments.length - 1] ?? path;
}
