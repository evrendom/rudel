import { resolveClickHouseUsername } from "../src/clickhouse-connection.js";

export async function runChcliConnect(): Promise<number> {
	const rawUrl = process.env.CLICKHOUSE_URL;
	if (rawUrl === undefined || rawUrl.trim().length === 0) {
		throw new Error("CLICKHOUSE_URL is required to run chcli.");
	}

	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		throw new Error("CLICKHOUSE_URL must be a valid URL.");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("CLICKHOUSE_URL must use HTTP or HTTPS.");
	}
	const username = resolveClickHouseUsername(process.env, rawUrl);

	const subprocess = Bun.spawn(["chcli", ...process.argv.slice(2)], {
		env: {
			...process.env,
			CLICKHOUSE_HOST: url.hostname,
			CLICKHOUSE_PORT: url.port || (url.protocol === "https:" ? "443" : "8123"),
			CLICKHOUSE_SECURE: url.protocol === "https:" ? "true" : "false",
			CLICKHOUSE_USER: username,
		},
		stdin: "inherit",
		stdout: "inherit",
		stderr: "inherit",
	});

	return subprocess.exited;
}

if (import.meta.main) {
	try {
		process.exitCode = await runChcliConnect();
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error(`Failed to run chcli: ${message}`);
		process.exitCode = 1;
	}
}
