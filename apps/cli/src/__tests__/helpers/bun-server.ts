import { createHash, randomBytes } from "node:crypto";
import { resolve } from "node:path";

const MONOREPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..", "..");

export interface TestServer {
	port: number;
	baseUrl: string;
	rpcUrl: string;
	stop: () => Promise<void>;
	/** Verify the server is still responding; restart it if Bun's test runner killed it. */
	ensureAlive: () => Promise<void>;
}

export interface TestBrowserSession {
	email: string;
	password: string;
	name: string;
	sessionToken: string;
	cookieHeader: string;
}

/**
 * Spawn the Bun API server with PORT=0 so the OS picks a free port.
 * Migrations run automatically at startup.
 */
export async function startTestServer(): Promise<TestServer> {
	const env = {
		...process.env,
		PORT: "0",
		APP_URL: "http://localhost",
		BETTER_AUTH_SECRET: "test-secret-for-integration-tests",
		ALLOWED_ORIGIN: "http://localhost",
	};

	let proc = spawnServer(env);
	let port = await parseReadyPort(proc);
	drainStreams(proc);
	await waitForReady(`http://localhost:${port}`);

	const server: TestServer = {
		get port() {
			return port;
		},
		get baseUrl() {
			return `http://localhost:${port}`;
		},
		get rpcUrl() {
			return `http://localhost:${port}/rpc`;
		},
		async stop() {
			proc.kill();
			await proc.exited;
		},
		async ensureAlive() {
			try {
				const res = await fetch(`http://localhost:${port}/health`, {
					signal: AbortSignal.timeout(2000),
				});
				if (res.ok) return;
			} catch {
				// Server is dead — restart it
			}
			proc = spawnServer(env);
			port = await parseReadyPort(proc);
			drainStreams(proc);
			await waitForReady(`http://localhost:${port}`);
		},
	};

	return server;
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

function drainStreams(proc: ReturnType<typeof Bun.spawn>) {
	if (proc.stdout instanceof ReadableStream) {
		proc.stdout.pipeTo(new WritableStream()).catch(() => {});
	}
	if (proc.stderr instanceof ReadableStream) {
		proc.stderr.pipeTo(new WritableStream()).catch(() => {});
	}
}

/**
 * Read stdout line-by-line until the server prints its "listening on" URL,
 * then extract the port from it.
 */
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

	try {
		while (Date.now() < deadline) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			// index.ts prints: "API server listening on http://localhost:<port>"
			const match = buffer.match(/listening on https?:\/\/localhost:(\d+)/i);
			if (match?.[1]) {
				reader.releaseLock();
				return Number.parseInt(match[1], 10);
			}
		}
	} catch {
		// reader error — fall through to throw
	}

	// If we get here we failed — grab stderr for diagnostics
	let stderrText = "";
	if (proc.stderr instanceof ReadableStream) {
		stderrText = await new Response(proc.stderr).text();
	}

	proc.kill();
	throw new Error(
		`Server did not become ready within 30 s.\nstdout buffer: ${buffer}\nstderr: ${stderrText}`,
	);
}

/**
 * Poll the server until it responds to a GET request.
 * Retries every 200ms for up to 10s.
 */
async function waitForReady(baseUrl: string): Promise<void> {
	const deadline = Date.now() + 10_000;
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`${baseUrl}/health`, {
				signal: AbortSignal.timeout(2000),
			});
			if (res.ok) return;
		} catch {
			// Connection refused or timeout — retry
		}
		await Bun.sleep(200);
	}
	throw new Error(
		`Server at ${baseUrl} did not respond within 10s after port was detected`,
	);
}

function extractSessionCookie(headers: Headers): {
	sessionToken: string;
	cookieHeader: string;
} {
	const cookies = headers.getSetCookie();
	const sessionToken = cookies
		.find((c) => c.startsWith("better-auth.session_token="))
		?.split("=")[1]
		?.split(";")[0];

	if (!sessionToken) {
		throw new Error("Could not extract session cookie from auth response");
	}

	return {
		sessionToken,
		cookieHeader: `better-auth.session_token=${sessionToken}`,
	};
}

/**
 * Create a test user via better-auth sign-up and return the browser session.
 */
export async function signUpTestUser(
	baseUrl: string,
): Promise<TestBrowserSession> {
	const email = `test-${Date.now()}@example.com`;
	const password = "test-password-123";
	const name = "Test User";
	const res = await fetch(`${baseUrl}/api/auth/sign-up/email`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			email,
			password,
			name,
		}),
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Sign-up failed (${res.status}): ${body}`);
	}

	const { sessionToken, cookieHeader } = extractSessionCookie(res.headers);
	return {
		email,
		password,
		name,
		sessionToken,
		cookieHeader,
	};
}

export async function issueCliCredential(
	baseUrl: string,
	browserSession: TestBrowserSession,
	deviceName = "Rudel Test CLI",
): Promise<string> {
	const state = randomBytes(16).toString("hex");
	const codeVerifier = randomBytes(32).toString("base64url");
	const codeChallenge = createHash("sha256")
		.update(codeVerifier)
		.digest("base64url");

	const createResponse = await fetch(`${baseUrl}/api/cli-token`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Cookie: browserSession.cookieHeader,
		},
		body: JSON.stringify({
			cliCallback: "http://127.0.0.1:43123/callback",
			state,
			codeChallenge,
			deviceName,
		}),
	});

	if (!createResponse.ok) {
		const body = await createResponse.text();
		throw new Error(
			`/api/cli-token failed (${createResponse.status}): ${body}`,
		);
	}

	const createBody = (await createResponse.json()) as { code?: string };
	if (!createBody.code) {
		throw new Error("CLI auth code was not returned");
	}

	const exchangeResponse = await fetch(`${baseUrl}/api/cli-exchange`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			code: createBody.code,
			state,
			codeVerifier,
		}),
	});

	if (!exchangeResponse.ok) {
		const body = await exchangeResponse.text();
		throw new Error(
			`/api/cli-exchange failed (${exchangeResponse.status}): ${body}`,
		);
	}

	const exchangeBody = (await exchangeResponse.json()) as { token?: string };
	if (!exchangeBody.token) {
		throw new Error("CLI credential token was not returned");
	}

	return exchangeBody.token;
}
