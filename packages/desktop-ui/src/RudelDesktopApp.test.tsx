import { expect, test } from "bun:test";
import type { MachineScanResult } from "@rudel/skill-schema";
import { renderToStaticMarkup } from "react-dom/server";
import type { RepoOverviewRow } from "./features/repositories-overview/index.js";
import type { RudelDesktopAppProps } from "./RudelDesktopApp.js";
import {
	buildDetectedSkillRows,
	buildRepoSkillIconItems,
	RudelDesktopApp,
} from "./RudelDesktopApp.js";

test("RudelDesktopApp renders the simple onboarding entry step", () => {
	const markup = renderToStaticMarkup(
		<RudelDesktopApp
			localEngine={localEngine}
			pickWorkspaceRoots={async () => []}
		/>,
	);

	expect(markup).toContain("Hi there");
	expect(markup).toContain("Next");
	expect(markup).toContain("Onboarding steps");
	expect(markup).not.toContain("Repository");
	expect(markup).not.toContain("Scan repos");
	expect(markup).not.toContain("Choose folder");
});

test("buildDetectedSkillRows hydrates unique skills from scan artifacts", () => {
	const rows = buildDetectedSkillRows({
		roots: [],
		repos: [],
		candidates: [],
		artifacts: [
			{
				id: "one",
				sourceScope: "global_user",
				artifactTarget: "claude_code",
				absolutePathHash: "hash-one",
				path: "/Users/test/.claude/skills/typescript-standards/SKILL.md",
				name: "typescript-standards",
				content: "# TypeScript Standards\n\nGlobal skill content.",
				contentHash: "content-one",
				normalizedContentHash: "normalized-one",
			},
			{
				id: "two",
				sourceScope: "repo",
				artifactTarget: "codex",
				absolutePathHash: "hash-two",
				path: "/repo/.agents/skills/typescript-standards/SKILL.md",
				repoRootPath: "/repo",
				name: "typescript-standards",
				content: "# TypeScript Standards\n\nRepo skill content.",
				contentHash: "content-two",
				normalizedContentHash: "normalized-two",
			},
			{
				id: "three",
				sourceScope: "repo",
				artifactTarget: "claude_code",
				absolutePathHash: "hash-three",
				path: "/repo/.claude/skills/code-architecture/SKILL.md",
				repoRootPath: "/repo",
				content: "# Code Architecture\n\nKeep modules small.",
				contentHash: "content-three",
				normalizedContentHash: "normalized-three",
			},
		],
		warnings: [],
		skippedDirectoryCount: 0,
		scannedAt: "unix:1",
	} satisfies MachineScanResult);

	expect(rows).toHaveLength(2);
	expect(rows[0]).toMatchObject({
		name: "typescript-standards",
		sourceLabel: "repo + 1",
		content: "# TypeScript Standards\n\nRepo skill content.",
	});
	expect(rows[1]).toMatchObject({
		name: "code-architecture",
		sourceLabel: "repo",
	});
});

test("buildRepoSkillIconItems collapses nested skills to the mother skill", () => {
	const items = buildRepoSkillIconItems(repoOverviewRow, [
		{
			id: "nested-one",
			sourceScope: "repo",
			artifactTarget: "claude_code",
			absolutePathHash: "hash-nested-one",
			path: "/repo/.claude/skills/gstack/.agents/skills/gstack-autoplan/SKILL.md",
			repoRootPath: "/repo",
			repoRelativePath:
				".claude/skills/gstack/.agents/skills/gstack-autoplan/SKILL.md",
			name: "gstack-autoplan",
			content: "# Autoplan",
			contentHash: "content-nested-one",
			normalizedContentHash: "normalized-nested-one",
		},
		{
			id: "nested-two",
			sourceScope: "repo",
			artifactTarget: "claude_code",
			absolutePathHash: "hash-nested-two",
			path: "/repo/.claude/skills/gstack/.agents/skills/gstack-review/SKILL.md",
			repoRootPath: "/repo",
			repoRelativePath:
				".claude/skills/gstack/.agents/skills/gstack-review/SKILL.md",
			name: "gstack-review",
			content: "# Review",
			contentHash: "content-nested-two",
			normalizedContentHash: "normalized-nested-two",
		},
		{
			id: "direct",
			sourceScope: "repo",
			artifactTarget: "codex",
			absolutePathHash: "hash-direct",
			path: "/repo/.agents/skills/typescript-standards/SKILL.md",
			repoRootPath: "/repo",
			repoRelativePath: ".agents/skills/typescript-standards/SKILL.md",
			name: "typescript-standards",
			content: "# TypeScript Standards",
			contentHash: "content-direct",
			normalizedContentHash: "normalized-direct",
		},
	]);

	expect(items.map((item) => item.name)).toEqual([
		"gstack",
		"typescript-standards",
	]);
});

const repoOverviewRow = {
	id: "local:/repo",
	repoRootPath: "/repo",
	repoRootPaths: ["/repo"],
	displayName: "repo",
	identity: "local-only",
	linkLabel: "/repo",
	linkHref: undefined,
	worktreeCount: 1,
	branchCount: 1,
	activityCount: 1,
	branchName: "main",
	isDirty: false,
	skillFileCount: 3,
	dirtyWorktreeCount: 0,
	dirtySkillFileCount: 0,
	dirtyWorktrees: [],
} satisfies RepoOverviewRow;

const localEngine: RudelDesktopAppProps["localEngine"] = {
	async suggestScanRoots() {
		return { suggestions: [] };
	},
	async scanMachine() {
		return {
			roots: [],
			repos: [],
			candidates: [],
			artifacts: [],
			warnings: [],
			skippedDirectoryCount: 0,
			scannedAt: "unix:1",
		};
	},
	async streamSkillInventory(_input, onEvent) {
		onEvent({
			type: "done",
			scanId: "test-scan",
			result: {
				roots: [],
				repos: [],
				candidates: [],
				artifacts: [],
				warnings: [],
				skippedDirectoryCount: 0,
				scannedAt: "unix:1",
			},
		});
		return () => {};
	},
};
