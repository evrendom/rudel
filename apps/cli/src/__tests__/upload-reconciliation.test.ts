import { describe, expect, test } from "bun:test";
import type { ScannedProject } from "@rudel/agent-adapters";
import {
	classifyUploadProjects,
	orderUploadProjectsNewFirst,
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

	test("orders projects with new sessions before fully uploaded projects", () => {
		const uploadedProject = createProject("uploaded", ["old"]);
		const newProject = createProject("new", ["new"]);
		const projects = [
			{
				newSessions: [],
				project: uploadedProject,
			},
			{
				newSessions: newProject.sessions,
				project: newProject,
			},
		];
		const order = new Map([
			[uploadedProject, { containsCwd: true, index: 0 }],
			[newProject, { containsCwd: false, index: 1 }],
		]);

		const result = orderUploadProjectsNewFirst(projects, order);

		expect(result.map((project) => project.project.displayPath)).toEqual([
			"new",
			"uploaded",
		]);
	});
});

function createProject(
	name: string,
	sessionIds: readonly string[],
): ScannedProject {
	const projectPath = `/test/${name}`;
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
		source: "claude_code",
	};
}
