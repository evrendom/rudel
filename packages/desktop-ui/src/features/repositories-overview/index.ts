import type { CodeRepo, MachineScanResult } from "@rudel/skill-schema";

export const repositoriesOverviewFeature = {
	id: "repositories-overview",
	title: "Repositories",
} as const;

export type RepoOverviewRow = {
	id: string;
	repoRootPath: string;
	repoRootPaths: readonly string[];
	displayName: string;
	identity: string;
	linkLabel: string;
	linkHref: string | undefined;
	worktreeCount: number;
	branchCount: number;
	activityCount: number;
	branchName: string;
	isDirty: boolean;
	skillFileCount: number;
	dirtyWorktreeCount: number;
	dirtySkillFileCount: number;
	dirtyWorktrees: readonly RepoOverviewDirtyWorktree[];
};

export type RepoOverviewDirtyWorktree = {
	repoRootPath: string;
	displayName: string;
	branchName: string;
	dirtySkillFileCount: number;
};

export type RepositoriesOverview = {
	rows: RepoOverviewRow[];
	repoCount: number;
	worktreeCount: number;
	warningCount: number;
};

export function buildRepositoriesOverview(
	scanResult: MachineScanResult | undefined,
): RepositoriesOverview {
	const repos = scanResult?.repos ?? [];
	const repoGroups = groupReposByKey(repos);
	const rows = repoGroups
		.map(buildRepoOverviewRow)
		.sort(
			(left, right) =>
				right.activityCount - left.activityCount ||
				left.displayName.localeCompare(right.displayName) ||
				left.repoRootPath.localeCompare(right.repoRootPath),
		);

	return {
		rows,
		repoCount: repoGroups.length,
		worktreeCount: repos.length,
		warningCount: scanResult?.warnings.length ?? 0,
	};
}

function buildRepoOverviewRow(repos: readonly CodeRepo[]): RepoOverviewRow {
	const defaultRepo = chooseDefaultRepo(repos);
	const branchCount = Math.max(
		...repos.map((repo) => repo.localBranchCount),
		0,
	);
	const worktreeCount = repos.length;
	const repoRootPaths = repos
		.map((repo) => repo.repoRootPath)
		.sort((left, right) => left.localeCompare(right));
	const dirtyWorktrees = repos
		.filter((repo) => repo.isDirty)
		.map((repo) => ({
			repoRootPath: repo.repoRootPath,
			displayName: displayNameForRepo(repo),
			branchName: branchLabelForRepo(repo),
			dirtySkillFileCount: repo.dirtySkillFileCount,
		}))
		.sort(
			(left, right) =>
				left.displayName.localeCompare(right.displayName) ||
				left.repoRootPath.localeCompare(right.repoRootPath),
		);
	const dirtySkillFileCount = dirtyWorktrees.reduce(
		(total, worktree) => total + worktree.dirtySkillFileCount,
		0,
	);
	const skillFileCount = Math.max(
		...repos.map((repo) => repo.skillFileCount),
		dirtySkillFileCount,
		0,
	);

	return {
		id: repoKeyLabel(defaultRepo.repoKey),
		repoRootPath: defaultRepo.repoRootPath,
		repoRootPaths,
		displayName: displayNameForRepo(defaultRepo),
		identity: identityForRepo(defaultRepo),
		linkLabel: linkLabelForRepo(defaultRepo),
		linkHref: linkHrefForRepo(defaultRepo),
		worktreeCount,
		branchCount,
		activityCount: Math.max(worktreeCount, branchCount),
		branchName: branchLabelForRepo(defaultRepo),
		isDirty: defaultRepo.isDirty,
		skillFileCount,
		dirtyWorktreeCount: dirtyWorktrees.length,
		dirtySkillFileCount,
		dirtyWorktrees,
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
	if (repo.branchName === "main") return 0;
	if (repo.branchName === "master") return 1;
	return 2;
}

function displayNameForRepo(repo: CodeRepo): string {
	if (repo.repoKey.kind === "github") {
		const segments = repo.repoKey.value.split("/").filter(Boolean);
		return segments[segments.length - 1] ?? pathBasename(repo.repoRootPath);
	}
	return pathBasename(repo.repoRootPath);
}

function branchLabelForRepo(repo: CodeRepo): string {
	return repo.branchName ?? repo.headSha?.slice(0, 7) ?? "unknown";
}

function identityForRepo(repo: CodeRepo): string {
	if (repo.repoKey.kind === "github") {
		return repo.repoKey.value;
	}
	return "local-only";
}

function linkLabelForRepo(repo: CodeRepo): string {
	if (repo.repoKey.kind === "github") {
		return repo.repoKey.value;
	}
	return repo.repoRootPath;
}

function linkHrefForRepo(repo: CodeRepo): string | undefined {
	if (repo.repoKey.kind === "github") {
		return `https://${repo.repoKey.value}`;
	}
	return undefined;
}

function repoKeyLabel(repoKey: CodeRepo["repoKey"]): string {
	return `${repoKey.kind}:${repoKey.value}`;
}

function pathBasename(path: string): string {
	const segments = path.replaceAll("\\", "/").split("/").filter(Boolean);
	return segments[segments.length - 1] ?? path;
}
