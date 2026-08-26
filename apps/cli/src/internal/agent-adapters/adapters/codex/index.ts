import { createReadStream } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { MissingTranscriptTimestampError } from "../../errors.js";
import type {
	AgentAdapter,
	FileBackedUploadRequest,
	ScannedProject,
	SessionFile,
	SessionTimestamps,
	UploadContext,
} from "../../types.js";
import {
	readJsonlFirstLine,
	toDisplayPath,
	walkJsonlFiles,
} from "../../utils.js";
import {
	CONFIG_PATH,
	installHook,
	isHookInstalled,
	removeHook,
} from "./config.js";

const SESSIONS_BASE_DIR = join(homedir(), ".codex", "sessions");

async function transcriptHasTimestamp(path: string): Promise<boolean> {
	const input = createReadStream(path, {
		encoding: "utf8",
		highWaterMark: 64 * 1024,
	});
	const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
	try {
		for await (const line of lines) {
			if (!line) continue;
			let entry: unknown;
			try {
				entry = JSON.parse(line);
			} catch {
				continue;
			}
			if (
				isRecord(entry) &&
				typeof entry.timestamp === "string" &&
				Number.isFinite(Date.parse(entry.timestamp))
			) {
				return true;
			}
		}
		return false;
	} finally {
		lines.close();
		input.destroy();
	}
}

// ── Exported utilities ──

export interface CodexSessionMeta {
	id: string;
	cwd: string;
	gitBranch?: string;
	gitSha?: string;
}

export async function readCodexSessionMeta(
	filePath: string,
): Promise<CodexSessionMeta | null> {
	const parsed = (await readJsonlFirstLine(filePath)) as {
		type?: string;
		payload?: {
			id?: string;
			cwd?: string;
			git?: { branch?: string; sha?: string };
		};
	} | null;

	if (parsed?.type !== "session_meta" || !parsed.payload) {
		return null;
	}

	return {
		id:
			parsed.payload.id ??
			filePath
				.split("/")
				.pop()
				?.replace(/\.jsonl$/, "") ??
			"",
		cwd: parsed.payload.cwd ?? "",
		gitBranch: parsed.payload.git?.branch,
		gitSha: parsed.payload.git?.sha,
	};
}

export async function findActiveRolloutFile(
	threadId: string,
): Promise<string | null> {
	const files = await walkJsonlFiles(SESSIONS_BASE_DIR);

	for (const filePath of files) {
		const meta = await readCodexSessionMeta(filePath);
		if (meta?.id === threadId) {
			return filePath;
		}
	}

	return null;
}

// ── Adapter ──

class CodexAdapter implements AgentAdapter {
	name = "OpenAI Codex";
	source = "codex" as const;

	getSessionsBaseDir(): string {
		return SESSIONS_BASE_DIR;
	}

	async findProjectSessions(projectPath: string): Promise<SessionFile[]> {
		const sessions: SessionFile[] = [];

		try {
			const files = await walkJsonlFiles(SESSIONS_BASE_DIR);
			for (const filePath of files) {
				const meta = await readCodexSessionMeta(filePath);
				if (meta?.cwd === projectPath) {
					sessions.push({
						sessionId: meta.id,
						transcriptPath: filePath,
						projectPath,
						gitBranch: meta.gitBranch,
						gitSha: meta.gitSha,
					});
				}
			}
		} catch {
			// sessions dir doesn't exist
		}

		return sessions;
	}

	async scanAllSessions(): Promise<ScannedProject[]> {
		const files = await walkJsonlFiles(SESSIONS_BASE_DIR);
		const projectMap = new Map<string, SessionFile[]>();

		for (const filePath of files) {
			const meta = await readCodexSessionMeta(filePath);
			if (!meta?.cwd) continue;

			const sessions = projectMap.get(meta.cwd) ?? [];
			sessions.push({
				sessionId: meta.id,
				transcriptPath: filePath,
				projectPath: meta.cwd,
				gitBranch: meta.gitBranch,
				gitSha: meta.gitSha,
			});
			projectMap.set(meta.cwd, sessions);
		}

		const projects: ScannedProject[] = [];
		for (const [projectPath, sessions] of projectMap) {
			projects.push({
				source: this.source,
				projectPath,
				displayPath: toDisplayPath(projectPath),
				sessions,
				sessionCount: sessions.length,
			});
		}

		return projects.sort((a, b) => a.displayPath.localeCompare(b.displayPath));
	}

	getHookConfigPath(): string {
		return CONFIG_PATH;
	}

	installHook(): void {
		installHook();
	}

	removeHook(): void {
		removeHook();
	}

	isHookInstalled(): boolean {
		return isHookInstalled();
	}

	async buildUploadRequest(
		session: SessionFile,
		context: UploadContext,
	): Promise<FileBackedUploadRequest> {
		if (!(await transcriptHasTimestamp(session.transcriptPath))) {
			throw new MissingTranscriptTimestampError(this.source);
		}

		return {
			kind: "file",
			metadata: {
				source: this.source,
				sessionId: session.sessionId,
				projectPath: session.projectPath,
				gitRemote: context.gitInfo.gitRemote,
				packageName: context.gitInfo.packageName,
				packageType: context.gitInfo.packageType,
				gitBranch: session.gitBranch ?? context.gitInfo.branch,
				gitSha: session.gitSha ?? context.gitInfo.sha,
				tag: context.tag,
				organizationId: context.organizationId,
				upload_mode: context.uploadMode,
			},
			subagents: [],
			transcriptPath: session.transcriptPath,
		};
	}

	extractTimestamps(content: string): SessionTimestamps | null {
		let min: string | null = null;
		let max: string | null = null;
		let minTime = Number.POSITIVE_INFINITY;
		let maxTime = Number.NEGATIVE_INFINITY;

		for (const line of content.split("\n")) {
			if (!line) continue;
			let parsed: unknown;
			try {
				parsed = JSON.parse(line);
			} catch {
				continue;
			}
			if (!isRecord(parsed) || typeof parsed.timestamp !== "string") continue;
			const timestampTime = Date.parse(parsed.timestamp);
			if (!Number.isFinite(timestampTime)) continue;

			const timestamp = new Date(timestampTime).toISOString();
			if (timestampTime < minTime) {
				min = timestamp;
				minTime = timestampTime;
			}
			if (timestampTime > maxTime) {
				max = timestamp;
				maxTime = timestampTime;
			}
		}

		if (!min || !max) return null;

		return { sessionDate: min, lastInteractionDate: max };
	}
}

export const codexAdapter = new CodexAdapter();

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
