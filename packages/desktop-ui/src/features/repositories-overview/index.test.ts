import { expect, test } from "bun:test";
import type { CodeRepo, MachineScanResult } from "@rudel/skill-schema";
import { buildRepositoriesOverview } from "./index.js";

test("buildRepositoriesOverview groups GitHub and local repositories", () => {
	const scanResult: MachineScanResult = {
		roots: [],
		repos: [
			{
				repoRootPath: "/work/api",
				repoKey: { kind: "github", value: "github.com/acme/api" },
				sourceRoot: "/work",
				branchName: "main",
				localBranchCount: 1,
				headSha: "abc",
				isDirty: false,
				skillFileCount: 2,
				dirtySkillFileCount: 0,
				isWorktree: false,
				isNested: false,
				hasRudelLockfile: true,
			},
			localRepo("/work/local"),
		],
		candidates: [],
		artifacts: [],
		warnings: [{ root: "/missing", message: "Root path does not exist." }],
		skippedDirectoryCount: 2,
		scannedAt: "unix:1",
	};

	const overview = buildRepositoriesOverview(scanResult);

	expect(overview.repoCount).toBe(2);
	expect(overview.worktreeCount).toBe(2);
	expect(overview.warningCount).toBe(1);
	expect(overview.rows).toHaveLength(2);
	expect(overview.rows[0]).toMatchObject({
		displayName: "api",
		identity: "github.com/acme/api",
		linkLabel: "github.com/acme/api",
		linkHref: "https://github.com/acme/api",
		worktreeCount: 1,
		branchCount: 1,
		activityCount: 1,
		branchName: "main",
		isDirty: false,
		skillFileCount: 2,
		dirtyWorktreeCount: 0,
		dirtySkillFileCount: 0,
	});
	expect(overview.rows[1]).toMatchObject({
		displayName: "local",
		identity: "local-only",
		linkLabel: "/work/local",
		linkHref: undefined,
		worktreeCount: 1,
		branchCount: 1,
		activityCount: 1,
		branchName: "main",
		isDirty: false,
		dirtyWorktreeCount: 0,
		dirtySkillFileCount: 0,
	});
});

test("buildRepositoriesOverview sorts by worktree count and nests dirty worktrees", () => {
	const scanResult: MachineScanResult = {
		roots: [],
		repos: [
			localRepo("/work/api-main"),
			{
				...localRepo("/work/api-feature"),
				branchName: "feature-x",
				repoRootPath: "/work/api-feature",
				isWorktree: true,
				isDirty: true,
				skillFileCount: 4,
				dirtySkillFileCount: 3,
			},
			{
				...localRepo("/work/side-project"),
				repoKey: { kind: "local", value: "side-project" },
				localBranchCount: 4,
			},
		],
		candidates: [],
		artifacts: [],
		warnings: [],
		skippedDirectoryCount: 0,
		scannedAt: "unix:1",
	};

	const overview = buildRepositoriesOverview(scanResult);

	expect(overview.repoCount).toBe(2);
	expect(overview.worktreeCount).toBe(3);
	expect(overview.rows).toHaveLength(2);
	expect(overview.rows[0]).toMatchObject({
		displayName: "side-project",
		worktreeCount: 1,
		branchCount: 4,
		activityCount: 4,
		dirtyWorktreeCount: 0,
	});
	expect(overview.rows[1]).toMatchObject({
		displayName: "api-main",
		worktreeCount: 2,
		branchCount: 1,
		activityCount: 2,
		branchName: "main",
		skillFileCount: 4,
		dirtyWorktreeCount: 1,
		dirtySkillFileCount: 3,
	});
	expect(overview.rows[1]?.dirtyWorktrees[0]).toMatchObject({
		displayName: "api-feature",
		branchName: "feature-x",
		dirtySkillFileCount: 3,
	});
});

function localRepo(repoRootPath: string): CodeRepo {
	return {
		repoRootPath,
		repoKey: { kind: "local", value: "local-hash" },
		sourceRoot: "/work",
		branchName: "main",
		localBranchCount: 1,
		headSha: "abc",
		isDirty: false,
		skillFileCount: 0,
		dirtySkillFileCount: 0,
		isWorktree: false,
		isNested: false,
		hasRudelLockfile: false,
	};
}
