import { describe, expect, test } from "bun:test";
import {
	compileSkillBlueprint,
	hashContent,
	typescriptStandardsBlueprint,
	typescriptStandardsModules,
} from "../index.js";

describe("compileSkillBlueprint", () => {
	test("compiles deterministic target artifacts with overlay variables", () => {
		const artifacts = compileSkillBlueprint({
			blueprint: {
				id: "bp_test_runner",
				slug: "test-runner",
				name: "Test Runner",
				description: "Run {{testCommand}} before finishing.",
				trigger: "Use when tests are needed.",
				version: "1.0.0",
				modules: [{ moduleId: "mod_safety", required: true }],
				variables: [
					{
						name: "testCommand",
						defaultValue: "bun test",
						required: true,
					},
				],
				targets: ["claude_code", "codex", "cursor"],
				blocks: [
					{
						id: "goal",
						kind: "goal",
						title: "Goal",
						body: "Keep the repo green.",
					},
				],
			},
			modules: [
				{
					id: "mod_safety",
					slug: "safety",
					name: "Safety",
					kind: "safety",
					blocks: [
						{
							id: "safe-writes",
							kind: "safety",
							title: "Safety",
							body: "Do not overwrite local edits.",
						},
					],
				},
			],
			overlay: {
				repoId: "repo_api",
				blueprintId: "bp_test_runner",
				variables: {
					testCommand: "bun run --cwd apps/api test",
				},
				enabledModules: [],
				disabledModules: [],
				appendedBlocks: [],
			},
		});

		expect(artifacts).toHaveLength(3);
		expect(artifacts[0]?.targetPath).toBe(
			".claude/skills/test-runner/SKILL.md",
		);
		expect(artifacts[0]?.artifactTarget).toBe("claude_code");
		expect(artifacts[0]?.blueprintId).toBe("bp_test_runner");
		expect(artifacts[0]?.blueprintVersionId).toBe("1.0.0");
		expect(artifacts[0]?.schemaVersion).toBe("1");
		expect(artifacts[0]?.compilerVersion).toBe("1");
		expect(artifacts[0]?.content).toContain("bun run --cwd apps/api test");
		expect(artifacts[0]?.contentHash).toBe(
			compileSkillBlueprint({
				blueprint: {
					id: "bp_test_runner",
					slug: "test-runner",
					name: "Test Runner",
					description: "Run {{testCommand}} before finishing.",
					trigger: "Use when tests are needed.",
					version: "1.0.0",
					modules: [{ moduleId: "mod_safety", required: true }],
					variables: [
						{
							name: "testCommand",
							defaultValue: "bun test",
							required: true,
						},
					],
					targets: ["claude_code"],
					blocks: [
						{
							id: "goal",
							kind: "goal",
							title: "Goal",
							body: "Keep the repo green.",
						},
					],
				},
				modules: [
					{
						id: "mod_safety",
						slug: "safety",
						name: "Safety",
						kind: "safety",
						blocks: [
							{
								id: "safe-writes",
								kind: "safety",
								title: "Safety",
								body: "Do not overwrite local edits.",
							},
						],
					},
				],
				overlay: {
					repoId: "repo_api",
					blueprintId: "bp_test_runner",
					variables: {
						testCommand: "bun run --cwd apps/api test",
					},
					enabledModules: [],
					disabledModules: [],
					appendedBlocks: [],
				},
			})[0]?.contentHash,
		);
	});

	test("compiles typescript-standards into target-native artifacts", () => {
		const artifacts = compileSkillBlueprint({
			blueprint: typescriptStandardsBlueprint,
			modules: typescriptStandardsModules,
			targets: ["claude_code", "codex", "cursor", "agents_md", "claude_md"],
			blueprintVersionId: "version_published_1",
			overlayHash: "overlay_none",
		});

		expect(artifacts.map((artifact) => artifact.targetPath)).toEqual([
			".claude/skills/typescript-standards/SKILL.md",
			".agents/skills/typescript-standards/SKILL.md",
			".cursor/rules/typescript-standards.mdc",
			"AGENTS.md",
			"CLAUDE.md",
		]);
		expect(artifacts[0]?.content).toContain("Avoid Unsafe Type Assertions");
		expect(artifacts[2]?.content).toContain("alwaysApply: false");
		expect(artifacts[3]?.content).toContain(
			"<!-- rudel:typescript-standards:start -->",
		);
		expect(artifacts[4]?.content).toContain(
			"<!-- rudel:typescript-standards:end -->",
		);
	});

	test("hashes content with stable line ending normalization", () => {
		expect(hashContent("line 1\nline 2\n")).toBe(
			hashContent("line 1\r\nline 2\r\n"),
		);
	});
});
