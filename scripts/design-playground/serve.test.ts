import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildTtydCommand,
	type RunningPlayground,
	startPlayground,
} from "./serve.js";

let previousRuntimeRoot: string | undefined;
let running: RunningPlayground | null = null;
let runtimeRoot: string;

beforeEach(async () => {
	previousRuntimeRoot = process.env.RUDEL_PLAYGROUND_RUNTIME_DIR;
	runtimeRoot = await mkdtemp(join(tmpdir(), "rudel-control-server-"));
	process.env.RUDEL_PLAYGROUND_RUNTIME_DIR = runtimeRoot;
});

afterEach(async () => {
	await running?.stop();
	running = null;
	if (previousRuntimeRoot === undefined) {
		delete process.env.RUDEL_PLAYGROUND_RUNTIME_DIR;
	} else {
		process.env.RUDEL_PLAYGROUND_RUNTIME_DIR = previousRuntimeRoot;
	}
	await rm(runtimeRoot, { recursive: true, force: true });
});

describe("design playground control server", () => {
	test("serves the cockpit and protects control endpoints", async () => {
		running = await startPlayground({
			controlPort: 0,
			openBrowser: false,
			startTtyd: false,
		});
		const indexResponse = await fetch(running.controlUrl);
		const html = await indexResponse.text();

		expect(indexResponse.status).toBe(200);
		expect(html).toContain("Rudel CLI Lab");
		expect(html).toContain("picker-real");
		expect(html).not.toContain("__PLAYGROUND_CONFIG__");
		expect(indexResponse.headers.get("x-frame-options")).toBe("DENY");

		const unauthorized = await fetch(`${running.controlUrl}/api/state`);
		expect(unauthorized.status).toBe(401);

		const authorized = await fetch(`${running.controlUrl}/api/state`, {
			headers: { "x-playground-token": running.controlToken },
		});
		expect(authorized.status).toBe(200);
		expect(await authorized.json()).toEqual({
			cliMode: "source",
			stubTripwire: null,
			ttydStatus: "disabled",
		});
	});

	test("requires both the launch secret and same Origin for mutations", async () => {
		running = await startPlayground({
			controlPort: 0,
			openBrowser: false,
			startTtyd: false,
		});
		const body = JSON.stringify({ mode: "packed" });
		const withoutOrigin = await fetch(`${running.controlUrl}/api/mode`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-playground-token": running.controlToken,
			},
			body,
		});
		const foreignOrigin = await fetch(`${running.controlUrl}/api/mode`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: "https://example.com",
				"x-playground-token": running.controlToken,
			},
			body,
		});
		const accepted = await fetch(`${running.controlUrl}/api/mode`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Origin: running.controlUrl,
				"x-playground-token": running.controlToken,
			},
			body,
		});

		expect(withoutOrigin.status).toBe(401);
		expect(foreignOrigin.status).toBe(401);
		expect(accepted.status).toBe(200);
		expect(await accepted.json()).toEqual({ cliMode: "packed" });
	});

	test("builds ttyd with loopback binding, origin checks, and Basic auth", () => {
		const command = buildTtydCommand("/opt/homebrew/bin/ttyd", 7681, "secret");

		expect(command).toContain("--writable");
		expect(command).toContain("--url-arg");
		expect(command).toContain("--check-origin");
		expect(command).toContain("127.0.0.1");
		expect(command).toContain("rudel:secret");
	});
});
