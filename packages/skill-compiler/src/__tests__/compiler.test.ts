import { describe, expect, it } from "bun:test";
import { compileSkillBlueprint } from "../index.js";

describe("compileSkillBlueprint", () => {
	it("compiles deterministic target artifacts with overlay variables", () => {
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
});
