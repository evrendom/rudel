import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { Source } from "../contracts/index.js";
import {
	decodeProjectPath,
	findActiveRolloutFile,
	readCodexSessionMeta,
} from "../internal/agent-adapters/index.js";

export const SESSIONS_BASE_DIR = join(homedir(), ".claude", "projects");

export interface SessionInfo {
	transcriptPath: string;
	projectPath: string;
	sessionDir: string;
	sessionId: string;
	source: Source;
	gitBranch?: string;
	gitSha?: string;
}

export async function resolveSession(input: string): Promise<SessionInfo> {
	const isPath = input.includes("/") || input.endsWith(".jsonl");

	if (isPath) {
		return resolveFromPath(input);
	}
	return resolveFromId(input);
}

async function resolveFromPath(filePath: string): Promise<SessionInfo> {
	const filename = basename(filePath);
	validateNotSubagent(filename);

	try {
		await access(filePath);
	} catch {
		throw new Error(`Session file not found: ${filePath}`);
	}

	const sessionId = filename.replace(/\.jsonl$/, "");
	const sessionDir = dirname(filePath);
	const codexMeta = await readCodexSessionMeta(filePath);
	if (codexMeta) {
		return {
			transcriptPath: filePath,
			projectPath: codexMeta.cwd,
			sessionDir,
			sessionId: codexMeta.id,
			source: "codex",
			gitBranch: codexMeta.gitBranch,
			gitSha: codexMeta.gitSha,
		};
	}

	// Walk up from sessionDir to find the project directory name
	// Sessions live at: ~/.claude/projects/<encoded-project-dir>/<sessionId>.jsonl
	const parentDir = basename(sessionDir);
	const projectPath = await decodeProjectPath(parentDir);

	return {
		transcriptPath: filePath,
		projectPath,
		sessionDir,
		sessionId,
		source: "claude_code",
	};
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
			if (files.includes(sessionFileName)) {
				const transcriptPath = join(sessionDir, sessionFileName);
				const projectPath = await decodeProjectPath(projectDir);
				return {
					transcriptPath,
					projectPath,
					sessionDir,
					sessionId,
					source: "claude_code",
				};
			}
		} catch {}
	}

	const codexTranscriptPath = await findActiveRolloutFile(sessionId);
	if (codexTranscriptPath) {
		return resolveFromPath(codexTranscriptPath);
	}

	throw new Error(`Session not found: ${sessionId}`);
}

function validateNotSubagent(filename: string): void {
	if (filename.startsWith("agent-") && filename.endsWith(".jsonl")) {
		throw new Error(
			"This is a subagent file, not a main session. Please provide the main session ID or path.",
		);
	}
}
