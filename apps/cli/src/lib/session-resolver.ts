import { access, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
	decodeProjectPath,
	extractV3SessionId,
	getV3SessionsDir,
	isPiSessionDir,
	readJsonlFirstLine,
} from "@rudel/agent-adapters";

export const SESSIONS_BASE_DIR = join(homedir(), ".claude", "projects");

export interface SessionInfo {
	transcriptPath: string;
	projectPath: string;
	sessionDir: string;
	sessionId: string;
}

export async function resolveSession(input: string): Promise<SessionInfo> {
	const isPath = input.includes("/") || input.endsWith(".jsonl");

	if (isPath) {
		return resolveFromPath(input);
	}
	return resolveFromId(input);
}

async function resolveFromPath(filePath: string): Promise<SessionInfo> {
	// Check if input is a directory (pi v2 session)
	try {
		const s = await stat(filePath);
		if (s.isDirectory()) {
			if (await isPiSessionDir(filePath)) {
				const sessionId = basename(filePath);
				const sessionDir = dirname(filePath);
				const parentDir = basename(sessionDir);
				const projectPath = await decodeProjectPath(parentDir);
				return {
					transcriptPath: filePath,
					projectPath,
					sessionDir,
					sessionId,
				};
			}
			throw new Error(`Directory is not a valid session: ${filePath}`);
		}
	} catch (error) {
		if (
			error instanceof Error &&
			error.message.startsWith("Directory is not")
		) {
			throw error;
		}
		// stat failed — fall through to file-based resolution
	}

	// Check if input is a pi v3 session file
	if (filePath.startsWith(getV3SessionsDir()) && filePath.endsWith(".jsonl")) {
		const sessionId = extractV3SessionId(basename(filePath));
		if (sessionId) {
			const firstLine = (await readJsonlFirstLine(filePath)) as {
				cwd?: string;
			} | null;
			const projectPath = firstLine?.cwd ?? "";
			return {
				transcriptPath: filePath,
				projectPath,
				sessionDir: dirname(filePath),
				sessionId,
			};
		}
	}

	const filename = basename(filePath);
	validateNotSubagent(filename);

	try {
		await access(filePath);
	} catch {
		throw new Error(`Session file not found: ${filePath}`);
	}

	const sessionId = filename.replace(/\.jsonl$/, "");
	const sessionDir = dirname(filePath);

	// Walk up from sessionDir to find the project directory name
	// Sessions live at: ~/.claude/projects/<encoded-project-dir>/<sessionId>.jsonl
	const parentDir = basename(sessionDir);
	const projectPath = await decodeProjectPath(parentDir);

	return { transcriptPath: filePath, projectPath, sessionDir, sessionId };
}

async function resolveFromId(sessionId: string): Promise<SessionInfo> {
	validateNotSubagent(`${sessionId}.jsonl`);
	const sessionFileName = `${sessionId}.jsonl`;

	let projectDirs: string[];
	try {
		projectDirs = await readdir(SESSIONS_BASE_DIR);
	} catch {
		throw new Error(`Session not found: ${sessionId}`);
	}

	for (const projectDir of projectDirs) {
		const sessionDir = join(SESSIONS_BASE_DIR, projectDir);
		try {
			const files = await readdir(sessionDir);

			// Check for regular .jsonl session file
			if (files.includes(sessionFileName)) {
				const transcriptPath = join(sessionDir, sessionFileName);
				const projectPath = await decodeProjectPath(projectDir);
				return {
					transcriptPath,
					projectPath,
					sessionDir,
					sessionId,
				};
			}

			// Check for pi session directory (UUID dir with subagents/)
			if (files.includes(sessionId)) {
				const piDir = join(sessionDir, sessionId);
				if (await isPiSessionDir(piDir)) {
					const projectPath = await decodeProjectPath(projectDir);
					return {
						transcriptPath: piDir,
						projectPath,
						sessionDir,
						sessionId,
					};
				}
			}
		} catch {}
	}

	// Search pi v3 sessions: ~/.pi/agent/sessions/
	const v3Dir = getV3SessionsDir();
	try {
		const v3ProjectDirs = await readdir(v3Dir);
		for (const projectDir of v3ProjectDirs) {
			const projectSessionDir = join(v3Dir, projectDir);
			try {
				const files = await readdir(projectSessionDir);
				const match = files.find(
					(f) => f.endsWith(".jsonl") && f.includes(`_${sessionId}.jsonl`),
				);
				if (match) {
					const transcriptPath = join(projectSessionDir, match);
					const firstLine = (await readJsonlFirstLine(transcriptPath)) as {
						cwd?: string;
					} | null;
					const projectPath = firstLine?.cwd ?? "";
					return {
						transcriptPath,
						projectPath,
						sessionDir: projectSessionDir,
						sessionId,
					};
				}
			} catch {}
		}
	} catch {}

	throw new Error(`Session not found: ${sessionId}`);
}

function validateNotSubagent(filename: string): void {
	if (filename.startsWith("agent-") && filename.endsWith(".jsonl")) {
		throw new Error(
			"This is a subagent file, not a main session. Please provide the main session ID or path.",
		);
	}
}
