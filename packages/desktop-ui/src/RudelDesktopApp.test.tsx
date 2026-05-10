import { expect, test } from "bun:test";
import type { MachineScanResult } from "@rudel/skill-schema";
import { renderToStaticMarkup } from "react-dom/server";
import type { RepoOverviewRow } from "./features/repositories-overview/index.js";
import type { RudelDesktopAppProps } from "./RudelDesktopApp.js";
import {
	buildDetectedSkillRows,
	buildRepoAlwaysLoadedMarkdownFiles,
	buildRepoSkillIconItems,
	buildRepoSkillInventoryRows,
	buildSkillRolloutRows,
	dashboardBreadcrumbItems,
	parseMarkdownBlocks,
	parseSkillDocument,
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

test("dashboardBreadcrumbItems keeps the repo trail for repo skill pages", () => {
	const [selectedSkill] = buildDetectedSkillRows({
		roots: [],
		repos: [],
		candidates: [],
		artifacts: [
			{
				id: "skill",
				sourceScope: "repo",
				artifactTarget: "codex",
				absolutePathHash: "hash-skill",
				path: "/repo/.agents/skills/typescript-standards/SKILL.md",
				repoRootPath: "/repo",
				repoRelativePath: ".agents/skills/typescript-standards/SKILL.md",
				name: "typescript-standards",
				content: "# TypeScript Standards",
				contentHash: "content-skill",
				normalizedContentHash: "normalized-skill",
			},
		],
		warnings: [],
		skippedDirectoryCount: 0,
		scannedAt: "unix:1",
	});
	if (!selectedSkill) {
		throw new Error("Expected test skill row.");
	}

	let openedRepoId: string | undefined;
	const items = dashboardBreadcrumbItems({
		onOpenRepo: (repoId) => {
			openedRepoId = repoId;
		},
		onShowMain: () => {},
		onShowRepos: () => {},
		onShowSkills: () => {},
		selectedRepo: undefined,
		selectedSkill,
		selectedSkillRepo: repoOverviewRow,
	});

	expect(items.map((item) => item.label)).toEqual([
		"Main",
		"Repos",
		"repo",
		"typescript-standards",
	]);
	items[2]?.onSelect?.();
	expect(openedRepoId).toBe("local:/repo");
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

test("parseSkillDocument extracts frontmatter and markdown body", () => {
	const document = parseSkillDocument(`---
name: code-architecture
description: Code architecture patterns. Use when organizing code.
allowed-tools: [Read, Edit, Grep, Glob]
---
# Code Architecture

Keep modules small.`);

	expect(document).toEqual({
		frontmatter: {
			name: "code-architecture",
			description: "Code architecture patterns. Use when organizing code.",
			allowedTools: ["Read", "Edit", "Grep", "Glob"],
		},
		body: "# Code Architecture\n\nKeep modules small.",
	});
});

test("parseSkillDocument leaves missing metadata empty", () => {
	const document = parseSkillDocument(`---
name:
description: ""
allowed-tools: []
---
# Empty Metadata`);

	expect(document.frontmatter).toEqual({
		name: undefined,
		description: undefined,
		allowedTools: [],
	});
});

test("parseSkillDocument reads YAML block description markers", () => {
	const literalDocument = parseSkillDocument(`---
name: careful
description: |
  Safety guardrails for destructive commands.
  Warns before rm -rf and force-push.
allowed-tools: [Read, Edit]
---
# Careful`);
	const foldedDocument = parseSkillDocument(`---
name: rust-best-practices
description: >
  Idiomatic Rust code based on the
  Apollo GraphQL handbook.
---
# Rust`);

	expect(literalDocument.frontmatter).toEqual({
		name: "careful",
		description:
			"Safety guardrails for destructive commands. Warns before rm -rf and force-push.",
		allowedTools: ["Read", "Edit"],
	});
	expect(foldedDocument.frontmatter.description).toBe(
		"Idiomatic Rust code based on the Apollo GraphQL handbook.",
	);
});

test("parseMarkdownBlocks styles common skill markdown structures", () => {
	const blocks = parseMarkdownBlocks(`# Title

Paragraph with \`inline code\` and [a link](https://example.com).

> Remember this.

- First
- Second

| Tool | Use |
| --- | --- |
| Read | Inspect files |

\`\`\`ts
const enabled = true;
\`\`\``);

	expect(blocks.map((block) => block.type)).toEqual([
		"heading",
		"paragraph",
		"blockquote",
		"list",
		"table",
		"code",
	]);
	expect(blocks[4]).toMatchObject({
		headers: ["Tool", "Use"],
		rows: [["Read", "Inspect files"]],
		type: "table",
	});
});

test("buildRepoSkillIconItems collapses nested skills to the mother skill", () => {
	const artifacts: MachineScanResult["artifacts"] = [
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
			repoRelativePath: "gstack/.agents/skills/gstack-review/SKILL.md",
			name: "gstack-review",
			content: "# Review",
			contentHash: "content-nested-two",
			normalizedContentHash: "normalized-nested-two",
		},
		{
			id: "parent",
			sourceScope: "repo",
			artifactTarget: "claude_code",
			absolutePathHash: "hash-parent",
			path: "/repo/.claude/skills/gstack/SKILL.md",
			repoRootPath: "/repo",
			repoRelativePath: ".claude/skills/gstack/SKILL.md",
			name: "gstack",
			content: "# Gstack",
			contentHash: "content-parent",
			normalizedContentHash: "normalized-parent",
		},
		{
			id: "symlinked-sibling",
			sourceScope: "symlink",
			artifactTarget: "claude_code",
			absolutePathHash: "hash-symlinked-sibling",
			path: "/repo/.claude/skills/gstack/autoplan/SKILL.md",
			repoRootPath: "/repo",
			repoRelativePath: ".claude/skills/autoplan/SKILL.md",
			name: "autoplan",
			content: "# Autoplan",
			contentHash: "content-symlinked-sibling",
			normalizedContentHash: "normalized-symlinked-sibling",
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
	];
	const items = buildRepoSkillIconItems(repoOverviewRow, artifacts);

	expect(items.map((item) => item.name)).toEqual([
		"gstack",
		"typescript-standards",
	]);
	expect(
		buildRepoSkillIconItems(
			repoOverviewRow,
			artifacts,
			buildDetectedSkillRows({
				roots: [],
				repos: [],
				candidates: [],
				artifacts,
				warnings: [],
				skippedDirectoryCount: 0,
				scannedAt: "unix:1",
			}),
		).find((item) => item.name === "typescript-standards")?.skillId,
	).toBe("typescript-standards");
	expect(
		buildRepoSkillIconItems(
			repoOverviewRow,
			artifacts,
			buildDetectedSkillRows({
				roots: [],
				repos: [],
				candidates: [],
				artifacts,
				warnings: [],
				skippedDirectoryCount: 0,
				scannedAt: "unix:1",
			}),
		).find((item) => item.name === "gstack")?.skillId,
	).toBe("gstack");
});

test("buildRepoAlwaysLoadedMarkdownFiles dedupes repo context markdown by size", () => {
	const rootAgentsContent = "Agent instructions for every run.";
	const rootClaudeContent = "Claude instructions.";
	const nestedAgentsContent = "Nested package instructions.";
	const nestedAgentsSecondContent = "Nested app instructions.";
	const files = buildRepoAlwaysLoadedMarkdownFiles(repoOverviewRow, [
		{
			id: "agents",
			sourceScope: "repo",
			artifactTarget: "agents_md",
			absolutePathHash: "hash-agents",
			path: "/repo/AGENTS.md",
			repoRootPath: "/repo",
			repoRelativePath: "AGENTS.md",
			content: rootAgentsContent,
			contentHash: "content-agents",
			normalizedContentHash: "normalized-agents",
		},
		{
			id: "agents-duplicate",
			sourceScope: "repo",
			artifactTarget: "agents_md",
			absolutePathHash: "hash-agents-duplicate",
			path: "/repo/AGENTS.md",
			repoRootPath: "/repo",
			repoRelativePath: "AGENTS.md",
			content: "Short",
			contentHash: "content-agents-duplicate",
			normalizedContentHash: "normalized-agents-duplicate",
		},
		{
			id: "nested-agents",
			sourceScope: "repo",
			artifactTarget: "agents_md",
			absolutePathHash: "hash-nested-agents",
			path: "/repo/packages/app/AGENTS.md",
			repoRootPath: "/repo",
			repoRelativePath: "packages/app/AGENTS.md",
			content: nestedAgentsContent,
			contentHash: "content-nested-agents",
			normalizedContentHash: "normalized-nested-agents",
		},
		{
			id: "nested-agents-second",
			sourceScope: "repo",
			artifactTarget: "agents_md",
			absolutePathHash: "hash-nested-agents-second",
			path: "/repo/packages/lib/AGENTS.md",
			repoRootPath: "/repo",
			repoRelativePath: "packages/lib/AGENTS.md",
			content: nestedAgentsSecondContent,
			contentHash: "content-nested-agents-second",
			normalizedContentHash: "normalized-nested-agents-second",
		},
		{
			id: "claude",
			sourceScope: "repo",
			artifactTarget: "claude_md",
			absolutePathHash: "hash-claude",
			path: "/repo/CLAUDE.md",
			repoRootPath: "/repo",
			repoRelativePath: "CLAUDE.md",
			content: rootClaudeContent,
			contentHash: "content-claude",
			normalizedContentHash: "normalized-claude",
		},
		{
			id: "skill",
			sourceScope: "repo",
			artifactTarget: "codex",
			absolutePathHash: "hash-skill",
			path: "/repo/.agents/skills/typescript-standards/SKILL.md",
			repoRootPath: "/repo",
			repoRelativePath: ".agents/skills/typescript-standards/SKILL.md",
			name: "typescript-standards",
			content: "# TypeScript Standards",
			contentHash: "content-skill",
			normalizedContentHash: "normalized-skill",
		},
	]);

	expect(files).toEqual([
		{
			id: "AGENTS.md",
			path: "AGENTS.md",
			targetLabel: "AGENTS.md",
			characterCount: rootAgentsContent.length,
			fileCount: 1,
		},
		{
			id: "CLAUDE.md",
			path: "CLAUDE.md",
			targetLabel: "CLAUDE.md",
			characterCount: rootClaudeContent.length,
			fileCount: 1,
		},
		{
			id: "nested:AGENTS.md",
			path: "Nested AGENTS.md",
			targetLabel: "AGENTS.md",
			characterCount:
				nestedAgentsContent.length + nestedAgentsSecondContent.length,
			fileCount: 2,
		},
	]);
});

test("buildRepoSkillInventoryRows groups repo skill state by source", () => {
	const artifacts: MachineScanResult["artifacts"] = [
		{
			id: "global",
			sourceScope: "global_user",
			artifactTarget: "claude_code",
			absolutePathHash: "hash-global",
			path: "/Users/test/.claude/skills/typescript-standards/SKILL.md",
			name: "typescript-standards",
			content: "# TypeScript Standards",
			contentHash: "content-global",
			normalizedContentHash: "normalized-global",
		},
		{
			id: "managed",
			sourceScope: "repo",
			artifactTarget: "codex",
			absolutePathHash: "hash-managed",
			path: "/repo/.agents/skills/typescript-standards/SKILL.md",
			repoRootPath: "/repo",
			repoRelativePath: ".agents/skills/typescript-standards/SKILL.md",
			name: "typescript-standards",
			content: "# TypeScript Standards",
			contentHash: "content-managed",
			normalizedContentHash: "normalized-managed",
			lockfileEntry: {
				blueprintId: "typescript-standards",
				blueprintVersion: "v1",
				repoOverlayHash: "overlay-hash",
				generatedHash: "generated-hash",
				currentFileHash: "current-hash",
				artifactTarget: "codex",
				targetPath: ".agents/skills/typescript-standards/SKILL.md",
				schemaVersion: "1",
				compilerVersion: "1",
				status: "modified",
			},
		},
		{
			id: "local",
			sourceScope: "repo",
			artifactTarget: "claude_code",
			absolutePathHash: "hash-local",
			path: "/repo/.claude/skills/workflow-note/SKILL.md",
			repoRootPath: "/repo",
			repoRelativePath: ".claude/skills/workflow-note/SKILL.md",
			name: "workflow-note",
			content: "# Workflow Note",
			contentHash: "content-local",
			normalizedContentHash: "normalized-local",
		},
		{
			id: "symlinked",
			sourceScope: "symlink",
			symlinkKind: "skill_folder",
			artifactTarget: "codex",
			absolutePathHash: "hash-symlinked",
			path: "/repo/.agents/skills/shared-skill/SKILL.md",
			repoRootPath: "/repo",
			repoRelativePath: ".agents/skills/shared-skill/SKILL.md",
			name: "shared-skill",
			content: "# Shared Skill",
			contentHash: "content-symlinked",
			normalizedContentHash: "normalized-symlinked",
		},
		{
			id: "agents",
			sourceScope: "repo",
			artifactTarget: "agents_md",
			absolutePathHash: "hash-agents",
			path: "/repo/AGENTS.md",
			repoRootPath: "/repo",
			repoRelativePath: "AGENTS.md",
			content: "# Instructions",
			contentHash: "content-agents",
			normalizedContentHash: "normalized-agents",
		},
	];
	const skillRows = buildDetectedSkillRows({
		roots: [],
		repos: [],
		candidates: [],
		artifacts,
		warnings: [],
		skippedDirectoryCount: 0,
		scannedAt: "unix:1",
	});
	const rows = buildRepoSkillInventoryRows(
		repoOverviewRow,
		artifacts,
		skillRows,
	);

	expect(
		rows.map((row) => ({
			name: row.name,
			status: row.status,
			sourceLabel: row.sourceLabel,
			syncingLabel: row.syncingLabel,
			targetLabels: row.targetLabels,
			hasOverlay: row.hasOverlay,
		})),
	).toEqual([
		{
			name: "typescript-standards",
			status: "modified",
			sourceLabel: "Team blueprint v1",
			syncingLabel: "Codex only",
			targetLabels: ["Codex"],
			hasOverlay: true,
		},
		{
			name: "shared-skill",
			status: "unmanaged",
			sourceLabel: "Local skill",
			syncingLabel: "Skill folder symlink",
			targetLabels: ["Codex"],
			hasOverlay: false,
		},
		{
			name: "workflow-note",
			status: "unmanaged",
			sourceLabel: "Local skill",
			syncingLabel: "Claude only",
			targetLabels: ["Claude"],
			hasOverlay: false,
		},
		{
			name: "AGENTS.md",
			status: "detected_only",
			sourceLabel: "Managed section",
			syncingLabel: "AGENTS.md",
			targetLabels: ["AGENTS.md"],
			hasOverlay: false,
		},
	]);

	const sharedSkillRow = rows.find((row) => row.name === "shared-skill");
	expect(sharedSkillRow?.syncingDescription).toContain("whole skill directory");
	expect(sharedSkillRow?.syncingEvidence).toContain(
		".agents/skills/shared-skill/SKILL.md",
	);
});

test("buildSkillRolloutRows groups a selected skill by repo", () => {
	const artifacts: MachineScanResult["artifacts"] = [
		{
			id: "global",
			sourceScope: "global_user",
			artifactTarget: "claude_code",
			absolutePathHash: "hash-global",
			path: "/Users/test/.claude/skills/typescript-standards/SKILL.md",
			name: "typescript-standards",
			content: "# TypeScript Standards",
			contentHash: "content-global",
			normalizedContentHash: "normalized-global",
		},
		{
			id: "managed",
			sourceScope: "repo",
			artifactTarget: "codex",
			absolutePathHash: "hash-managed",
			path: "/repo/.agents/skills/typescript-standards/SKILL.md",
			repoRootPath: "/repo",
			repoRelativePath: ".agents/skills/typescript-standards/SKILL.md",
			name: "typescript-standards",
			content: "# TypeScript Standards",
			contentHash: "content-managed",
			normalizedContentHash: "normalized-managed",
			lockfileEntry: {
				blueprintId: "typescript-standards",
				blueprintVersion: "v1",
				repoOverlayHash: "overlay-hash",
				generatedHash: "generated-hash",
				currentFileHash: "current-hash",
				artifactTarget: "codex",
				targetPath: ".agents/skills/typescript-standards/SKILL.md",
				schemaVersion: "1",
				compilerVersion: "1",
				status: "modified",
			},
		},
		{
			id: "other",
			sourceScope: "repo",
			artifactTarget: "claude_code",
			absolutePathHash: "hash-other",
			path: "/repo/.claude/skills/workflow-note/SKILL.md",
			repoRootPath: "/repo",
			repoRelativePath: ".claude/skills/workflow-note/SKILL.md",
			name: "workflow-note",
			content: "# Workflow Note",
			contentHash: "content-other",
			normalizedContentHash: "normalized-other",
		},
	];
	const skillRows = buildDetectedSkillRows({
		roots: [],
		repos: [],
		candidates: [],
		artifacts,
		warnings: [],
		skippedDirectoryCount: 0,
		scannedAt: "unix:1",
	});
	const skill = skillRows.find((row) => row.id === "typescript-standards");
	if (!skill) {
		throw new Error("Expected typescript-standards skill row.");
	}
	expect(
		buildSkillRolloutRows(skill, [repoOverviewRow], artifacts).map((row) => ({
			repoId: row.repoId,
			repoName: row.repoName,
			emoji: row.emoji,
			background: row.background,
		})),
	).toEqual([
		{
			repoId: "local:/repo",
			repoName: "repo",
			emoji: "🧩",
			background: "#f1f1f1",
		},
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
