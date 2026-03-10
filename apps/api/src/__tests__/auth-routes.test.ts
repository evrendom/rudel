import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const MONOREPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");

interface TestServer {
	baseUrl: string;
	stop: () => Promise<void>;
}

function spawnServer(env: Record<string, string | undefined>) {
	const proc = Bun.spawn(["bun", "apps/api/src/index.ts"], {
		cwd: MONOREPO_ROOT,
		stdout: "pipe",
		stderr: "pipe",
		env,
	});
	proc.unref();
	return proc;
}

async function parseReadyPort(
	proc: ReturnType<typeof Bun.spawn>,
): Promise<number> {
	const stdout = proc.stdout;
	if (!stdout || !(stdout instanceof ReadableStream)) {
		throw new Error("Server process has no readable stdout");
	}

	const reader = stdout.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	const deadline = Date.now() + 30_000;

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

	proc.kill();
	throw new Error("Server did not become ready within 30s");
}

async function waitForReady(baseUrl: string): Promise<void> {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${baseUrl}/health`, {
				signal: AbortSignal.timeout(2_000),
			});
			if (res.ok) return;
		} catch {
			// retry
		}
		await Bun.sleep(200);
	}
	throw new Error(`Server at ${baseUrl} did not respond within 10s`);
}

async function startTestServer(): Promise<TestServer> {
	const env = {
		...process.env,
		PORT: "0",
		APP_URL: "http://localhost",
		BETTER_AUTH_SECRET: "test-secret-for-auth-route-tests",
		ALLOWED_ORIGIN: "http://localhost",
	};
	const proc = spawnServer(env);
	const port = await parseReadyPort(proc);
	await waitForReady(`http://localhost:${port}`);

	return {
		baseUrl: `http://localhost:${port}`,
		async stop() {
			proc.kill();
			await proc.exited;
		},
	};
}

let server: TestServer;

beforeAll(async () => {
	server = await startTestServer();
}, 60_000);

afterAll(async () => {
	await server?.stop();
});

describe("auth route hardening", () => {
	test("blocks Better Auth organization deletion endpoint", async () => {
		const response = await fetch(
			`${server.baseUrl}/api/auth/organization/delete`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ organizationId: "org_test" }),
			},
		);

		expect(response.status).toBe(404);
		expect(await response.text()).toContain("Not found");
	});
});
