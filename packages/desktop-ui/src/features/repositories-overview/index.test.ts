import { expect, test } from "bun:test";
import type {
	CodeRepo,
	MachineScanResult,
	SkillArtifact,
} from "@rudel/skill-schema";
import { buildRepositoriesOverview } from "./index.js";

test("buildRepositoriesOverview groups repo artifacts and separates global files", () => {
	const scanResult: MachineScanResult = {
		roots: [],
		repos: [
			{
				repoRootPath: "/work/api",
				repoKey: { kind: "github", value: "github.com/acme/api" },
				sourceRoot: "/work",
				isNested: false,
				hasRudelLockfile: true,
			},
			localRepo("/work/local"),
		],
		artifacts: [
			artifact("/work/api/.claude/skills/typescript-standards/SKILL.md", {
				repoRootPath: "/work/api",
				name: "typescript-standards",
				managed: true,
			}),
			artifact("/work/local/AGENTS.md", {
				repoRootPath: "/work/local",
				name: "repo-rules",
				managed: false,
			}),
			artifact("/Users/me/.claude/skills/typescript-standards/SKILL.md", {
				name: "typescript-standards",
				sourceScope: "global_user",
				managed: false,
			}),
		],
		warnings: [{ root: "/missing", message: "Root path does not exist." }],
		skippedDirectoryCount: 2,
		scannedAt: "unix:1",
	};

	const overview = buildRepositoriesOverview(scanResult);

	expect(overview.repoCount).toBe(2);
	expect(overview.skillContextCount).toBe(3);
	expect(overview.globalArtifactCount).toBe(1);
	expect(overview.typescriptStandardsCount).toBe(2);
	expect(overview.warningCount).toBe(1);
	expect(overview.rows[0]).toMatchObject({
		displayName: "api",
		identity: "github.com/acme/api",
		skillContextCount: 1,
		managedCount: 1,
		typescriptStandardsCount: 1,
		hasRudelLockfile: true,
	});
	expect(overview.rows[1]).toMatchObject({
		displayName: "local",
		identity: "local-only",
		skillContextCount: 1,
		managedCount: 0,
		typescriptStandardsCount: 0,
	});
});

function localRepo(repoRootPath: string): CodeRepo {
	return {
		repoRootPath,
		repoKey: { kind: "local", value: "local-hash" },
		sourceRoot: "/work",
		isNested: false,
		hasRudelLockfile: false,
	};
}

function artifact(
	path: string,
	options: {
		repoRootPath?: string;
		name: string;
		sourceScope?: SkillArtifact["sourceScope"];
		managed: boolean;
	},
): SkillArtifact {
	return {
		id: path,
		sourceScope: options.sourceScope ?? "repo",
		artifactTarget: path.endsWith("AGENTS.md") ? "agents_md" : "claude_code",
		absolutePathHash: path,
		path,
		repoRootPath: options.repoRootPath,
		repoRelativePath: options.repoRootPath
			? path.slice(options.repoRootPath.length + 1)
			: undefined,
		repoKey: options.repoRootPath
			? { kind: "local", value: "local-hash" }
			: undefined,
		name: options.name,
		description: undefined,
		contentHash: "content",
		normalizedContentHash: "content",
		lockfileEntry: options.managed
			? {
					blueprintId: options.name,
					blueprintVersion: "v1",
					repoOverlayHash: "overlay",
					generatedHash: "content",
					currentFileHash: "content",
					artifactTarget: "claude_code",
					targetPath: ".claude/skills/typescript-standards/SKILL.md",
					schemaVersion: "1",
					compilerVersion: "1",
					status: "current",
				}
			: undefined,
	};
}
