import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { IngestSessionInput } from "@rudel/api-routes";
import {
	type Ingestor,
	ingestRudelCodexSessions,
	type RudelCodexSessionsRow,
} from "@rudel/ch-schema/generated";
import type {
	AgentAdapter,
	IngestContext,
	ScannedProject,
	SessionFile,
	UploadContext,
} from "../../types.js";
import {
	readJsonlFirstLine,
	toClickHouseDateTime,
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

	if (!parsed || parsed.type !== "session_meta" || !parsed.payload) {
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
	rawTableName = "rudel.codex_sessions";

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
			if (!meta || !meta.cwd) continue;

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
	): Promise<IngestSessionInput> {
		const content = await readFile(session.transcriptPath, "utf-8");

		return {
			source: this.source,
			sessionId: session.sessionId,
			projectPath: session.projectPath,
			gitRemote: context.gitInfo.gitRemote,
			packageName: context.gitInfo.packageName,
			packageType: context.gitInfo.packageType,
			gitBranch: session.gitBranch ?? context.gitInfo.branch,
			gitSha: session.gitSha ?? context.gitInfo.sha,
			tag: context.tag,
			content,
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
			let parsed: { timestamp?: string };
			try {
				parsed = JSON.parse(line);
			} catch {
				continue;
			}
			if (parsed.timestamp) {
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
		await ingestRudelCodexSessions(ingestor, [row]);
	}

	private buildRow(
		input: IngestSessionInput,
		context: IngestContext,
	): RudelCodexSessionsRow {
		const now = new Date().toISOString().replace("Z", "");

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
			ingested_at: now,
			user_id: context.userId,
			git_branch: input.gitBranch ?? null,
			git_sha: input.gitSha ?? null,
			tag: input.tag ?? null,
		};
	}
}

export const codexAdapter = new CodexAdapter();
