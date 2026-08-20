import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { getPlaygroundPaths, MONOREPO_ROOT } from "./paths.js";
import { SCENARIOS } from "./scenarios.js";
import { startPlaygroundStub } from "./stub-server.js";
import type { CliMode } from "./types.js";

const DEFAULT_CONTROL_PORT = 7680;
const DEFAULT_TTYD_PORT = 7681;
const TTYD_USERNAME = "rudel";
const RUNNER_PATH = resolve(import.meta.dir, "run-scenario.ts");
const INDEX_PATH = resolve(import.meta.dir, "index.html");

interface StartPlaygroundOptions {
	readonly controlPort?: number;
	readonly openBrowser?: boolean;
	readonly startTtyd?: boolean;
	readonly ttydPort?: number;
}

export interface RunningPlayground {
	readonly basicPassword: string;
	readonly basicUsername: string;
	readonly controlToken: string;
	readonly controlUrl: string;
	readonly stop: () => Promise<void>;
}

export async function startPlayground(
	options: StartPlaygroundOptions = {},
): Promise<RunningPlayground> {
	const controlPort = options.controlPort ?? DEFAULT_CONTROL_PORT;
	const ttydPort = options.ttydPort ?? DEFAULT_TTYD_PORT;
	const shouldStartTtyd = options.startTtyd !== false;
	const ttydPath = shouldStartTtyd ? Bun.which("ttyd") : null;
	if (shouldStartTtyd && !ttydPath) {
		throw new Error(
			"ttyd is required for the real PTY. Install it with `brew install ttyd`, then rerun `bun run playground:cli`.",
		);
	}

	const launchSecret = randomBytes(24).toString("base64url");
	const paths = getPlaygroundPaths("fixture", "standard");
	await mkdir(paths.runtimeRoot, { recursive: true, mode: 0o700 });
	await writeControlState(paths.controlState, "source");
	const stub = startPlaygroundStub({ secret: launchSecret });
	let ttydStatus: "disabled" | "ready" | "stopped" = shouldStartTtyd
		? "ready"
		: "disabled";
	let controlOrigin = "";
	const indexTemplate = await readFile(INDEX_PATH, "utf8");

	let control: ReturnType<typeof Bun.serve>;
	try {
		control = Bun.serve({
			hostname: "127.0.0.1",
			port: controlPort,
			async fetch(request) {
				const url = new URL(request.url);
				if (url.pathname === "/" || url.pathname === "/index.html") {
					if (request.method !== "GET") return methodNotAllowed();
					return htmlResponse(
						renderIndex(indexTemplate, {
							controlToken: launchSecret,
							scenarios: SCENARIOS,
							ttydPassword: launchSecret,
							ttydPort,
							ttydReady: shouldStartTtyd,
							ttydUsername: TTYD_USERNAME,
						}),
						ttydPort,
					);
				}
				if (url.pathname === "/favicon.ico") {
					return new Response(null, { status: 204 });
				}
				if (!isControlAuthorized(request, launchSecret, controlOrigin)) {
					return new Response("Unauthorized", { status: 401 });
				}
				if (url.pathname === "/api/state" && request.method === "GET") {
					return Response.json({
						cliMode: await readControlMode(paths.controlState),
						stubTripwire: stub.getTripwire(),
						ttydStatus,
					});
				}
				if (url.pathname === "/api/logs" && request.method === "GET") {
					return Response.json({ logs: stub.getLogs() });
				}
				if (url.pathname === "/api/mode" && request.method === "POST") {
					const mode = await parseModeRequest(request);
					if (!mode) return new Response("Invalid mode", { status: 400 });
					await writeControlState(paths.controlState, mode);
					return Response.json({ cliMode: mode });
				}
				return new Response("Not found", { status: 404 });
			},
		});
	} catch (error) {
		await stub.stop();
		throw error;
	}
	controlOrigin = `http://127.0.0.1:${control.port}`;

	const ttyd =
		shouldStartTtyd && ttydPath
			? Bun.spawn(buildTtydCommand(ttydPath, ttydPort, launchSecret), {
					cwd: MONOREPO_ROOT,
					env: buildTtydEnvironment(
						paths.runtimeRoot,
						stub.loopbackBase,
						launchSecret,
					),
					stdin: "ignore",
					stdout: "inherit",
					stderr: "inherit",
				})
			: null;
	if (ttyd) {
		void ttyd.exited.then(() => {
			ttydStatus = "stopped";
		});
	}

	if (options.openBrowser !== false && shouldStartTtyd) {
		const opener = Bun.spawn(["open", controlOrigin], {
			stdout: "ignore",
			stderr: "ignore",
		});
		void opener.exited;
	}

	let stopped = false;
	return {
		controlUrl: controlOrigin,
		controlToken: launchSecret,
		basicUsername: TTYD_USERNAME,
		basicPassword: launchSecret,
		stop: async () => {
			if (stopped) return;
			stopped = true;
			ttyd?.kill("SIGTERM");
			control.stop(true);
			await stub.stop();
		},
	};
}

