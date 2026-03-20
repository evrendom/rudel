import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { IngestSessionInput } from "@rudel/api-routes";
import {
	type Ingestor,
	ingestRudelPiSessions,
	type RudelPiSessionsRow,
} from "@rudel/ch-schema/generated";
import type {
	AgentAdapter,
	IngestContext,
	ScannedProject,
	SessionFile,
	UploadContext,
} from "../../types.js";
import {
	readFileWithRetry,
	readJsonlFirstLine,
	toClickHouseDateTime,
	toDisplayPath,
} from "../../utils.js";
import { decodeProjectPath } from "../claude-code/index.js";

// v2: subagent-only sessions stored inside Claude Code's project dirs
const V2_SESSIONS_DIR = join(homedir(), ".claude", "projects");

// v3: pi's own session storage
const V3_SESSIONS_DIR = join(homedir(), ".pi", "agent", "sessions");

// UUID v4 pattern: 8-4-4-4-12 hex chars
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Exported utilities ──

/** Check if a directory is a pi v2 session (UUID dir with subagents/agent-*.jsonl). */
export async function isPiSessionDir(dirPath: string): Promise<boolean> {
	try {
		const subagentsDir = join(dirPath, "subagents");
		const s = await stat(subagentsDir);
		if (!s.isDirectory()) return false;
		const files = await readdir(subagentsDir);
		return files.some((f) => f.startsWith("agent-") && f.endsWith(".jsonl"));
	} catch {
		return false;
	}
}

/** Check if a path is any pi session (v2 dir or v3 file). */
export async function isPiSession(transcriptPath: string): Promise<boolean> {
	if (await isPiSessionDir(transcriptPath)) return true;
	// v3: file under ~/.pi/agent/sessions/
	return transcriptPath.startsWith(V3_SESSIONS_DIR);
}

export async function readPiSubagentFiles(
	sessionDir: string,
): Promise<Array<{ agentId: string; content: string }>> {
	const subagentsDir = join(sessionDir, "subagents");
	const files = await readdir(subagentsDir);
	const agentFiles = files
		.filter((f) => f.startsWith("agent-") && f.endsWith(".jsonl"))
		.sort();

	const subagents: Array<{ agentId: string; content: string }> = [];
	for (const file of agentFiles) {
		const agentId = file.replace(/^agent-/, "").replace(/\.jsonl$/, "");
		const content = await readFileWithRetry(join(subagentsDir, file));
		subagents.push({ agentId, content });
	}
	return subagents;
}

/** Extract session ID from a v3 filename: `<timestamp>_<uuid>.jsonl` → uuid */
function extractV3SessionId(filename: string): string | null {
	const base = filename.replace(/\.jsonl$/, "");
	const underscoreIdx = base.indexOf("_");
	if (underscoreIdx === -1) return null;
	const uuid = base.slice(underscoreIdx + 1);
	return UUID_PATTERN.test(uuid) ? uuid : null;
}

/** Encode a project path for v3 dir lookup: /Users/x/Code/y → --Users-x-Code-y-- */
function encodeV3ProjectPath(projectPath: string): string {
	return `--${projectPath.replace(/^\//, "").replace(/[/\\:]/g, "-")}--`;
}

/** Return the v3 sessions base dir. Exported for session resolver. */
export function getV3SessionsDir(): string {
	return V3_SESSIONS_DIR;
}

// ── Adapter ──

class PiAdapter implements AgentAdapter {
	name = "Pi";
	source = "pi" as const;
	rawTableName = "rudel.pi_sessions";

	getSessionsBaseDir(): string {
		return V3_SESSIONS_DIR;
	}

