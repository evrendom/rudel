import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { exec } from "./exec";

interface ProjectEntry {
	organizationId: string;
}

interface ProjectsConfig {
	projects: Record<string, ProjectEntry>;
}

function getConfigDir(): string {
	return process.env.RUDEL_CONFIG_DIR ?? join(homedir(), ".rudel");
}

function getProjectsConfigPath(): string {
	return join(getConfigDir(), "projects.json");
}

function loadProjectsConfig(): ProjectsConfig {
	const path = getProjectsConfigPath();
	if (!existsSync(path)) return { projects: {} };
	const content = readFileSync(path, "utf-8");
	return JSON.parse(content) as ProjectsConfig;
}

function saveProjectsConfig(config: ProjectsConfig): void {
	const dir = getConfigDir();
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true, mode: 0o700 });
	}
	writeFileSync(getProjectsConfigPath(), JSON.stringify(config, null, 2), {
		mode: 0o600,
	});
}

async function getProjectKey(cwd: string): Promise<string> {
	// Prefer git remote URL (portable across clones)
	try {
		const result = await exec("git", [
			"-C",
			cwd,
			"remote",
			"get-url",
			"origin",
		]);
		if (result.exitCode === 0) {
			const url = result.stdout.trim();
			// Normalize: strip .git suffix and protocol
			return url
				.replace(/^(https?:\/\/|git@|ssh:\/\/)/, "")
				.replace(/:/, "/")
				.replace(/\.git$/, "");
		}
	} catch {
		// Not a git repo or no remote
	}

	// Fall back to absolute path
	try {
		const result = await exec("git", [
			"-C",
			cwd,
			"rev-parse",
			"--show-toplevel",
		]);
		if (result.exitCode === 0) {
			return result.stdout.trim();
		}
	} catch {
		// Not a git repo
	}

	return cwd;
}

export async function getProjectOrgId(
	cwd: string,
): Promise<string | undefined> {
	const key = await getProjectKey(cwd);
	const config = loadProjectsConfig();
	return config.projects[key]?.organizationId;
}

export async function setProjectOrgId(
	cwd: string,
	organizationId: string,
): Promise<void> {
	const key = await getProjectKey(cwd);
	const config = loadProjectsConfig();
	config.projects[key] = { organizationId };
	saveProjectsConfig(config);
}
