import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	extractAgentIds,
	readFileWithRetry,
	readSubagentFiles,
} from "@rudel/agent-adapters";
import { getGitInfo } from "../lib/git-info.js";
import { resolveSession } from "../lib/session-resolver.js";

// Sample JSONL content mimicking a real Claude session
const SAMPLE_SESSION_CONTENT = [
	JSON.stringify({ type: "summary", sessionId: "test-session-1" }),
	JSON.stringify({
		type: "message",
		role: "human",
		content: "Hello, help me fix a bug",
	}),
	JSON.stringify({
		type: "message",
		role: "assistant",
		content: "Sure, let me look at the code",
	}),
	JSON.stringify({
		toolUseResult: { agentId: "sub-agent-001", result: "done" },
	}),
	JSON.stringify({
		toolUseResult: { agentId: "sub-agent-002", result: "done" },
	}),
].join("\n");

const SAMPLE_SUBAGENT_CONTENT = JSON.stringify({
	type: "message",
	role: "assistant",
	content: "Subagent work done",
});

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");

function hasRealClaudeSessions(): boolean {
	if (!existsSync(CLAUDE_PROJECTS_DIR)) {
		return false;
	}
	try {
		for (const dir of readdirSync(CLAUDE_PROJECTS_DIR)) {
			try {
				const files = readdirSync(join(CLAUDE_PROJECTS_DIR, dir));
				if (
					files.some(
						(f) =>
							f.endsWith(".jsonl") &&
							!f.startsWith("agent-") &&
							f !== "sessions-index.json",
					)
				) {
					return true;
				}
			} catch {}
		}
	} catch {
		/* dir not readable */
	}
	return false;
}

const hasClaudeProjects = hasRealClaudeSessions();

let tempDir: string;

beforeAll(async () => {
	tempDir = await mkdtemp(join(homedir(), ".rudel-cli-test-"));
});

afterAll(async () => {
	await rm(tempDir, { recursive: true, force: true });
});

async function findRealSessionId(): Promise<string> {
	const sessionsBase = join(homedir(), ".claude", "projects");
	const projectDirs = await readdir(sessionsBase);

	for (const dir of projectDirs) {
		const fullDir = join(sessionsBase, dir);
		const files = await readdir(fullDir).catch(() => [] as string[]);
		const sessionFile = files.find(
			(f) =>
				f.endsWith(".jsonl") &&
				!f.startsWith("agent-") &&
				f !== "sessions-index.json",
		);
		if (sessionFile) {
			return sessionFile.replace(/\.jsonl$/, "");
		}
	}

	throw new Error("No real session found in ~/.claude/projects/");
}

describe("session resolver", () => {
	test("resolves session from a direct file path", async () => {
		const sessionId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
		const sessionFile = join(tempDir, `${sessionId}.jsonl`);
		await writeFile(sessionFile, SAMPLE_SESSION_CONTENT);

		const result = await resolveSession(sessionFile);

		expect(result.transcriptPath).toBe(sessionFile);
		expect(result.sessionId).toBe(sessionId);
		expect(result.sessionDir).toBe(tempDir);
	});

	test.skipIf(!hasClaudeProjects)(
		"resolves session by ID from ~/.claude/projects/",
		async () => {
			const realSessionId = await findRealSessionId();
			const result = await resolveSession(realSessionId);

			expect(result.sessionId).toBe(realSessionId);
			expect(result.transcriptPath).toContain(`${realSessionId}.jsonl`);
			expect(result.projectPath).toBeTruthy();
			expect(result.sessionDir).toBeTruthy();
		},
	);

	test("rejects subagent file passed as path", async () => {
		const agentFile = join(tempDir, "agent-sub123.jsonl");
		await writeFile(agentFile, "{}");

		await expect(resolveSession(agentFile)).rejects.toThrow(
			"This is a subagent file, not a main session",
		);
	});

	test("rejects subagent ID passed directly", async () => {
		await expect(resolveSession("agent-sub123")).rejects.toThrow(
			"This is a subagent file, not a main session",
		);
	});

	test("throws for nonexistent session ID", async () => {
		await expect(
			resolveSession("nonexistent-session-id-99999"),
		).rejects.toThrow("Session not found");
	});

	test("throws for nonexistent file path", async () => {
		await expect(
			resolveSession("/tmp/does-not-exist-99999.jsonl"),
		).rejects.toThrow("Session file not found");
	});
});

