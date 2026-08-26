import { describe, expect, test } from "bun:test";
import { resolveRepoIdentity, type Source } from "../contracts/index.js";
import type { ScannedProject } from "../internal/agent-adapters/index.js";
import {
	classifyUploadProjects,
	getRepositoryHookState,
	groupUploadProjectsByRepository,
	orderUploadRepositoriesNewFirst,
	type ResolvedOrganizationUploadStatus,
} from "../lib/upload-reconciliation.js";

describe("upload reconciliation", () => {
	test("classifies remote uploads and suppresses local duplicates per resolved organization", () => {
		const firstProject = createProject("first", ["uploaded", "shared-new"]);
		const secondProject = createProject("second", ["shared-new", "other-new"]);
		const thirdProject = createProject("third", ["shared-new"]);
		const statuses = new Map<
			string | undefined,
			ResolvedOrganizationUploadStatus
		>([
			[
				undefined,
				{
					organizationId: "org-a",
					uploadedSessionIds: new Set(["uploaded"]),
				},
			],
			[
				"org-a",
				{
					organizationId: "org-a",
					uploadedSessionIds: new Set(["uploaded"]),
				},
			],
			[
				"org-b",
				{
					organizationId: "org-b",
					uploadedSessionIds: new Set(),
				},
			],
		]);

		const result = classifyUploadProjects(
			[
				{ organizationId: undefined, project: firstProject },
				{ organizationId: "org-a", project: secondProject },
				{ organizationId: "org-b", project: thirdProject },
			],
			statuses,
		);

		expect(
			result[0]?.uploadedSessions.map((session) => session.sessionId),
		).toEqual(["uploaded"]);
		expect(result[0]?.newSessions.map((session) => session.sessionId)).toEqual([
			"shared-new",
		]);
		expect(
			result[1]?.duplicateSessions.map((session) => session.sessionId),
		).toEqual(["shared-new"]);
		expect(result[1]?.newSessions.map((session) => session.sessionId)).toEqual([
			"other-new",
		]);
		expect(result[2]?.newSessions.map((session) => session.sessionId)).toEqual([
			"shared-new",
		]);
	});

	test("groups worktrees and agent sources into canonical repositories", () => {
		const uploadedWorktree = createProject("podgorica", ["old"], {
			projectPath:
				"/Users/test/conductor/workspaces/rudel-v2/podgorica/apps/cli",
			source: "claude_code",
		});
		const newWorktree = createProject("lansing", ["new"], {
			projectPath: "/Users/test/conductor/workspaces/rudel-v2/lansing",
			source: "codex",
		});
		const currentProject = createProject("other", ["uploaded"], {
			projectPath: "/Users/test/projects/other",
			source: "claude_code",
		});
		const projects = [
			{
				newSessions: [],
				project: uploadedWorktree,
				hookInstalled: true,
				repositoryIdentity: resolveIdentity(uploadedWorktree),
			},
			{
				newSessions: newWorktree.sessions,
				project: newWorktree,
				hookInstalled: false,
				repositoryIdentity: resolveIdentity(newWorktree),
			},
			{
				newSessions: [],
				project: currentProject,
				hookInstalled: true,
				repositoryIdentity: resolveRepoIdentity({
					gitRemote: "github.com/acme/other",
					packageName: null,
					projectPath: currentProject.projectPath,
				}),
			},
		];
		const order = new Map([
			[uploadedWorktree, { containsCwd: false, index: 1 }],
			[newWorktree, { containsCwd: false, index: 2 }],
			[currentProject, { containsCwd: true, index: 0 }],
		]);

		const repositories = groupUploadProjectsByRepository(projects);
		const rudelRepository = repositories.find(
			(repository) => repository.key === "path:rudel-v2",
		);
		if (!rudelRepository)
			throw new Error("rudel-v2 repository was not grouped");
		const result = orderUploadRepositoriesNewFirst(repositories, order);

		expect(repositories).toHaveLength(2);
		expect(rudelRepository.label).toBe("rudel-v2");
		expect(
			rudelRepository.projects.map((project) => project.project.displayPath),
		).toEqual(["podgorica", "lansing"]);
		expect(getRepositoryHookState(rudelRepository)).toBe("mixed");
		expect(result.map((repository) => repository.label)).toEqual([
			"rudel-v2",
			"acme/other",
		]);
	});
});

function createProject(
	name: string,
	sessionIds: readonly string[],
	options: {
		readonly projectPath?: string;
		readonly source?: Source;
	} = {},
): ScannedProject {
	const projectPath = options.projectPath ?? `/test/${name}`;
	const sessions = sessionIds.map((sessionId) => ({
		projectPath,
		sessionId,
		transcriptPath: `${projectPath}/${sessionId}.jsonl`,
	}));
	return {
		displayPath: name,
		projectPath,
		sessionCount: sessions.length,
		sessions,
		source: options.source ?? "claude_code",
	};
}

function resolveIdentity(project: ScannedProject) {
	return resolveRepoIdentity({
		gitRemote: null,
		packageName: null,
		projectPath: project.projectPath,
	});
}
