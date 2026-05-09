/**
 * One-time setup script: seed CI ClickHouse with real session data for analytics integration tests.
 *
 * Usage:
 *   doppler run --project rudel --config ci -- bun scripts/seed-analytics-test-data.ts
 *
 * This script:
 * 1. Starts an API server (uses CI Postgres + ClickHouse from env)
 * 2. Signs up a dedicated test user (analytics-test@rudel.local)
 * 3. Reads 5 local session .jsonl files
 * 4. POSTs each to /rpc/ingestSession with a bearer token
 * 5. Polls session_analytics until all 5 rows are visible
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

const TEST_EMAIL = "analytics-test@rudel.local";
const TEST_PASSWORD = "analytics-test-password-42";

const SESSION_FILES = [
	{
		file: "-Users-marc-Workspace-chkit/e1731008-549e-4aef-b905-b1379a55ff4a.jsonl",
		projectPath: "/Users/marc/Workspace/chkit",
	},
	{
		file: "-Users-marc-Workspace-gazed-apps-api/1935809e-16bb-4e24-894b-d91ee0e230a9.jsonl",
		projectPath: "/Users/marc/Workspace/gazed-apps-api",
	},
	{
		file: "-Users-marc-conductor-workspaces-rudel-kinshasa-v1/401b4b86-47df-4b57-90f8-aebfeb639585.jsonl",
		projectPath: "/Users/marc/conductor/workspaces/rudel/kinshasa-v1",
	},
	{
		file: "-Users-marc-conductor-workspaces-ob-db-calgary-v1/b9f16e91-8d9a-48f9-9dac-acc3924f80a8.jsonl",
		projectPath: "/Users/marc/conductor/workspaces/ob-db/calgary-v1",
	},
	{
		file: "-Users-marc-conductor-workspaces-rudel-cancun/a4a33bab-e533-4a10-b181-ab1346a18625.jsonl",
		projectPath: "/Users/marc/conductor/workspaces/rudel/cancun",
	},
];

const MONOREPO_ROOT = resolve(import.meta.dir, "..");

// ── Server lifecycle ────────────────────────────────────────────────

function spawnServer() {
	const proc = Bun.spawn(["bun", "apps/api/src/index.ts"], {
		cwd: MONOREPO_ROOT,
		stdout: "pipe",
		stderr: "pipe",
		env: {
			...process.env,
			PORT: "0",
			APP_URL: "http://localhost",
			BETTER_AUTH_SECRET: "test-secret-for-integration-tests",
			ALLOWED_ORIGIN: "http://localhost",
		},
	});
	return proc;
}

async function parseReadyPort(proc: ReturnType<typeof Bun.spawn>): Promise<number> {
	const stdout = proc.stdout;
	if (!stdout || !(stdout instanceof ReadableStream)) {
		throw new Error("Server process has no readable stdout");
	}
	const reader = stdout.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const deadline = Date.now() + 30_000;
	try {
		while (Date.now() < deadline) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			const match = buffer.match(/listening on https?:\/\/localhost:(\d+)/i);
			if (match?.[1]) {
				reader.releaseLock();
				return Number.parseInt(match[1], 10);
			}
		}
	} catch {
		// fall through
	}
	proc.kill();
	throw new Error(`Server did not become ready within 30s.\nstdout: ${buffer}`);
}

async function waitForReady(baseUrl: string): Promise<void> {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2000) });
			if (res.ok) return;
		} catch {
			// retry
		}
		await Bun.sleep(200);
	}
	throw new Error(`Server at ${baseUrl} did not respond within 10s`);
}

// ── Auth helpers ────────────────────────────────────────────────────

async function signUp(baseUrl: string): Promise<string> {
	const res = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD, name: "Analytics Test User" }),
	});
	if (!res.ok) {
		const body = await res.text();
		// If user already exists, sign in instead
		if (body.includes("already") || res.status === 422 || res.status === 409) {
			return signIn(baseUrl);
		}
		throw new Error(`Sign-up failed (${res.status}): ${body}`);
	}
	return extractToken(res);
}

async function signIn(baseUrl: string): Promise<string> {
	const res = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Sign-in failed (${res.status}): ${body}`);
	}
	return extractToken(res);
}

async function extractToken(res: Response): Promise<string> {
	const data = (await res.json()) as { token?: string };
	if (data.token) return data.token;
	const cookies = res.headers.getSetCookie();
	const sessionCookie = cookies
		.find((c) => c.startsWith("better-auth.session_token="))
		?.split("=")[1]
		?.split(";")[0];
	if (sessionCookie) return sessionCookie;
	throw new Error("Could not extract token from auth response");
}

// ── RPC helper ──────────────────────────────────────────────────────

async function rpc(baseUrl: string, token: string, path: string, input?: Record<string, unknown>) {
	const res = await fetch(`${baseUrl}/rpc/${path}`, {
		method: "POST",
		headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
		body: JSON.stringify(input ? { json: input } : {}),
	});
	const data = await res.json();
	if (!res.ok) throw new Error(`RPC ${path}: ${res.status} ${JSON.stringify(data)}`);
	return (data as { json: unknown }).json;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
	console.log("Starting API server...");
	const proc = spawnServer();
	const port = await parseReadyPort(proc);

	// Drain remaining streams
	if (proc.stdout instanceof ReadableStream) proc.stdout.pipeTo(new WritableStream()).catch(() => {});
	if (proc.stderr instanceof ReadableStream) proc.stderr.pipeTo(new WritableStream()).catch(() => {});

	const baseUrl = `http://localhost:${port}`;
	await waitForReady(baseUrl);
	console.log(`Server ready at ${baseUrl}`);

	// Sign up or sign in
	console.log(`Authenticating as ${TEST_EMAIL}...`);
	const token = await signUp(baseUrl);

	// Get user ID
	const me = (await rpc(baseUrl, token, "me")) as { id: string; email: string };
	console.log(`User ID: ${me.id} (${me.email})`);

	// Read and ingest sessions
	const claudeProjectsDir = resolve(homedir(), ".claude", "projects");
	let ingested = 0;

	for (const session of SESSION_FILES) {
		const filePath = resolve(claudeProjectsDir, session.file);
		const sessionId = session.file.split("/")[1]!.replace(".jsonl", "");

		console.log(`\nIngesting session ${sessionId}...`);
		console.log(`  File: ${filePath}`);

		let content: string;
		try {
			content = readFileSync(filePath, "utf-8");
		} catch (err) {
			console.error(`  SKIP: Could not read file: ${(err as Error).message}`);
			continue;
		}

		try {
			await rpc(baseUrl, token, "ingestSession", {
				sessionId,
				projectPath: session.projectPath,
				content,
			});
			ingested++;
			console.log(`  OK (${content.length} bytes)`);
		} catch (err) {
			console.error(`  FAIL: ${(err as Error).message}`);
		}
	}

	console.log(`\nIngested ${ingested}/${SESSION_FILES.length} sessions.`);

	// Poll session_analytics for propagation (MV computes analytics async)
	console.log("\nWaiting for session_analytics MV propagation...");
	const deadline = Date.now() + 60_000;
	let analyticsCount = 0;

	while (Date.now() < deadline) {
		try {
			const result = (await rpc(baseUrl, token, "analytics/overview/kpis", {
				startDate: "2026-01-01",
				endDate: "2026-12-31",
			})) as { distinct_sessions: number };
			analyticsCount = result.distinct_sessions;
			if (analyticsCount >= ingested) break;
		} catch {
			// MV not ready yet
		}
		await Bun.sleep(2000);
	}

	console.log(`\nsession_analytics has ${analyticsCount} distinct sessions (expected >= ${ingested})`);

	if (analyticsCount < ingested) {
		console.warn("WARNING: Not all sessions propagated to session_analytics within 60s.");
		console.warn("The MV may need more time, or session timestamps may be rejected.");
	}

	// Summary
	console.log("\n── Summary ──");
	console.log(`User ID:    ${me.id}`);
	console.log(`Email:      ${me.email}`);
	console.log(`Sessions:   ${ingested} ingested, ${analyticsCount} in analytics`);
	console.log(`Test email: ${TEST_EMAIL}`);
	console.log(`Password:   ${TEST_PASSWORD}`);

	proc.kill();
	await proc.exited;
	console.log("\nDone.");
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
