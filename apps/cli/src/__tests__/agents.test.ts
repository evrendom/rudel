import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	claudeCodeAdapter,
	getAvailableAdapters,
	isPiSession,
	isPiSessionDir,
	piAdapter,
} from "@rudel/agent-adapters";

const SAMPLE_SESSION = [
	JSON.stringify({ type: "summary", sessionId: "test-1" }),
	JSON.stringify({ type: "message", role: "human", content: "hello" }),
].join("\n");

const PI_SESSION_UUID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

const SAMPLE_SUBAGENT_A = [
	JSON.stringify({
		type: "user",
		agentId: "a111111",
		sessionId: PI_SESSION_UUID,
		message: { role: "user", content: "explore the codebase" },
		timestamp: "2026-01-15T10:00:00.000Z",
	}),
	JSON.stringify({
		type: "assistant",
		agentId: "a111111",
		sessionId: PI_SESSION_UUID,
		message: {
			role: "assistant",
			model: "claude-sonnet-4-20250514",
			content: [{ type: "text", text: "I'll explore the codebase." }],
			usage: { input_tokens: 100, output_tokens: 50 },
		},
		timestamp: "2026-01-15T10:00:05.000Z",
	}),
].join("\n");

const SAMPLE_SUBAGENT_B = [
	JSON.stringify({
		type: "user",
		agentId: "a222222",
		sessionId: PI_SESSION_UUID,
		message: { role: "user", content: "write the tests" },
		timestamp: "2026-01-15T10:01:00.000Z",
	}),
	JSON.stringify({
		type: "assistant",
		agentId: "a222222",
		sessionId: PI_SESSION_UUID,
		message: {
			role: "assistant",
			model: "claude-sonnet-4-20250514",
			content: [{ type: "text", text: "I'll write the tests." }],
			usage: { input_tokens: 200, output_tokens: 80 },
		},
		timestamp: "2026-01-15T10:01:10.000Z",
	}),
].join("\n");

const V3_SESSION_UUID = "b1c2d3e4-f5a6-7890-abcd-ef1234567890";

const SAMPLE_V3_SESSION = [
	JSON.stringify({
		type: "session",
		version: 3,
		id: V3_SESSION_UUID,
		timestamp: "2026-03-10T10:00:00.000Z",
		cwd: "", // Will be set dynamically in beforeAll
	}),
	JSON.stringify({
		type: "thinking_level_change",
		id: "tl1",
		parentId: null,
		timestamp: "2026-03-10T10:00:00.000Z",
		thinkingLevel: "high",
	}),
	JSON.stringify({
		type: "message",
		id: "m1",
		parentId: "tl1",
		timestamp: "2026-03-10T10:00:05.000Z",
		message: {
			role: "user",
			content: [{ type: "text", text: "fix the bug" }],
		},
	}),
	JSON.stringify({
		type: "message",
		id: "m2",
		parentId: "m1",
		timestamp: "2026-03-10T10:00:15.000Z",
		message: {
			role: "assistant",
			content: [{ type: "text", text: "I'll fix the bug." }],
			api: "anthropic",
			provider: "anthropic",
			model: "claude-sonnet-4-20250514",
			usage: {
				input: 150,
				output: 75,
				cacheRead: 1000,
				cacheWrite: 200,
				totalTokens: 1425,
				cost: { total: 0.005 },
			},
			stopReason: "end_turn",
			timestamp: 1741608015000,
		},
	}),
	JSON.stringify({
		type: "message",
		id: "m3",
		parentId: "m2",
		timestamp: "2026-03-10T10:00:16.000Z",
		message: {
			role: "toolResult",
			toolCallId: "t1",
			toolName: "bash",
			content: [{ type: "text", text: "done" }],
		},
	}),
	JSON.stringify({
		type: "compaction",
		id: "c1",
		parentId: "m3",
		timestamp: "2026-03-10T10:00:20.000Z",
		summary: "Fixed the bug",
		firstKeptEntryId: "m1",
		tokensBefore: 1000,
	}),
].join("\n");