describe("transcript reader", () => {
	test("reads transcript and extracts subagent IDs", async () => {
		const sessionFile = join(tempDir, "transcript-test.jsonl");
		await writeFile(sessionFile, SAMPLE_SESSION_CONTENT);

		const content = await readFileWithRetry(sessionFile);
		expect(content).toBe(SAMPLE_SESSION_CONTENT);

		const agentIds = extractAgentIds(content);
		expect(agentIds).toContain("sub-agent-001");
		expect(agentIds).toContain("sub-agent-002");
		expect(agentIds).toHaveLength(2);
	});

	test("returns empty array when no subagents referenced", async () => {
		const content = [
			JSON.stringify({ type: "message", role: "human", content: "hi" }),
			JSON.stringify({
				type: "message",
				role: "assistant",
				content: "hello",
			}),
		].join("\n");

		const agentIds = extractAgentIds(content);
		expect(agentIds).toHaveLength(0);
	});

	test("handles malformed JSONL lines gracefully", async () => {
		const content = [
			"not-json",
			JSON.stringify({ toolUseResult: { agentId: "valid-agent" } }),
			"{ broken json",
		].join("\n");

		const agentIds = extractAgentIds(content);
		expect(agentIds).toEqual(["valid-agent"]);
	});
});

describe("subagent reader", () => {
	test("reads subagent files from session directory", async () => {
		const sessionDir = join(tempDir, "subagent-test");
		await mkdir(sessionDir, { recursive: true });

		// Create subagent files in legacy location
		await writeFile(
			join(sessionDir, "agent-sub-agent-001.jsonl"),
			SAMPLE_SUBAGENT_CONTENT,
		);

		const subagents = await readSubagentFiles(sessionDir, [
			"sub-agent-001",
			"sub-agent-missing",
		]);

		expect(subagents).toHaveLength(1);
		const first = subagents[0];
		expect(first).toBeDefined();
		expect(first?.agentId).toBe("sub-agent-001");
		expect(first?.content).toBe(SAMPLE_SUBAGENT_CONTENT);
	});

	test("reads subagent files from new subagents/ subdirectory", async () => {
		const sessionDir = join(tempDir, "subagent-new-test");
		const sessionId = "test-session-new";
		const subagentsDir = join(sessionDir, sessionId, "subagents");
		await mkdir(subagentsDir, { recursive: true });

		await writeFile(
			join(subagentsDir, "agent-new-agent.jsonl"),
			SAMPLE_SUBAGENT_CONTENT,
		);

		const subagents = await readSubagentFiles(
			sessionDir,
			["new-agent"],
			sessionId,
		);

		expect(subagents).toHaveLength(1);
		expect(subagents[0]?.agentId).toBe("new-agent");
	});
});

describe("git info", () => {
	test("extracts git info from current repo", async () => {
		// This test runs inside a git repo (the monorepo itself)
		const info = await getGitInfo(process.cwd());

		expect(info.branch).toBeTruthy();
		expect(info.sha).toMatch(/^[0-9a-f]{40}$/);
	});

	test("returns empty info for non-git directory", async () => {
		const info = await getGitInfo(tempDir);

		expect(info.gitRemote).toBeUndefined();
		expect(info.branch).toBeUndefined();
		expect(info.sha).toBeUndefined();
	});
});

