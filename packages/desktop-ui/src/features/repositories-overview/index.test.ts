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
				headSha: "abc",
				isDirty: false,
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
	expect(overview.dirtyCount).toBe(0);
	expect(overview.warningCount).toBe(1);
	expect(overview.rows).toHaveLength(2);
	expect(overview.rows[0]).toMatchObject({
		displayName: "api",
		identity: "github.com/acme/api",
		worktreeCount: 1,
		branchName: "main",
		state: "clean",
	});
	expect(overview.rows[1]).toMatchObject({
		displayName: "local",
		identity: "local-only",
		worktreeCount: 1,
		branchName: "main",
		state: "clean",
	});
});

test("buildRepositoriesOverview breaks out dirty and unique branch worktrees", () => {
	const scanResult: MachineScanResult = {
		roots: [],
		repos: [
			localRepo("/work/api-main"),
			{
				...localRepo("/work/api-feature"),
				branchName: "feature-x",
				isWorktree: true,
			},
			{
				...localRepo("/work/api-dirty"),
				isDirty: true,
				isWorktree: true,
			},
		],
		candidates: [],
		artifacts: [],
		warnings: [],
		skippedDirectoryCount: 0,
		scannedAt: "unix:1",
	};

	const overview = buildRepositoriesOverview(scanResult);
	const groupRow = overview.rows.find((row) => row.rowKind === "group");
	const dirtyWorktree = overview.rows.find(
		(row) => row.rowKind === "worktree" && row.state === "dirty",
	);
	const featureWorktree = overview.rows.find(
		(row) => row.rowKind === "worktree" && row.branchName === "feature-x",
	);

	expect(overview.repoCount).toBe(1);
	expect(overview.worktreeCount).toBe(3);
	expect(overview.dirtyCount).toBe(1);
	expect(overview.rows).toHaveLength(3);
	expect(groupRow).toMatchObject({
		displayName: "api-main",
		worktreeCount: 3,
		branchName: "main",
		state: "clean",
	});
	expect(dirtyWorktree).toMatchObject({
		displayName: "api-dirty",
		worktreeCount: 1,
		branchName: "main",
		state: "dirty",
	});
	expect(featureWorktree).toMatchObject({
		displayName: "api-feature",
		worktreeCount: 1,
		branchName: "feature-x",
		state: "clean",
	});
});

function localRepo(repoRootPath: string): CodeRepo {
	return {
		repoRootPath,
		repoKey: { kind: "local", value: "local-hash" },
		sourceRoot: "/work",
		branchName: "main",
		headSha: "abc",
		isDirty: false,
		isWorktree: false,
		isNested: false,
		hasRudelLockfile: false,
	};
}
