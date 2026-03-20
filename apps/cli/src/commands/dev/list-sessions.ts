import { getAdapter, type ScannedProject } from "@rudel/agent-adapters";
import { buildCommand } from "@stricli/core";
import { scanAndGroupProjects } from "../../lib/project-grouping.js";

async function runListSessions(): Promise<void> {
	const { projects: allProjects, groups } = await scanAndGroupProjects();

	if (allProjects.length === 0) {
		console.log("No projects with sessions found.");
		return;
	}

	const lines: string[] = [];

	for (const group of groups) {
		const isCurrent = group.containsCwd ? " [current]" : "";

		if (group.projects.length === 1) {
			const proj = group.projects[0] as ScannedProject;
			const name = getAdapter(proj.source).name;
			lines.push(
				`[${name}] ${proj.displayPath} (${proj.sessionCount} sessions)${isCurrent}`,
			);
			continue;
		}

		const totalSessions = group.projects.reduce(
			(s, p) => s + p.sessionCount,
			0,
		);
		lines.push(
			`${group.displayName} (${group.projects.length} projects, ${totalSessions} sessions)${isCurrent}`,
		);
		for (const proj of group.projects) {
			const name = getAdapter(proj.source).name;
			const cwdMarker = proj.projectPath === process.cwd() ? " [cwd]" : "";
			lines.push(
				`  [${name}] ${proj.displayPath} (${proj.sessionCount} sessions)${cwdMarker}`,
			);
		}
	}

	const totalSessions = allProjects.reduce((s, p) => s + p.sessionCount, 0);
	console.log(`${allProjects.length} projects, ${totalSessions} sessions\n`);
	for (const line of lines) {
		console.log(line);
	}
}

export const listSessionsCommand = buildCommand({
	loader: async () => ({ default: runListSessions }),
	parameters: {},
	docs: {
		brief: "List session files that would appear in the upload picker",
	},
});
