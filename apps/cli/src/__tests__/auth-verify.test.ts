import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyAuth } from "../lib/auth.js";
import {
	signUpTestUser,
	startTestServer,
	type TestServer,
} from "./helpers/bun-server.js";

setDefaultTimeout(30_000);

let server: TestServer;
let configDir: string;
let tempDir: string;
let validToken: string;
let originalConfigDir: string | undefined;

beforeAll(async () => {
	tempDir = mkdtempSync(join(tmpdir(), "rudel-auth-verify-test-"));
	configDir = join(tempDir, "config");
	mkdirSync(configDir, { recursive: true });

	originalConfigDir = process.env.RUDEL_CONFIG_DIR;

	server = await startTestServer();
	validToken = await signUpTestUser(server.baseUrl);
}, 60_000);

afterAll(async () => {
	await server?.stop();
	if (originalConfigDir !== undefined) {
		process.env.RUDEL_CONFIG_DIR = originalConfigDir;
	} else {
		delete process.env.RUDEL_CONFIG_DIR;
	}
	rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(async () => {
	await server.ensureAlive();
});

function writeCredentials(token: string, apiBaseUrl: string): void {
	writeFileSync(
		join(configDir, "credentials.json"),
		JSON.stringify({ token, apiBaseUrl, authType: "bearer" }, null, 2),
		{ mode: 0o600 },
	);
}

function clearCredentials(): void {
	const path = join(configDir, "credentials.json");
	if (existsSync(path)) rmSync(path);
}

describe("verifyAuth", () => {
	test("returns no_credentials when not logged in", async () => {
		process.env.RUDEL_CONFIG_DIR = configDir;
		clearCredentials();

		const result = await verifyAuth();

		expect(result.authenticated).toBe(false);
		expect(result).toHaveProperty("reason", "no_credentials");
		expect(result).toHaveProperty(
			"message",
			"Not authenticated. Run `rudel login` first.",
		);
	});

	test("returns authenticated with user for valid token", async () => {
		process.env.RUDEL_CONFIG_DIR = configDir;
		writeCredentials(validToken, server.baseUrl);

		const result = await verifyAuth();

		expect(result.authenticated).toBe(true);
		expect(result).toHaveProperty("credentials");
		expect(result).toHaveProperty("user");
		if (result.authenticated) {
			expect(result.user.email).toContain("test-");
			expect(result.user.name).toBe("Test User");
			expect(result.credentials.token).toBe(validToken);
		}
	});

	test("returns token_expired for invalid token and clears credentials", async () => {
		process.env.RUDEL_CONFIG_DIR = configDir;
		writeCredentials("invalid-token-abc123", server.baseUrl);

		const result = await verifyAuth();

		expect(result.authenticated).toBe(false);
		expect(result).toHaveProperty("reason", "token_expired");

		// Credentials should be cleared after auth failure
		expect(existsSync(join(configDir, "credentials.json"))).toBe(false);
	});

	test("returns network_error when server is unreachable", async () => {
		process.env.RUDEL_CONFIG_DIR = configDir;
		writeCredentials(validToken, "http://localhost:1");

		const result = await verifyAuth();

		expect(result.authenticated).toBe(false);
		expect(result).toHaveProperty("reason", "network_error");
		expect(result).toHaveProperty(
			"message",
			"Failed to verify authentication. Check your connection.",
		);
	});
});
