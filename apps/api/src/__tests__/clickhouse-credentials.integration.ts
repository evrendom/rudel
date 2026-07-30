import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { createClickHouseExecutor } from "../clickhouse.js";

const MONOREPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..");
const MISSING_USERNAME_ERROR =
	"Refusing to fall back to the `default` superuser";
const API_IDENTITY_SCRIPT = `
	import { getClickhouse } from "./apps/api/src/clickhouse.ts";

	const marker = process.env.CLICKHOUSE_CREDENTIAL_TEST_MARKER;
	if (!marker) throw new Error("CLICKHOUSE_CREDENTIAL_TEST_MARKER is required");

	const rows = await getClickhouse().query({
		query: "SELECT currentUser() AS username LIMIT 1",
		clickhouse_settings: {
			log_comment: marker,
			max_execution_time: 5,
			max_rows_to_read: "10",
			max_bytes_to_read: "1024",
		},
	});
	console.log(rows[0]?.username ?? "");
`;

interface CredentialTestConfig {
	appPassword: string;
	appUsername: string;
	defaultPassword: string;
	url: string;
}

interface ProcessResult {
	exitCode: number;
	stderr: string;
	stdout: string;
}

function getRequiredEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`${name} is required`);
	return value;
}

function getCredentialTestConfig(): CredentialTestConfig {
	const url = getRequiredEnv("CLICKHOUSE_CREDENTIAL_TEST_URL");
	const parsedUrl = new URL(url);

	if (parsedUrl.protocol !== "http:" || parsedUrl.hostname !== "localhost.") {
		throw new Error(
			"CLICKHOUSE_CREDENTIAL_TEST_URL must use the CI-only http://localhost. endpoint",
		);
	}

	return {
		appPassword: getRequiredEnv("CLICKHOUSE_CREDENTIAL_TEST_PASSWORD"),
		appUsername: getRequiredEnv("CLICKHOUSE_CREDENTIAL_TEST_USERNAME"),
		defaultPassword: getRequiredEnv(
			"CLICKHOUSE_CREDENTIAL_TEST_DEFAULT_PASSWORD",
		),
		url,
	};
}

function createCredentialTestEnvironment(
	config: CredentialTestConfig,
	overrides: Record<string, string | undefined>,
): Record<string, string | undefined> {
	return {
		...process.env,
		CLICKHOUSE_URL: config.url,
		CLICKHOUSE_DB: "default",
		CLICKHOUSE_USER: undefined,
		CLICKHOUSE_USERNAME: undefined,
		...overrides,
	};
}

function readProcessOutput(
	stream: ReadableStream<Uint8Array> | number | null,
): Promise<string> {
	if (!(stream instanceof ReadableStream)) {
		throw new Error("Expected piped process output");
	}
	return new Response(stream).text();
}

async function runProcess(
	command: string[],
	environment: Record<string, string | undefined>,
): Promise<ProcessResult> {
	const subprocess = Bun.spawn(command, {
		cwd: MONOREPO_ROOT,
		env: environment,
		stderr: "pipe",
		stdout: "pipe",
	});
	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		subprocess.kill();
	}, 10_000);

	const [exitCode, stderr, stdout] = await Promise.all([
		subprocess.exited,
		readProcessOutput(subprocess.stderr),
		readProcessOutput(subprocess.stdout),
	]);
	clearTimeout(timeout);

	if (timedOut) {
		throw new Error(`Process timed out: ${command.join(" ")}`);
	}

	return { exitCode, stderr, stdout };
}

test("credential consumers use the named identity and fail closed before querying", async () => {
	const config = getCredentialTestConfig();
	const defaultExecutor = createClickHouseExecutor({
		url: config.url,
		username: "default",
		password: config.defaultPassword,
		database: "default",
	});

	const defaultIdentity = await defaultExecutor.query<{ username: string }>({
		query: "SELECT currentUser() AS username LIMIT 1",
		clickhouse_settings: {
			max_execution_time: 5,
			max_rows_to_read: "10",
			max_bytes_to_read: "1024",
		},
	});
	expect(defaultIdentity).toEqual([{ username: "default" }]);

	const namedIdentity = await runProcess(
		["bun", "--eval", API_IDENTITY_SCRIPT],
		createCredentialTestEnvironment(config, {
			CLICKHOUSE_CREDENTIAL_TEST_MARKER: "credential_named_identity",
			CLICKHOUSE_PASSWORD: config.appPassword,
			CLICKHOUSE_USERNAME: config.appUsername,
		}),
	);
	expect(namedIdentity.exitCode).toBe(0);
	expect(namedIdentity.stderr).toBe("");
	expect(namedIdentity.stdout.trim()).toBe(config.appUsername);

	const missingUsername = await runProcess(
		["bun", "--eval", API_IDENTITY_SCRIPT],
		createCredentialTestEnvironment(config, {
			CLICKHOUSE_CREDENTIAL_TEST_MARKER: "credential_missing_username",
			CLICKHOUSE_PASSWORD: config.defaultPassword,
		}),
	);

	await defaultExecutor.execute({ query: "SYSTEM FLUSH LOGS" });
	const fallbackQueries = await defaultExecutor.query<{ username: string }>({
		query: `
				SELECT user AS username
				FROM system.query_log
				WHERE log_comment = {marker:String}
					AND user = 'default'
					AND type = 'QueryFinish'
				LIMIT 10
			`,
		query_params: { marker: "credential_missing_username" },
		clickhouse_settings: {
			max_execution_time: 5,
			max_rows_to_read: "100000",
			max_bytes_to_read: "10000000",
		},
	});
	expect(missingUsername.exitCode).not.toBe(0);
	expect(missingUsername.stderr).toContain(MISSING_USERNAME_ERROR);
	expect(fallbackQueries).toEqual([]);

	const rebuild = await runProcess(
		["bun", "packages/ch-schema/scripts/rebuild-wrapped-user-archetypes.ts"],
		createCredentialTestEnvironment(config, {
			CLICKHOUSE_PASSWORD: config.defaultPassword,
		}),
	);
	expect(rebuild.exitCode).not.toBe(0);
	expect(rebuild.stderr).toContain(MISSING_USERNAME_ERROR);

	const chcli = await runProcess(
		[
			"bun",
			"packages/ch-schema/scripts/chcli-connect.ts",
			"-q",
			"SELECT currentUser() LIMIT 1 SETTINGS max_execution_time=5, max_rows_to_read=10, max_bytes_to_read=1024",
		],
		createCredentialTestEnvironment(config, {
			CLICKHOUSE_PASSWORD: config.defaultPassword,
		}),
	);
	expect(chcli.exitCode).not.toBe(0);
	expect(chcli.stderr).toContain(MISSING_USERNAME_ERROR);

	const conflictingUsernames = await runProcess(
		["bun", "--eval", API_IDENTITY_SCRIPT],
		createCredentialTestEnvironment(config, {
			CLICKHOUSE_CREDENTIAL_TEST_MARKER: "credential_conflicting_usernames",
			CLICKHOUSE_PASSWORD: config.defaultPassword,
			CLICKHOUSE_USER: "default",
			CLICKHOUSE_USERNAME: config.appUsername,
		}),
	);
	expect(conflictingUsernames.exitCode).not.toBe(0);
	expect(conflictingUsernames.stderr).toContain(
		"identity to connect as is ambiguous",
	);
}, 60_000);
