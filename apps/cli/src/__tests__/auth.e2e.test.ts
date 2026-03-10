import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";

setDefaultTimeout(30_000);

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	issueCliCredential,
	signUpTestUser,
	startTestServer,
	type TestBrowserSession,
	type TestServer,
} from "./helpers/bun-server.js";

let server: TestServer;
let configDir: string;
let tempDir: string;
let browserSession: TestBrowserSession;
let originalPlaintextFallback: string | undefined;

beforeAll(async () => {
	tempDir = mkdtempSync(join(tmpdir(), "rudel-auth-test-"));
	configDir = join(tempDir, "config");
	mkdirSync(configDir, { recursive: true });

	server = await startTestServer();
	browserSession = await signUpTestUser(server.baseUrl);
	originalPlaintextFallback = process.env.RUDEL_ALLOW_PLAINTEXT_CREDENTIALS;
	process.env.RUDEL_ALLOW_PLAINTEXT_CREDENTIALS = "1";
});

afterAll(async () => {
	await server?.stop();
	if (originalPlaintextFallback === undefined) {
		delete process.env.RUDEL_ALLOW_PLAINTEXT_CREDENTIALS;
	} else {
		process.env.RUDEL_ALLOW_PLAINTEXT_CREDENTIALS = originalPlaintextFallback;
	}
	rmSync(tempDir, { recursive: true, force: true });
});