describe("full upload pipeline (dry-run)", () => {
	test("resolves session by path, reads transcript, extracts subagents, and builds request", async () => {
		// Set up a realistic session directory
		const projectDir = join(tempDir, "pipeline-test");
		await mkdir(projectDir, { recursive: true });

		const sessionId = "pipeline-session-id";
		const sessionFile = join(projectDir, `${sessionId}.jsonl`);
		await writeFile(sessionFile, SAMPLE_SESSION_CONTENT);

		// Create one subagent file
		await writeFile(
			join(projectDir, "agent-sub-agent-001.jsonl"),
			SAMPLE_SUBAGENT_CONTENT,
		);

		// Step 1: Resolve
		const sessionInfo = await resolveSession(sessionFile);
		expect(sessionInfo.sessionId).toBe(sessionId);

		// Step 2: Read transcript
		const content = await readFileWithRetry(sessionInfo.transcriptPath);
		expect(content.length).toBeGreaterThan(0);

		// Step 3: Extract agent IDs
		const agentIds = extractAgentIds(content);
		expect(agentIds).toContain("sub-agent-001");
		expect(agentIds).toContain("sub-agent-002");

		// Step 4: Read subagent files
		const subagents = await readSubagentFiles(
			sessionInfo.sessionDir,
			agentIds,
			sessionInfo.sessionId,
		);
		expect(subagents).toHaveLength(1); // only sub-agent-001 has a file
		expect(subagents[0]?.agentId).toBe("sub-agent-001");

		// Step 5: Build the request (simulating what upload command does)
		const request = {
			sessionId: sessionInfo.sessionId,
			projectPath: sessionInfo.projectPath,
			content,
			subagents: subagents.length > 0 ? subagents : undefined,
		};

		expect(request.sessionId).toBe(sessionId);
		expect(request.content).toBe(SAMPLE_SESSION_CONTENT);
		expect(request.subagents).toHaveLength(1);
	});

	test.skipIf(!hasClaudeProjects)(
		"full CLI dry-run with real session ID",
		async () => {
			const realSessionId = await findRealSessionId();

			const cliPath = join(import.meta.dir, "..", "bin", "cli.ts");
			const proc = Bun.spawn(
				["bun", cliPath, "upload", realSessionId, "--dry-run"],
				{ stdout: "pipe", stderr: "pipe" },
			);

			const exitCode = await proc.exited;
			const stdout = await new Response(proc.stdout).text();
			const stderr = await new Response(proc.stderr).text();

			expect(exitCode).toBe(0);
			expect(stdout).toContain("Resolving session:");
			expect(stdout).toContain("Found session at:");
			expect(stdout).toContain("Dry run - would upload:");
			expect(stdout).toContain(`"sessionId": "${realSessionId}"`);
			expect(stderr).toBe("");
		},
	);

	test("full CLI dry-run with file path and subagent files", async () => {
		const projectDir = join(tempDir, "cli-path-test2");
		await mkdir(projectDir, { recursive: true });

		const sessionFile = join(projectDir, "cli-test-session.jsonl");
		await writeFile(sessionFile, SAMPLE_SESSION_CONTENT);

		// Create subagent files so they get included in the request
		await writeFile(
			join(projectDir, "agent-sub-agent-001.jsonl"),
			SAMPLE_SUBAGENT_CONTENT,
		);

		const cliPath = join(import.meta.dir, "..", "bin", "cli.ts");
		const proc = Bun.spawn(
			["bun", cliPath, "upload", sessionFile, "--dry-run"],
			{ stdout: "pipe", stderr: "pipe" },
		);

		const exitCode = await proc.exited;
		const stdout = await new Response(proc.stdout).text();

		expect(exitCode).toBe(0);
		expect(stdout).toContain("Found session at:");
		expect(stdout).toContain("Subagents: 1 file(s)");
		expect(stdout).toContain("Dry run - would upload:");
		expect(stdout).toContain('"sessionId": "cli-test-session"');
		expect(stdout).toContain('"subagents"');
	});
});
