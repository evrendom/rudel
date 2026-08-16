import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
	type ApiTestServer,
	startApiTestServer,
} from "./helpers/api-test-server.js";

let server: ApiTestServer | undefined;
let baseUrl = "";
let staticDirectory: string;

beforeAll(async () => {
	staticDirectory = await mkdtemp(join(tmpdir(), "rudel-response-policy-"));
	await mkdir(join(staticDirectory, "assets"));
	await Promise.all([
		writeFile(join(staticDirectory, "index.html"), "<h1>Rudel</h1>"),
		writeFile(join(staticDirectory, "assets", "app-123.js"), "export {};"),
	]);

	server = await startApiTestServer({
		NODE_ENV: "production",
		PG_CONNECTION_STRING:
			"postgres://postgres:postgres@localhost:5432/rudel-response-policy",
		STATIC_DIR: relative(join(import.meta.dir, "..", ".."), staticDirectory),
	});
	baseUrl = server.baseUrl.replace("localhost", "127.0.0.1");
});

afterAll(async () => {
	await server?.stop();
	await rm(staticDirectory, { recursive: true });
});

describe("production HTTP response policy", () => {
	test("returns a stable minimal health response", async () => {
		const response = await fetch(`${baseUrl}/health`);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok" });
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	test("hardens the HTML shell and prevents caching", async () => {
		const response = await fetch(baseUrl);

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("Content-Security-Policy")).toContain(
			"frame-ancestors 'none'",
		);
		expect(response.headers.get("Content-Security-Policy")).toContain(
			"script-src 'self' https://*.posthog.com https://*.chatwoot.com",
		);
		expect(response.headers.get("Strict-Transport-Security")).toBe(
			"max-age=31536000; includeSubDomains",
		);
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(response.headers.get("X-Frame-Options")).toBe("DENY");
		expect(response.headers.get("Referrer-Policy")).toBe(
			"strict-origin-when-cross-origin",
		);
		expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
		expect(response.headers.get("X-Request-ID")).toMatch(/^[0-9a-f-]{36}$/u);
	});

	test("keeps built assets immutable", async () => {
		const response = await fetch(`${baseUrl}/assets/app-123.js`);

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe(
			"public, max-age=31536000, immutable",
		);
	});

	test("does not cache the HTML fallback for a missing asset", async () => {
		const response = await fetch(`${baseUrl}/assets/missing.js`);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toStartWith("text/html");
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	test("keeps RPC responses private and preserves fixed-origin CORS", async () => {
		const trustedResponse = await fetch(`${baseUrl}/rpc/health`, {
			body: "{}",
			headers: {
				"Content-Type": "application/json",
				Origin: "http://localhost",
			},
			method: "POST",
		});
		const untrustedResponse = await fetch(`${baseUrl}/rpc/health`, {
			body: "{}",
			headers: {
				"Content-Type": "application/json",
				Origin: "https://untrusted.example",
			},
			method: "POST",
		});

		expect(trustedResponse.status).toBe(200);
		expect(await trustedResponse.json()).toEqual({ json: { status: "ok" } });
		expect(trustedResponse.headers.get("Cache-Control")).toBe("no-store");
		expect(trustedResponse.headers.get("Access-Control-Allow-Origin")).toBe(
			"http://localhost",
		);
		expect(
			trustedResponse.headers.get("Access-Control-Allow-Credentials"),
		).toBe("true");
		expect(
			untrustedResponse.headers.get("Access-Control-Allow-Origin"),
		).toBeNull();
		expect(
			untrustedResponse.headers.get("Access-Control-Allow-Credentials"),
		).toBeNull();
	});
});