export function buildTtydCommand(
	ttydPath: string,
	ttydPort: number,
	launchSecret: string,
): string[] {
	return [
		ttydPath,
		"--writable",
		"--url-arg",
		"--check-origin",
		"--interface",
		"127.0.0.1",
		"--port",
		String(ttydPort),
		"--credential",
		`${TTYD_USERNAME}:${launchSecret}`,
		"--client-option",
		"fontSize=14",
		"bun",
		RUNNER_PATH,
	];
}

function buildTtydEnvironment(
	runtimeRoot: string,
	stubBase: string,
	stubSecret: string,
): Record<string, string> {
	const environment: Record<string, string> = {
		PATH: process.env.PATH ?? "",
		TERM: process.env.TERM ?? "xterm-256color",
		LANG: process.env.LANG ?? "en_US.UTF-8",
		RUDEL_PLAYGROUND_RUNTIME_DIR: runtimeRoot,
		RUDEL_PLAYGROUND_STUB_BASE: stubBase,
		RUDEL_PLAYGROUND_STUB_SECRET: stubSecret,
	};
	copyOptionalEnvironment(environment, "LC_ALL");
	copyOptionalEnvironment(environment, "LC_CTYPE");
	copyOptionalEnvironment(environment, "TMPDIR");
	return environment;
}

function isControlAuthorized(
	request: Request,
	secret: string,
	controlOrigin: string,
): boolean {
	if (request.headers.get("x-playground-token") !== secret) return false;
	if (request.method === "GET") return true;
	return request.headers.get("origin") === controlOrigin;
}

async function parseModeRequest(request: Request): Promise<CliMode | null> {
	let parsed: unknown;
	try {
		parsed = await request.json();
	} catch {
		return null;
	}
	if (!isRecord(parsed)) return null;
	if (parsed.mode === "packed" || parsed.mode === "source") return parsed.mode;
	return null;
}

async function readControlMode(path: string): Promise<CliMode> {
	try {
		const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
		if (isRecord(parsed) && parsed.cliMode === "packed") return "packed";
	} catch {
		// A missing or partial file is safely reset to source mode.
	}
	return "source";
}

async function writeControlState(
	path: string,
	cliMode: CliMode,
): Promise<void> {
	await writeFile(path, `${JSON.stringify({ cliMode }, null, 2)}\n`, {
		mode: 0o600,
	});
}

function renderIndex(
	template: string,
	config: {
		readonly controlToken: string;
		readonly scenarios: typeof SCENARIOS;
		readonly ttydPassword: string;
		readonly ttydPort: number;
		readonly ttydReady: boolean;
		readonly ttydUsername: string;
	},
): string {
	const serialized = JSON.stringify(config).replaceAll("<", "\\u003c");
	return template.replace("__PLAYGROUND_CONFIG__", serialized);
}

function htmlResponse(html: string, ttydPort: number): Response {
	return new Response(html, {
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "no-store",
			"Content-Security-Policy": `default-src 'self'; frame-src http://127.0.0.1:${ttydPort}; connect-src 'self'; img-src 'self' data:; script-src 'unsafe-inline'; style-src 'unsafe-inline';`,
			"Referrer-Policy": "no-referrer",
			"X-Content-Type-Options": "nosniff",
			"X-Frame-Options": "DENY",
		},
	});
}

function methodNotAllowed(): Response {
	return new Response("Method not allowed", { status: 405 });
}

function copyOptionalEnvironment(
	target: Record<string, string>,
	key: string,
): void {
	const value = process.env[key];
	if (value !== undefined) target[key] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

if (import.meta.main) {
	try {
		const running = await startPlayground();
		process.stdout.write(`\nRudel CLI playground: ${running.controlUrl}\n`);
		process.stdout.write(
			`ttyd Basic auth: ${running.basicUsername} / ${running.basicPassword}\n`,
		);
		process.stdout.write("Press Ctrl-C to stop.\n\n");
		const shutdown = async () => {
			await running.stop();
			process.exit(0);
		};
		process.on("SIGINT", shutdown);
		process.on("SIGTERM", shutdown);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown startup error";
		process.stderr.write(`CLI playground: ${message}\n`);
		process.exitCode = 1;
	}
}