// Use a unique temp project path that we control
const TEST_PROJECT_PATH = join(
	homedir(),
	`.rudel-agent-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
);

// Claude Code encodes /path/to/project → -path-to-project
const ENCODED_PROJECT = TEST_PROJECT_PATH.replace(/\//g, "-");
const SESSIONS_BASE = join(homedir(), ".claude", "projects");
const SESSION_DIR = join(SESSIONS_BASE, ENCODED_PROJECT);

// Pi v3 session dir
const V3_SESSIONS_BASE = join(homedir(), ".pi", "agent", "sessions");
const V3_ENCODED_PROJECT = `--${TEST_PROJECT_PATH.replace(/^\//, "").replace(/\//g, "-")}--`;
const V3_SESSION_DIR = join(V3_SESSIONS_BASE, V3_ENCODED_PROJECT);
const V3_SESSION_FILE = join(
	V3_SESSION_DIR,
	`2026-03-10T10-00-00-000Z_${V3_SESSION_UUID}.jsonl`,
);

beforeAll(async () => {
	// Create the fake project directory (so decodeProjectPath can verify it exists)
	await mkdir(TEST_PROJECT_PATH, { recursive: true });

	// Create session directory in ~/.claude/projects/
	await mkdir(SESSION_DIR, { recursive: true });

	// Write test session files
	await writeFile(join(SESSION_DIR, "session-aaa.jsonl"), SAMPLE_SESSION);
	await writeFile(join(SESSION_DIR, "session-bbb.jsonl"), SAMPLE_SESSION);
	// Subagent file — should be excluded
	await writeFile(join(SESSION_DIR, "agent-sub-001.jsonl"), "{}");
	// Non-jsonl file — should be excluded
	await writeFile(join(SESSION_DIR, "notes.txt"), "not a session");

	// Pi v2 session directory: UUID dir with subagents/
	const piSubagentsDir = join(SESSION_DIR, PI_SESSION_UUID, "subagents");
	await mkdir(piSubagentsDir, { recursive: true });
	await writeFile(
		join(piSubagentsDir, "agent-a111111.jsonl"),
		SAMPLE_SUBAGENT_A,
	);
	await writeFile(
		join(piSubagentsDir, "agent-a222222.jsonl"),
		SAMPLE_SUBAGENT_B,
	);

	// Pi v3 session file
	await mkdir(V3_SESSION_DIR, { recursive: true });
	// Rewrite session header with actual TEST_PROJECT_PATH as cwd
	const v3Content = SAMPLE_V3_SESSION.replace(
		/"cwd":""/,
		`"cwd":"${TEST_PROJECT_PATH}"`,
	);
	await writeFile(V3_SESSION_FILE, v3Content);
});

afterAll(async () => {
	await rm(SESSION_DIR, { recursive: true, force: true });
	await rm(TEST_PROJECT_PATH, { recursive: true, force: true });
	await rm(V3_SESSION_DIR, { recursive: true, force: true });
});

describe("claudeCodeAdapter", () => {
	test("name is Claude Code", () => {
		expect(claudeCodeAdapter.name).toBe("Claude Code");
	});

	test("source is claude_code", () => {
		expect(claudeCodeAdapter.source).toBe("claude_code");
	});

	test("getSessionsBaseDir returns ~/.claude/projects", () => {
		expect(claudeCodeAdapter.getSessionsBaseDir()).toBe(SESSIONS_BASE);
	});

	test("findProjectSessions returns session files excluding subagents", async () => {
		const sessions =
			await claudeCodeAdapter.findProjectSessions(TEST_PROJECT_PATH);

		expect(sessions).toHaveLength(2);

		const ids = sessions.map((s) => s.sessionId).sort();
		expect(ids).toEqual(["session-aaa", "session-bbb"]);

		for (const session of sessions) {
			expect(session.projectPath).toBe(TEST_PROJECT_PATH);
			expect(session.transcriptPath).toEndWith(".jsonl");
			// Verify the filename (not full path) doesn't start with agent-
			const filename = session.transcriptPath.split("/").pop() ?? "";
			expect(filename.startsWith("agent-")).toBe(false);
		}
	});

	test("findProjectSessions returns empty array for nonexistent project", async () => {
		const sessions = await claudeCodeAdapter.findProjectSessions(
			"/nonexistent/project/path-that-does-not-exist",
		);
		expect(sessions).toEqual([]);
	});

	test("isHookInstalled reflects hook state", () => {
		// Just verify it returns a boolean without throwing
		const result = claudeCodeAdapter.isHookInstalled();
		expect(typeof result).toBe("boolean");
	});

	test("getHookConfigPath returns a path ending in settings.json", () => {
		const path = claudeCodeAdapter.getHookConfigPath();
		expect(path).toEndWith("settings.json");
		expect(path).toContain(".claude");
	});
});

describe("piAdapter", () => {
	test("name is Pi", () => {
		expect(piAdapter.name).toBe("Pi");
	});

	test("source is pi", () => {
		expect(piAdapter.source).toBe("pi");
	});

	test("getSessionsBaseDir returns pi v3 sessions dir", () => {
		expect(piAdapter.getSessionsBaseDir()).toBe(V3_SESSIONS_BASE);
	});

	test("hook methods are no-ops", () => {
		expect(piAdapter.getHookConfigPath()).toBe("");
		expect(piAdapter.isHookInstalled()).toBe(false);
		// These should not throw
		piAdapter.installHook();
		piAdapter.removeHook();
	});

	test("isPiSessionDir detects pi session directories", async () => {
		const piDir = join(SESSION_DIR, PI_SESSION_UUID);
		expect(await isPiSessionDir(piDir)).toBe(true);
	});

	test("isPiSessionDir rejects non-pi directories", async () => {
		// Regular session dir has no subagents/
		expect(await isPiSessionDir(SESSION_DIR)).toBe(false);
		// Nonexistent path
		expect(await isPiSessionDir("/nonexistent/path")).toBe(false);
	});

	test("findProjectSessions returns both v2 and v3 pi sessions", async () => {
		const sessions = await piAdapter.findProjectSessions(TEST_PROJECT_PATH);

		expect(sessions).toHaveLength(2);
		const ids = sessions.map((s) => s.sessionId).sort();
		expect(ids).toContain(PI_SESSION_UUID); // v2
		expect(ids).toContain(V3_SESSION_UUID); // v3

		// v2 transcriptPath is a directory
		const v2 = sessions.find((s) => s.sessionId === PI_SESSION_UUID);
		expect(v2?.transcriptPath).toBe(join(SESSION_DIR, PI_SESSION_UUID));

		// v3 transcriptPath is a file
		const v3 = sessions.find((s) => s.sessionId === V3_SESSION_UUID);
		expect(v3?.transcriptPath).toBe(V3_SESSION_FILE);
	});

	test("scanAllSessions finds pi sessions without including them in Claude Code results", async () => {
		const piProjects = await piAdapter.scanAllSessions();
		const ccProjects = await claudeCodeAdapter.scanAllSessions();

		// Pi adapter should find our test project with both v2 and v3 sessions
		const piTestProject = piProjects.find(
			(p) => p.projectPath === TEST_PROJECT_PATH,
		);
		expect(piTestProject).toBeDefined();
		expect(piTestProject?.sessionCount).toBe(2);
		const piSessionIds = piTestProject?.sessions.map((s) => s.sessionId);
		expect(piSessionIds).toContain(PI_SESSION_UUID); // v2
		expect(piSessionIds).toContain(V3_SESSION_UUID); // v3

		// Claude Code adapter should NOT include pi sessions
		const ccTestProject = ccProjects.find(
			(p) => p.projectPath === TEST_PROJECT_PATH,
		);
		expect(ccTestProject).toBeDefined();
		const ccSessionIds = ccTestProject?.sessions.map((s) => s.sessionId);
		expect(ccSessionIds).not.toContain(PI_SESSION_UUID);
		expect(ccSessionIds).not.toContain(V3_SESSION_UUID);
		// But it should still have the regular sessions
		expect(ccSessionIds).toContain("session-aaa");
		expect(ccSessionIds).toContain("session-bbb");
	});

	test("buildUploadRequest for v2 concatenates subagent content raw", async () => {
		const sessions = await piAdapter.findProjectSessions(TEST_PROJECT_PATH);
		const v2Session = sessions.find((s) => s.sessionId === PI_SESSION_UUID);
		expect(v2Session).toBeDefined();

		// biome-ignore lint/style/noNonNullAssertion: guarded by expect above
		const request = await piAdapter.buildUploadRequest(v2Session!, {
			gitInfo: {},
			organizationId: "test-org",
		});

		// Content is concatenated subagent JSONL (raw, for MV to parse)
		expect(request.content.length).toBeGreaterThan(0);
		expect(request.content).toContain('"agentId":"a111111"');
		expect(request.content).toContain('"agentId":"a222222"');

		// Subagents array preserves per-agent identity
		expect(request.subagents).toBeDefined();
		expect(request.subagents).toHaveLength(2);
		const agentIds = request.subagents?.map((s) => s.agentId).sort();
		expect(agentIds).toEqual(["a111111", "a222222"]);

		// Source is pi, version is 2
		expect(request.source).toBe("pi");
		expect(request.version).toBe(2);
		expect(request.sessionId).toBe(PI_SESSION_UUID);
	});

	test("buildUploadRequest for v3 stores raw content", async () => {
		const sessions = await piAdapter.findProjectSessions(TEST_PROJECT_PATH);
		const v3Session = sessions.find((s) => s.sessionId === V3_SESSION_UUID);
		expect(v3Session).toBeDefined();

		// biome-ignore lint/style/noNonNullAssertion: guarded by expect above
		const request = await piAdapter.buildUploadRequest(v3Session!, {
			gitInfo: {},
			organizationId: "test-org",
		});

		// Content is raw v3 JSONL — NOT transformed
		expect(request.content).toContain('"type":"session"');
		expect(request.content).toContain('"type":"message"');
		expect(request.content).toContain('"type":"compaction"');
		// Should preserve native Pi fields
		expect(request.content).toContain('"cacheRead"');
		expect(request.content).toContain('"cacheWrite"');

		// No subagents for v3 (it's a single file)
		expect(request.subagents).toBeUndefined();

		// Source is pi, version is 3
		expect(request.source).toBe("pi");
		expect(request.version).toBe(3);
		expect(request.sessionId).toBe(V3_SESSION_UUID);
	});

	test("extractTimestamps works on raw v2 content (subagent JSONL)", () => {
		const content = `${SAMPLE_SUBAGENT_A}\n${SAMPLE_SUBAGENT_B}`;
		const timestamps = piAdapter.extractTimestamps(content);

		expect(timestamps).not.toBeNull();
		expect(timestamps?.sessionDate).toBe("2026-01-15T10:00:00.000Z");
		expect(timestamps?.lastInteractionDate).toBe("2026-01-15T10:01:10.000Z");
	});

	test("extractTimestamps works on raw v3 content (native Pi JSONL)", () => {
		const v3Content = SAMPLE_V3_SESSION.replace(/"cwd":""/, '"cwd":"/test"');
		const timestamps = piAdapter.extractTimestamps(v3Content);

		expect(timestamps).not.toBeNull();
		// v3 has timestamps on session, thinking_level_change, messages, and compaction
		// Min should be the earliest timestamp
		expect(timestamps?.sessionDate).toBe("2026-03-10T10:00:00.000Z");
		// Max should be the compaction timestamp (latest)
		expect(timestamps?.lastInteractionDate).toBe("2026-03-10T10:00:20.000Z");
	});

	test("buildUploadRequest throws on nonexistent path (caller handles retry)", async () => {
		const badSession = {
			sessionId: "nonexistent",
			transcriptPath: "/nonexistent/path/that/does/not/exist",
			projectPath: "/nonexistent",
		};

		await expect(
			piAdapter.buildUploadRequest(badSession, {
				gitInfo: {},
				organizationId: "test-org",
			}),
		).rejects.toThrow();
	});

	test("isPiSession detects both v2 and v3 sessions", async () => {
		// v2: directory
		expect(await isPiSession(join(SESSION_DIR, PI_SESSION_UUID))).toBe(true);
		// v3: file under ~/.pi/agent/sessions/
		expect(await isPiSession(V3_SESSION_FILE)).toBe(true);
		// Not a pi session
		expect(await isPiSession("/some/random/path.jsonl")).toBe(false);
	});
});

describe("getAvailableAdapters", () => {
	test("returns at least the Claude Code adapter", () => {
		const adapters = getAvailableAdapters();
		expect(adapters.length).toBeGreaterThanOrEqual(1);
		expect(adapters.some((a) => a.name === "Claude Code")).toBe(true);
	});

	test("returns Pi adapter alongside Claude Code", () => {
		const adapters = getAvailableAdapters();
		expect(adapters.some((a) => a.name === "Pi")).toBe(true);
	});
});
