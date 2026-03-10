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
	signUpTestUser,
	startTestServer,
	type TestServer,
} from "./helpers/bun-server.js";

let server: TestServer;
let configDir: string;
let tempDir: string;
let sessionToken: string;

beforeAll(async () => {
	tempDir = mkdtempSync(join(tmpdir(), "rudel-auth-test-"));
	configDir = join(tempDir, "config");
	mkdirSync(configDir, { recursive: true });

	server = await startTestServer();
	sessionToken = await signUpTestUser(server.baseUrl);
});

afterAll(async () => {
	await server?.stop();
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

		// Extract the callback URL from the output
		const callbackMatch = output.match(/cli_callback=([^&]+)/);
		expect(callbackMatch).not.toBeNull();
		const callbackUrl = decodeURIComponent(callbackMatch?.[1] ?? "");

		// Extract the state
		const stateMatch = output.match(/state=([a-f0-9]+)/);
		expect(stateMatch).not.toBeNull();
		const state = stateMatch?.[1] ?? "";

		const challengeMatch = output.match(/code_challenge=([A-Za-z0-9_-]+)/);
		expect(challengeMatch).not.toBeNull();
		const codeChallenge = challengeMatch?.[1] ?? "";

		// Simulate what the web app does: mint a short-lived auth code first
		const cliTokenResponse = await fetch(`${server.baseUrl}/api/cli-token`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${sessionToken}`,
			},
			body: JSON.stringify({
				cliCallback: callbackUrl,
				state,
				codeChallenge,
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
		expect(savedCredentials?.token).toBe(sessionToken);
		expect(savedCredentials?.apiBaseUrl).toBe(server.baseUrl);
	});

	test("whoami: shows user info with valid credentials", async () => {
		// Ensure credentials are stored
		saveCredentialsToDir(configDir, sessionToken, server.baseUrl);

		const cliPath = join(import.meta.dir, "..", "bin", "cli.ts");
		const proc = Bun.spawn(["bun", cliPath, "whoami"], {
			env: {
				...process.env,
				RUDEL_CONFIG_DIR: configDir,
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
		// Ensure credentials exist
		saveCredentialsToDir(configDir, sessionToken, server.baseUrl);

		const cliPath = join(import.meta.dir, "..", "bin", "cli.ts");
		const proc = Bun.spawn(["bun", cliPath, "logout"], {
			env: {
				...process.env,
				RUDEL_CONFIG_DIR: configDir,
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
	});

	test("whoami: shows not logged in after logout", async () => {
		// Ensure no credentials
		clearCredentialsFromDir(configDir);

		const cliPath = join(import.meta.dir, "..", "bin", "cli.ts");
		const proc = Bun.spawn(["bun", cliPath, "whoami"], {
			env: {
				...process.env,
				RUDEL_CONFIG_DIR: configDir,
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
				Authorization: `Bearer ${sessionToken}`,
			},
			body: JSON.stringify({
				cliCallback: "http://127.0.0.1:43123/callback",
				state,
				codeChallenge,
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
		expect(firstBody.token).toBe(sessionToken);

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
	const path = join(dir, "credentials.json");
	try {
		const { rmSync } = require("node:fs");
		rmSync(path);
	} catch {
		// already gone
	}
}
