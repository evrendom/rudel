import { resolve } from "node:path";

const MONOREPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..", "..");

export interface ApiTestServer {
	baseUrl: string;
	stop: () => Promise<void>;
}

export async function startApiTestServer(): Promise<ApiTestServer> {
	const environment = {
		...process.env,
		ALLOWED_ORIGIN: "http://localhost",
		APP_URL: "http://localhost",
		BETTER_AUTH_SECRET: "test-secret-for-integration-tests",
		PORT: "0",
	};
	const processHandle = Bun.spawn(["bun", "apps/api/src/index.ts"], {
		cwd: MONOREPO_ROOT,
		env: environment,
		stderr: "pipe",
		stdout: "pipe",
	});
	processHandle.unref();

	const port = await readReadyPort(processHandle);
	drainProcessStream(processHandle.stderr);
	await waitForHealth(port);

	return {
		baseUrl: `http://localhost:${port}`,
		async stop() {
			processHandle.kill();
			await processHandle.exited;
		},
	};
}

function drainProcessStream(
	stream: ReadableStream<Uint8Array> | number | null,
) {
	if (stream instanceof ReadableStream) {
		stream.pipeTo(new WritableStream()).catch(() => {});
	}
}

async function readReadyPort(
	processHandle: ReturnType<typeof Bun.spawn>,
): Promise<number> {
	const stdout = processHandle.stdout;
	if (!(stdout instanceof ReadableStream)) {
		throw new Error("API test server has no readable stdout");
	}

	const reader = stdout.getReader();
	const decoder = new TextDecoder();
	let output = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		output += decoder.decode(value, { stream: true });
		const match = output.match(/listening on https?:\/\/localhost:(\d+)/iu);
		if (match?.[1]) {
			reader.releaseLock();
			return Number.parseInt(match[1], 10);
		}
	}

	processHandle.kill();
	throw new Error(`API test server did not become ready: ${output}`);
}

async function waitForHealth(port: number): Promise<void> {
	const baseUrl = `http://localhost:${port}`;
	const deadline = Date.now() + 10_000;

	while (Date.now() < deadline) {
		const response = await fetch(`${baseUrl}/health`).catch(() => null);
		if (response?.ok) return;
		await Bun.sleep(200);
	}

	throw new Error(`API test server at ${baseUrl} did not become healthy`);
}
