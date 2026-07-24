import {
	afterAll,
	beforeAll,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import assert from "node:assert/strict";

setDefaultTimeout(60_000);

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApiClient } from "../lib/api-client.js";
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
	test("login: device flow stores ingest API key credentials", async () => {
		// Clear any existing credentials first
		clearCredentialsFromDir(configDir);

		const cliPath = join(import.meta.dir, "..", "bin", "cli.ts");
		const stdoutLogPath = join(tempDir, "login-stdout.log");

		// Start login via shell, tee stdout to a file so we can poll it
		const loginProcess = Bun.spawn(
			[
				"bash",
				"-c",
				`set -o pipefail; bun "${cliPath}" login --api-base="${server.baseUrl}" --web-url=http://localhost:9999 --no-browser 2>&1 | tee "${stdoutLogPath}"`,
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

		// Poll the log file for the device code prompt
		const { readFileSync, existsSync } = require("node:fs");
		let output = "";
		const deadline = Date.now() + 10_000;

		while (Date.now() < deadline) {
			if (existsSync(stdoutLogPath)) {
				output = readFileSync(stdoutLogPath, "utf-8");
				if (output.includes("User code:")) break;
			}
			await Bun.sleep(100);
		}

		// Extract user code and approve the device flow as the test user
		const userCodeMatch = output.match(/User code:\s*([A-Z0-9_-]+)/i);
		expect(userCodeMatch).not.toBeNull();
		const userCode = userCodeMatch?.[1] ?? "";

		const approveResponse = await fetch(
			`${server.baseUrl}/api/auth/device/approve`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sessionToken}`,
					Cookie: `better-auth.session_token=${sessionToken}`,
				},
				body: JSON.stringify({ userCode }),
			},
		);
		expect(approveResponse.ok).toBe(true);

		// Wait for the process to finish
		const exitCode = await loginProcess.exited;
		expect(exitCode).toBe(0);

		// Verify credentials were stored
		const savedCredentials = loadCredentialsFromDir(configDir);
		expect(savedCredentials).not.toBeNull();
		expect(savedCredentials?.token).not.toBe(sessionToken);
		expect(savedCredentials?.apiBaseUrl).toBe(server.baseUrl);
		expect(savedCredentials?.authType).toBe("api-key");
		expect(savedCredentials?.apiKeyId).toBeDefined();
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

	test("logout: revokes API-key credentials and clears them", async () => {
		const apiKey = await createIngestApiKey(server.baseUrl, sessionToken);
		saveCredentialsToDir(
			configDir,
			apiKey.key,
			server.baseUrl,
			"api-key",
			apiKey.id,
		);

		const cliPath = join(import.meta.dir, "..", "bin", "cli.ts");
		const proc = Bun.spawn(["bun", cliPath, "logout"], {
			env: {
				...process.env,
				RUDEL_CONFIG_DIR: configDir,
			},
			stdout: "pipe",
			stderr: "pipe",
		});

		const [exitCode, stdout, stderr] = await Promise.all([
			proc.exited,
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain("Logged out successfully");
		expect(stderr).toBe("");
		expect(loadCredentialsFromDir(configDir)).toBeNull();

		const revokedClient = createApiClient({
			apiBaseUrl: server.baseUrl,
			token: apiKey.key,
			authType: "api-key",
		});
		await expect(revokedClient.cli.authStatus()).rejects.toThrow();
	});

	test("logout: keeps credentials when server revocation fails", async () => {
		saveCredentialsToDir(
			configDir,
			"invalid-api-key",
			server.baseUrl,
			"api-key",
			"invalid-api-key-id",
		);

		const cliPath = join(import.meta.dir, "..", "bin", "cli.ts");
		const proc = Bun.spawn(["bun", cliPath, "logout"], {
			env: {
				...process.env,
				RUDEL_CONFIG_DIR: configDir,
			},
			stdout: "pipe",
			stderr: "pipe",
		});

		const [exitCode, stderr] = await Promise.all([
			proc.exited,
			new Response(proc.stderr).text(),
		]);

		expect(exitCode).toBe(1);
		expect(stderr).toContain("Failed to revoke token on server");
		expect(stderr).toContain("Credentials were kept");
		expect(loadCredentialsFromDir(configDir)).not.toBeNull();
	});

	test("logout --local-only clears credentials without server revocation", async () => {
		saveCredentialsToDir(
			configDir,
			"invalid-api-key",
			server.baseUrl,
			"api-key",
			"invalid-api-key-id",
		);

		const cliPath = join(import.meta.dir, "..", "bin", "cli.ts");
		const proc = Bun.spawn(["bun", cliPath, "logout", "--local-only"], {
			env: {
				...process.env,
				RUDEL_CONFIG_DIR: configDir,
			},
			stdout: "pipe",
			stderr: "pipe",
		});

		const [exitCode, stdout, stderr] = await Promise.all([
			proc.exited,
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);

		expect(exitCode).toBe(0);
		expect(stdout).toContain("Logged out locally");
		expect(stderr).toBe("");
		expect(loadCredentialsFromDir(configDir)).toBeNull();
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
});

// Helpers that operate on a specific config dir (matching the RUDEL_CONFIG_DIR env var)
function saveCredentialsToDir(
	dir: string,
	token: string,
	apiBaseUrl: string,
	authType: "bearer" | "api-key" = "bearer",
	apiKeyId?: string,
): void {
	const { writeFileSync } = require("node:fs");
	writeFileSync(
		join(dir, "credentials.json"),
		JSON.stringify({ token, apiBaseUrl, authType, apiKeyId }, null, 2),
		{ mode: 0o600 },
	);
}

function loadCredentialsFromDir(dir: string): {
	token: string;
	apiBaseUrl: string;
	authType?: string;
	apiKeyId?: string;
} | null {
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

interface ApiKeyCreateResponse {
	id: string;
	key: string;
}

async function createIngestApiKey(
	apiBase: string,
	accessToken: string,
): Promise<ApiKeyCreateResponse> {
	const response = await fetch(`${apiBase}/api/auth/api-key/create`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${accessToken}`,
		},
		body: JSON.stringify({
			name: "rudel-cli-ingest",
			expiresIn: null,
		}),
	});

	expect(response.ok).toBe(true);
	const body: unknown = await response.json();
	assert(isApiKeyCreateResponse(body));
	return body;
}

function isApiKeyCreateResponse(value: unknown): value is ApiKeyCreateResponse {
	return (
		typeof value === "object" &&
		value !== null &&
		"id" in value &&
		"key" in value &&
		typeof value.id === "string" &&
		typeof value.key === "string"
	);
}
