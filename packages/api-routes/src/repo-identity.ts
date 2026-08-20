export type RepoIdentity = {
	/** Stable grouping key. Namespaced to avoid cross-tier collisions. */
	repoKey: string;
	/** What the user sees in repository columns and filters. */
	repoLabel: string;
	/** Worktree name when the path matched a worktree layout, else null. */
	worktree: string | null;
};

type RepoPathMatch = {
	repoToken: string;
	worktree: string;
};

type RepoPathRule = {
	name: string;
	match: (normalizedPath: string) => RepoPathMatch | null;
};

const REPO_PATH_RULES: readonly RepoPathRule[] = [
	{
		name: "conductor",
		match(normalizedPath) {
			const match = normalizedPath.match(
				/(?:^|\/)conductor\/workspaces\/([^/]+)\/([^/]+)(?:\/|$)/,
			);
			const repoToken = match?.[1];
			const worktree = match?.[2];

			return repoToken && worktree ? { repoToken, worktree } : null;
		},
	},
	{
		name: "dot-worktrees",
		match(normalizedPath) {
			const match = normalizedPath.match(
				/(?:^|\/)([^/]+)\/\.worktrees\/([^/]+)(?:\/|$)/,
			);
			const repoToken = match?.[1];
			const worktree = match?.[2];

			return repoToken && worktree ? { repoToken, worktree } : null;
		},
	},
];

export function resolveRepoIdentity(input: {
	projectPath: string;
	gitRemote: string | null;
	packageName: string | null;
}): RepoIdentity {
	const normalizedPath = input.projectPath.replace(/\\/g, "/");

	for (const rule of REPO_PATH_RULES) {
		const pathMatch = rule.match(normalizedPath);
		if (pathMatch) {
			return {
				repoKey: `path:${pathMatch.repoToken}`,
				repoLabel: pathMatch.repoToken,
				worktree: pathMatch.worktree,
			};
		}
	}

	if (input.gitRemote) {
		const remoteSegments = input.gitRemote.split("/").filter(Boolean);
		return {
			repoKey: `remote:${input.gitRemote}`,
			repoLabel: remoteSegments.slice(-2).join("/"),
			worktree: null,
		};
	}

	if (input.packageName) {
		return {
			repoKey: `pkg:${input.packageName}`,
			repoLabel: input.packageName,
			worktree: null,
		};
	}

	const pathSegments = normalizedPath.split("/").filter(Boolean);
	return {
		repoKey: `path-raw:${input.projectPath}`,
		repoLabel: pathSegments.slice(-2).join("/") || "Untitled project",
		worktree: null,
	};
}
