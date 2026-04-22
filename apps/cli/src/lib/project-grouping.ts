import { homedir } from "node:os";
import {
	getAvailableAdapters,
	type ScannedProject,
} from "@rudel/agent-adapters";
import { getGitRemoteUrl, normalizeRemoteUrl } from "./git-info";
import {
	cacheRemote,
	cacheRemotes,
	getCachedRemote,
	getRemoteCache,
} from "./remote-cache";

export interface ScanResult {
	projects: ScannedProject[];
	groups: ProjectGroup[];
}

export async function scanAndGroupProjects(
	cwd: string = process.cwd(),
): Promise<ScanResult> {
	const adapters = getAvailableAdapters();
	const projects: ScannedProject[] = [];
	for (const adapter of adapters) {
		const scanned = await adapter.scanAllSessions();
		projects.push(...scanned);
	}
	const groups = await groupProjectsByRemote(projects, cwd);
	return { projects, groups };
}

export interface ProjectGroup {
	displayName: string;
	gitRemote: string | null;
	projects: ScannedProject[];
	totalSessions: number;
	containsCwd: boolean;
}

function extractDisplayName(normalized: string): string {
	// "github.com/owner/repo" → "owner/repo"
	const parts = normalized.split("/");
	if (parts.length >= 3) {
		return parts.slice(1).join("/");
	}
	return normalized;
}

function encodeProjectPath(projectPath: string): string {
	return projectPath.replace(/\//g, "-");
}

export async function groupProjectsByRemote(
	projects: ScannedProject[],
	cwd: string,
): Promise<ProjectGroup[]> {
	const cache = await getRemoteCache();
	let cacheUpdated = false;

	const remotes = await Promise.all(
		projects.map((p) => getGitRemoteUrl(p.projectPath)),
	);

	const grouped = new Map<
		string,
		{ remote: string; projects: ScannedProject[] }
	>();
	const ungrouped: ScannedProject[] = [];

	for (let i = 0; i < projects.length; i++) {
		const project = projects[i] as ScannedProject;
		const remote = remotes[i];

		if (remote) {
			const normalized = normalizeRemoteUrl(remote);
			const encodedDir = encodeProjectPath(project.projectPath);
			// Cache newly resolved remotes
			if (getCachedRemote(cache, encodedDir) !== normalized) {
				cacheRemote(cache, encodedDir, normalized);
				cacheUpdated = true;
			}
			const existing = grouped.get(normalized);
			if (existing) {
				existing.projects.push(project);
			} else {
				grouped.set(normalized, { remote: normalized, projects: [project] });
			}
		} else {
			// Try cache for ungrouped projects
			const encodedDir = encodeProjectPath(project.projectPath);
			const cached = getCachedRemote(cache, encodedDir);
			if (cached) {
				const existing = grouped.get(cached);
				if (existing) {
					existing.projects.push(project);
				} else {
					grouped.set(cached, { remote: cached, projects: [project] });
				}
			} else {
				ungrouped.push(project);
			}
		}
	}

	const groups: ProjectGroup[] = [];

	for (const [, entry] of grouped) {
		const containsCwd = entry.projects.some(
			(p) => cwd === p.projectPath || cwd.startsWith(`${p.projectPath}/`),
		);
		groups.push({
			displayName: extractDisplayName(entry.remote),
			gitRemote: entry.remote,
			projects: entry.projects,
			totalSessions: entry.projects.reduce((s, p) => s + p.sessionCount, 0),
			containsCwd,
		});
	}

	// Second pass: match ungrouped projects to existing groups by path similarity.
	const homeSegments = homedir().split("/").length;
	const remainingUngrouped: ScannedProject[] = [];

	for (const project of ungrouped) {
		const match = findBestGroupByPath(project, groups, homeSegments);
		if (match) {
			match.projects.push(project);
			match.totalSessions += project.sessionCount;
			if (
				cwd === project.projectPath ||
				cwd.startsWith(`${project.projectPath}/`)
			) {
				match.containsCwd = true;
			}
		} else {
			remainingUngrouped.push(project);
		}
	}

	for (const project of remainingUngrouped) {
		const containsCwd =
			cwd === project.projectPath || cwd.startsWith(`${project.projectPath}/`);
		groups.push({
			displayName: project.displayPath,
			gitRemote: null,
			projects: [project],
			totalSessions: project.sessionCount,
			containsCwd,
		});
	}

	groups.sort((a, b) => {
		if (a.containsCwd !== b.containsCwd) return a.containsCwd ? -1 : 1;
		const aHasRemote = a.gitRemote !== null;
		const bHasRemote = b.gitRemote !== null;
		if (aHasRemote !== bHasRemote) return aHasRemote ? -1 : 1;
		return a.displayName.localeCompare(b.displayName);
	});

	// Fire-and-forget cache write
	if (cacheUpdated) {
		cacheRemotes(cache);
	}

	return groups;
}

function commonPrefixLength(a: string, b: string): number {
	const partsA = a.split("/");
	const partsB = b.split("/");
	let count = 0;
	for (let i = 0; i < Math.min(partsA.length, partsB.length); i++) {
		if (partsA[i] === partsB[i]) count++;
		else break;
	}
	return count;
}

function findBestGroupByPath(
	project: ScannedProject,
	groups: ProjectGroup[],
	homeSegments: number,
): ProjectGroup | null {
	let bestGroup: ProjectGroup | null = null;
	let bestLen = 0;
	let secondBestLen = 0;

	for (const group of groups) {
		if (!group.gitRemote) continue;

		let groupBest = 0;
		for (const p of group.projects) {
			groupBest = Math.max(
				groupBest,
				commonPrefixLength(project.projectPath, p.projectPath),
			);
		}

		if (groupBest > bestLen) {
			secondBestLen = bestLen;
			bestLen = groupBest;
			bestGroup = group;
		} else if (groupBest > secondBestLen) {
			secondBestLen = groupBest;
		}
	}

	// Must extend beyond home dir AND be strictly better than second-best
	if (bestGroup && bestLen > homeSegments && bestLen > secondBestLen) {
		return bestGroup;
	}
	return null;
}