	async findProjectSessions(projectPath: string): Promise<SessionFile[]> {
		// v2: search ~/.claude/projects/
		const v2Encoded = projectPath.replace(/\//g, "-");
		const v2Dir = join(V2_SESSIONS_DIR, v2Encoded);
		const v2Sessions = await this.listV2Sessions(v2Dir, projectPath);

		// v3: search ~/.pi/agent/sessions/
		const v3Encoded = encodeV3ProjectPath(projectPath);
		const v3Dir = join(V3_SESSIONS_DIR, v3Encoded);
		const v3Sessions = await this.listV3Sessions(v3Dir);

		return [...v2Sessions, ...v3Sessions];
	}

	async scanAllSessions(): Promise<ScannedProject[]> {
		const projectMap = new Map<
			string,
			{ displayPath: string; sessions: SessionFile[] }
		>();

		const addSessions = (
			projectPath: string,
			displayPath: string,
			sessions: SessionFile[],
		) => {
			const existing = projectMap.get(projectPath);
			if (existing) {
				existing.sessions.push(...sessions);
			} else {
				projectMap.set(projectPath, { displayPath, sessions });
			}
		};

		// Scan v2 sessions from ~/.claude/projects/
		try {
			const v2Dirs = await readdir(V2_SESSIONS_DIR);
			for (const dir of v2Dirs) {
				const projectDir = join(V2_SESSIONS_DIR, dir);
				const decodedPath = await decodeProjectPath(dir);
				const sessions = await this.listV2Sessions(projectDir, decodedPath);
				if (sessions.length > 0) {
					addSessions(decodedPath, toDisplayPath(decodedPath), sessions);
				}
			}
		} catch {
			// v2 dir doesn't exist
		}

		// Scan v3 sessions from ~/.pi/agent/sessions/
		try {
			const v3Dirs = await readdir(V3_SESSIONS_DIR);
			for (const dir of v3Dirs) {
				const v3ProjectDir = join(V3_SESSIONS_DIR, dir);
				const sessions = await this.listV3Sessions(v3ProjectDir);
				if (sessions.length > 0) {
					// projectPath comes from the session files themselves (cwd field)
					const projectPath = sessions[0]?.projectPath ?? "";
					if (projectPath) {
						addSessions(projectPath, toDisplayPath(projectPath), sessions);
					}
				}
			}
		} catch {
			// v3 dir doesn't exist
		}

		const projects: ScannedProject[] = [];
		for (const [projectPath, { displayPath, sessions }] of projectMap) {
			projects.push({
				source: this.source,
				projectPath,
				displayPath,
				sessions,
				sessionCount: sessions.length,
			});
		}

		return projects;
	}

	// Pi has no hook system — no-ops
	getHookConfigPath(): string {
		return "";
	}
	installHook(): void {}
	removeHook(): void {}
	isHookInstalled(): boolean {
		return false;
	}

	async buildUploadRequest(
		session: SessionFile,
		context: UploadContext,
	): Promise<IngestSessionInput> {
		let content: string;
		let subagents: Array<{ agentId: string; content: string }> | undefined;
		let version: number;

		try {
			const s = await stat(session.transcriptPath);
			if (s.isDirectory()) {
				// v2: directory with subagents/ — store raw (already Claude Code JSONL)
				version = 2;
				const agentFiles = await readPiSubagentFiles(session.transcriptPath);
				content = agentFiles.map((a) => a.content).join("\n");
				subagents = agentFiles.length > 0 ? agentFiles : undefined;
			} else {
				// v3: single .jsonl file — store raw (native Pi format)
				version = 3;
				content = await readFileWithRetry(session.transcriptPath);
			}
		} catch {
			content = "";
			version = 0;
		}

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
			subagents,
			organizationId: context.organizationId,
			version,
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
			// Accept any line with a timestamp — works for both v2 and v3 raw formats
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
		await ingestRudelPiSessions(ingestor, [row]);
	}

	private buildRow(
		input: IngestSessionInput,
		context: IngestContext,
	): RudelPiSessionsRow {
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
			version: input.version ?? 0,
		};
	}

	/** List pi v2 sessions: UUID directories with subagents/ */
	private async listV2Sessions(
		projectDir: string,
		projectPath: string,
	): Promise<SessionFile[]> {
		let entries: string[];
		try {
			entries = await readdir(projectDir);
		} catch {
			return [];
		}

		const sessions: SessionFile[] = [];
		for (const entry of entries) {
			if (!UUID_PATTERN.test(entry)) continue;

			const entryPath = join(projectDir, entry);
			if (await isPiSessionDir(entryPath)) {
				sessions.push({
					sessionId: entry,
					transcriptPath: entryPath,
					projectPath,
				});
			}
		}

		return sessions;
	}

	/** List pi v3 sessions: .jsonl files with session header containing cwd */
	private async listV3Sessions(v3ProjectDir: string): Promise<SessionFile[]> {
		let entries: string[];
		try {
			entries = await readdir(v3ProjectDir);
		} catch {
			return [];
		}

		const sessions: SessionFile[] = [];
		for (const entry of entries) {
			if (!entry.endsWith(".jsonl")) continue;

			const sessionId = extractV3SessionId(entry);
			if (!sessionId) continue;

			const filePath = join(v3ProjectDir, entry);

			// Read first line to get cwd (authoritative project path)
			const firstLine = (await readJsonlFirstLine(filePath)) as {
				type?: string;
				cwd?: string;
			} | null;
			const projectPath = firstLine?.cwd ?? "";
			if (!projectPath) continue;

			sessions.push({
				sessionId,
				transcriptPath: filePath,
				projectPath,
			});
		}

		return sessions;
	}
}

export const piAdapter = new PiAdapter();