describe("auth e2e", () => {
	test("login: callback server receives token and stores credentials", async () => {
		// Clear any existing credentials first
		clearCredentialsFromDir(configDir);

		const cliPath = join(import.meta.dir, "..", "bin", "cli.ts");
		const stdoutLogPath = join(tempDir, "login-stdout.log");

		// Start login via shell, tee stdout to a file so we can poll it
		const loginProcess = Bun.spawn(
			[
				"bash",
				"-c",
				`bun "${cliPath}" login --api-base="${server.baseUrl}" --web-url=http://localhost:9999 --no-browser 2>&1 | tee "${stdoutLogPath}"`,
			],
			{
				env: {
					...process.env,
					RUDEL_CONFIG_DIR: configDir,
				},
				stdout: "pipe",
				stderr: "pipe",
			},
		);

		// Poll the log file until the login URL is printed
		const { readFileSync, existsSync } = require("node:fs");
		let output = "";
		const deadline = Date.now() + 10_000;

		while (Date.now() < deadline) {
			if (existsSync(stdoutLogPath)) {
				output = readFileSync(stdoutLogPath, "utf-8");
				if (output.includes("cli_callback=")) break;
			}
			await Bun.sleep(100);
		}

		const loginUrlMatch = output.match(/https?:\/\/[^\s]+/);
		expect(loginUrlMatch).not.toBeNull();
		const loginUrl = new URL(loginUrlMatch?.[0] ?? "");
		const callbackUrl = loginUrl.searchParams.get("cli_callback") ?? "";
		const state = loginUrl.searchParams.get("state") ?? "";
		const codeChallenge = loginUrl.searchParams.get("code_challenge") ?? "";
		const deviceName = loginUrl.searchParams.get("device_name") ?? "";

		expect(callbackUrl).toContain("127.0.0.1");
		expect(state).not.toBe("");
		expect(codeChallenge).not.toBe("");
		expect(deviceName).not.toBe("");

		// Simulate what the web app does: mint a short-lived auth code first
		const cliTokenResponse = await fetch(`${server.baseUrl}/api/cli-token`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: browserSession.cookieHeader,
			},
			body: JSON.stringify({
				cliCallback: callbackUrl,
				state,
				codeChallenge,
				deviceName,
			}),
		});
		if (!cliTokenResponse.ok) {
			throw new Error(
				`/api/cli-token failed (${cliTokenResponse.status}): ${await cliTokenResponse.text()}`,
			);
		}
		const cliTokenBody = (await cliTokenResponse.json()) as { code: string };
		expect(typeof cliTokenBody.code).toBe("string");

		// Simulate the browser redirect back to the CLI with code + state
		const callbackResponse = await fetch(
			`${callbackUrl}?code=${encodeURIComponent(cliTokenBody.code)}&state=${state}`,
		);
		expect(callbackResponse.ok).toBe(true);
		const callbackBody = await callbackResponse.text();
		expect(callbackBody).toContain("Return to the terminal");

		// Wait for the process to finish
		const exitCode = await loginProcess.exited;
		expect(exitCode).toBe(0);

		// Verify credentials were stored
		const savedCredentials = loadCredentialsFromDir(configDir);
		expect(savedCredentials).not.toBeNull();
		expect(savedCredentials?.token).toMatch(/^rcl_[^.]+\.[A-Za-z0-9_-]+$/);
		expect(savedCredentials?.apiBaseUrl).toBe(server.baseUrl);

		const meResponse = await fetch(`${server.baseUrl}/rpc/me`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${savedCredentials?.token ?? ""}`,
			},
			body: JSON.stringify({}),
		});
		expect(meResponse.ok).toBe(true);
	});

	test("whoami: shows user info with valid credentials", async () => {
		const cliToken = await issueCliCredential(server.baseUrl, browserSession);
		saveCredentialsToDir(configDir, cliToken, server.baseUrl);

		const cliPath = join(import.meta.dir, "..", "bin", "cli.ts");
		const proc = Bun.spawn(["bun", cliPath, "whoami"], {
			env: {
				...process.env,
				RUDEL_CONFIG_DIR: configDir,
				RUDEL_ALLOW_PLAINTEXT_CREDENTIALS: "1",
			},
			stdout: "pipe",
			stderr: "pipe",
		});

		const exitCode = await proc.exited;
		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();

		expect(exitCode).toBe(0);
		expect(stdout).toContain("Test User");
		expect(stdout).toContain("test-");
		expect(stderr).toBe("");
	});

	test("logout: clears credentials", async () => {
		const cliToken = await issueCliCredential(server.baseUrl, browserSession);
		saveCredentialsToDir(configDir, cliToken, server.baseUrl);

		const cliPath = join(import.meta.dir, "..", "bin", "cli.ts");
		const proc = Bun.spawn(["bun", cliPath, "logout"], {
			env: {
				...process.env,
				RUDEL_CONFIG_DIR: configDir,
				RUDEL_ALLOW_PLAINTEXT_CREDENTIALS: "1",
			},
			stdout: "pipe",
			stderr: "pipe",
		});

		const exitCode = await proc.exited;
		const stdout = await new Response(proc.stdout).text();

		expect(exitCode).toBe(0);
		expect(stdout).toContain("Logged out successfully");

		// Verify credentials are gone
		const credentials = loadCredentialsFromDir(configDir);
		expect(credentials).toBeNull();

		const revokedResponse = await fetch(`${server.baseUrl}/rpc/me`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${cliToken}`,
			},
			body: JSON.stringify({}),
		});
		expect(revokedResponse.ok).toBe(false);
	});

	test("whoami: shows not logged in after logout", async () => {
		// Ensure no credentials
		clearCredentialsFromDir(configDir);

		const cliPath = join(import.meta.dir, "..", "bin", "cli.ts");
		const proc = Bun.spawn(["bun", cliPath, "whoami"], {
			env: {
				...process.env,
				RUDEL_CONFIG_DIR: configDir,
				RUDEL_ALLOW_PLAINTEXT_CREDENTIALS: "1",
			},
			stdout: "pipe",
			stderr: "pipe",
		});

		const exitCode = await proc.exited;
		const stdout = await new Response(proc.stdout).text();

		expect(exitCode).toBe(0);
		expect(stdout).toContain("Not logged in");
	});

	test("cli auth codes are one-time use", async () => {
		const state = randomBytes(16).toString("hex");
		const codeVerifier = randomBytes(32).toString("base64url");
		const codeChallenge = createHash("sha256")
			.update(codeVerifier)
			.digest("base64url");

		const createResponse = await fetch(`${server.baseUrl}/api/cli-token`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Cookie: browserSession.cookieHeader,
			},
			body: JSON.stringify({
				cliCallback: "http://127.0.0.1:43123/callback",
				state,
				codeChallenge,
				deviceName: "Replay Test CLI",
			}),
		});
		if (!createResponse.ok) {
			throw new Error(
				`/api/cli-token failed (${createResponse.status}): ${await createResponse.text()}`,
			);
		}
		const createBody = (await createResponse.json()) as { code: string };

		const firstExchange = await fetch(`${server.baseUrl}/api/cli-exchange`, {
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
		expect(firstExchange.ok).toBe(true);
		const firstBody = (await firstExchange.json()) as { token: string };
		expect(firstBody.token).toMatch(/^rcl_[^.]+\.[A-Za-z0-9_-]+$/);

		const replayExchange = await fetch(`${server.baseUrl}/api/cli-exchange`, {
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
		expect(replayExchange.status).toBe(400);
	});
});

// Helpers that operate on a specific config dir (matching the RUDEL_CONFIG_DIR env var)
function saveCredentialsToDir(
	dir: string,
	token: string,
	apiBaseUrl: string,
): void {
	const { writeFileSync } = require("node:fs");
	writeFileSync(
		join(dir, "credentials.json"),
		JSON.stringify({ token, apiBaseUrl }, null, 2),
		{ mode: 0o600 },
	);
	const metadataPath = join(dir, "credentials-meta.json");
	try {
		const { rmSync } = require("node:fs");
		rmSync(metadataPath);
	} catch {
		// already gone
	}
}

function loadCredentialsFromDir(
	dir: string,
): { token: string; apiBaseUrl: string } | null {
	const path = join(dir, "credentials.json");
	try {
		const { readFileSync } = require("node:fs");
		const content = readFileSync(path, "utf-8");
		return JSON.parse(content);
	} catch {
		return null;
	}
}

function clearCredentialsFromDir(dir: string): void {
	const paths = [
		join(dir, "credentials.json"),
		join(dir, "credentials-meta.json"),
	];
	try {
		const { rmSync } = require("node:fs");
		for (const path of paths) {
			rmSync(path, { force: true });
		}
	} catch {
		// already gone
	}
}
