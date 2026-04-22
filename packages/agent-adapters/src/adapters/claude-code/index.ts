import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { IngestSessionInput } from "@rudel/api-routes";
import {
	type Ingestor,
	ingestRudelClaudeSessions,
	type RudelClaudeSessionsRow,
} from "@rudel/ch-schema/generated";
import type {
	AgentAdapter,
	IngestContext,
	ScannedProject,
	SessionFile,
	UploadContext,
} from "../../types";
import {
	readFileWithRetry,
	toClickHouseDateTime,
	toDisplayPath,
} from "../../utils";
import {
	addHook,
	getClaudeSettingsPath,
	isHookEnabled,
	removeHook,
} from "./settings";

const SESSIONS_BASE_DIR = join(homedir(), ".claude", "projects");

// ── Exported utilities ──

export function encodeProjectPath(projectPath: string): string {
	return projectPath.replace(/\//g, "-");
}

export async function decodeProjectPath(encodedDir: string): Promise<string> {
	const parts = encodedDir.replace(/^-/, "").split("-");

	async function findPath(
		partIndex: number,
		currentPath: string,
	): Promise<string | null> {
		if (partIndex >= parts.length) {
			try {
				await stat(currentPath);
				return currentPath;
			} catch {
				return null;
			}
		}

		for (let endIndex = parts.length; endIndex > partIndex; endIndex--) {
			const segment = parts.slice(partIndex, endIndex).join("-");
			const testPath = currentPath
				? `${currentPath}/${segment}`
				: `/${segment}`;

			try {
				await stat(testPath);
				if (endIndex === parts.length) {
					return testPath;
				}
				const result = await findPath(endIndex, testPath);
				if (result) {
					return result;
				}
			} catch {
				// Path doesn't exist, try shorter segment
			}
		}

		return null;
	}

	const result = await findPath(0, "");
	if (result) {
		return result;
	}

	return `/${parts.join("/")}`;
}

export function extractAgentIds(sessionContent: string): string[] {
	const agentIds = new Set<string>();

	for (const line of sessionContent.split("\n")) {
		if (!line.trim()) continue;

		try {
			const entry = JSON.parse(line);
			if (entry.toolUseResult?.agentId) {
				agentIds.add(entry.toolUseResult.agentId);
			}
		} catch {
			// Skip malformed lines
		}
	}

	return Array.from(agentIds);
}

interface SubagentFile {
	agentId: string;
	content: string;
}

export async function readSubagentFiles(
	sessionDir: string,
	agentIds: string[],
	sessionId?: string,
): Promise<SubagentFile[]> {
	const subagents: SubagentFile[] = [];

	for (const agentId of agentIds) {
		const possiblePaths = [
			join(sessionDir, `agent-${agentId}.jsonl`),
			...(sessionId
				? [join(sessionDir, sessionId, "subagents", `agent-${agentId}.jsonl`)]
				: []),
		];

		for (const agentPath of possiblePaths) {
			try {
				const content = await readFile(agentPath, "utf-8");
				subagents.push({ agentId, content });
				break;
			} catch {
				// Try next path
			}
		}
	}

	return subagents;
}

// ── Adapter ──

class ClaudeCodeAdapter implements AgentAdapter {
	name = "Claude Code";
	source = "claude_code" as const;
	rawTableName = "rudel.claude_sessions";

	getSessionsBaseDir(): string {
		return SESSIONS_BASE_DIR;
	}

	async findProjectSessions(projectPath: string): Promise<SessionFile[]> {
		const encoded = encodeProjectPath(projectPath);
		const sessionDir = join(SESSIONS_BASE_DIR, encoded);

		const files = await this.listSessionFiles(sessionDir, projectPath);
		if (files.length > 0) return files;

		return this.findByDecoding(projectPath);
	}

	async scanAllSessions(): Promise<ScannedProject[]> {
		let projectDirs: string[];
		try {
			projectDirs = await readdir(SESSIONS_BASE_DIR);
		} catch {
			return [];
		}

		const projects: ScannedProject[] = [];

		for (const dir of projectDirs) {
			const sessionDir = `${SESSIONS_BASE_DIR}/${dir}`;
			let files: string[];
			try {
				files = await readdir(sessionDir);
			} catch {
				continue;
			}

			const sessionFiles = files.filter(
				(f) => f.endsWith(".jsonl") && !f.startsWith("agent-"),
			);

			if (sessionFiles.length === 0) continue;

			const decodedPath = await decodeProjectPath(dir);

			const sessions: SessionFile[] = sessionFiles.map((f) => ({
				sessionId: f.replace(/\.jsonl$/, ""),
				transcriptPath: join(sessionDir, f),
				projectPath: decodedPath,
			}));

			projects.push({
				source: this.source,
				projectPath: decodedPath,
				displayPath: toDisplayPath(decodedPath),
				sessions,
				sessionCount: sessions.length,
			});
		}

		return projects;
	}

	getHookConfigPath(): string {
		return getClaudeSettingsPath();
	}

	installHook(): void {
		addHook();
	}

	removeHook(): void {
		removeHook();
	}

	isHookInstalled(): boolean {
		return isHookEnabled();
	}

	async buildUploadRequest(
		session: SessionFile,
		context: UploadContext,
	): Promise<IngestSessionInput> {
		const content = await readFileWithRetry(session.transcriptPath);

		const agentIds = extractAgentIds(content);
		const sessionDir = dirname(session.transcriptPath);
		const subagents =
			agentIds.length > 0
				? await readSubagentFiles(sessionDir, agentIds, session.sessionId)
				: [];

		return {
			source: this.source,
			sessionId: session.sessionId,
			projectPath: session.projectPath,
			gitRemote: context.gitInfo.gitRemote,
			packageName: context.gitInfo.packageName,
			packageType: context.gitInfo.packageType,
			gitBranch: context.gitInfo.branch,
			gitSha: context.gitInfo.sha,
			tag: context.tag,
			content,
			subagents: subagents.length > 0 ? subagents : undefined,
			organizationId: context.organizationId,
		};
	}

	extractTimestamps(content: string): {
		sessionDate: string;
		lastInteractionDate: string;
	} | null {
		let min: string | null = null;
		let max: string | null = null;

		for (const line of content.split("\n")) {
			if (!line) continue;
			let parsed: { type?: string; timestamp?: string };
			try {
				parsed = JSON.parse(line);
			} catch {
				continue;
			}
			if (
				(parsed.type === "user" || parsed.type === "assistant") &&
				parsed.timestamp
			) {
				const ts = parsed.timestamp;
				if (!min || ts < min) min = ts;
				if (!max || ts > max) max = ts;
			}
		}

		if (!min || !max) return null;

		return { sessionDate: min, lastInteractionDate: max };
	}

	async ingest(
		ingestor: Ingestor,
		input: IngestSessionInput,
		context: IngestContext,
	): Promise<void> {
		const row = this.buildRow(input, context);
		await ingestRudelClaudeSessions(ingestor, [row]);
	}

	private buildRow(
		input: IngestSessionInput,
		context: IngestContext,
	): RudelClaudeSessionsRow {
		const now = new Date().toISOString().replace("Z", "");

		const subagents: Record<string, string> = {};
		if (input.subagents) {
			for (const sub of input.subagents) {
				subagents[sub.agentId] = sub.content;
			}
		}

		const timestamps = this.extractTimestamps(input.content);

		return {
			session_date: timestamps
				? toClickHouseDateTime(timestamps.sessionDate)
				: now,
			last_interaction_date: timestamps
				? toClickHouseDateTime(timestamps.lastInteractionDate)
				: now,
			session_id: input.sessionId,
			organization_id: context.organizationId,
			project_path: input.projectPath,
			git_remote: input.gitRemote ?? "",
			package_name: input.packageName ?? "",
			package_type: input.packageType ?? "",
			content: input.content,
			subagents,
			ingested_at: now,
			user_id: context.userId,
			git_branch: input.gitBranch ?? null,
			git_sha: input.gitSha ?? null,
			tag: input.tag ?? null,
		};
	}

	private async listSessionFiles(
		sessionDir: string,
		projectPath: string,
	): Promise<SessionFile[]> {
		try {
			const entries = await readdir(sessionDir);
			return entries
				.filter((f) => f.endsWith(".jsonl") && !f.startsWith("agent-"))
				.map((f) => ({
					sessionId: f.replace(/\.jsonl$/, ""),
					transcriptPath: join(sessionDir, f),
					projectPath,
				}));
		} catch {
			return [];
		}
	}

	private async findByDecoding(projectPath: string): Promise<SessionFile[]> {
		let projectDirs: string[];
		try {
			projectDirs = await readdir(SESSIONS_BASE_DIR);
		} catch {
			return [];
		}

		for (const dir of projectDirs) {
			try {
				const decoded = await decodeProjectPath(dir);
				if (decoded === projectPath) {
					const sessionDir = join(SESSIONS_BASE_DIR, dir);
					return this.listSessionFiles(sessionDir, projectPath);
				}
			} catch {
				// skip undecodable dirs
			}
		}

		return [];
	}
}

export const claudeCodeAdapter = new ClaudeCodeAdapter();
