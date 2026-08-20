import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { generateFixture } from "./gen-fixtures.js";
import type { PlaygroundPaths } from "./paths.js";
import type {
	AgentState,
	FixtureVariant,
	PlaygroundIdentity,
	PlaygroundOrganization,
	PlaygroundProfile,
	PlaygroundUser,
} from "./types.js";

const MARKER_TOKEN = "rudel-playground-marker-token";
const FIXTURE_IDENTITY: PlaygroundIdentity = {
	user: {
		id: "user_playground_01",
		email: "designer@loopback.invalid",
		name: "Rudel Designer",
	},
	organizations: [
		{
			id: "org_playground_alpha",
			name: "North Star Studio",
			slug: "north-star-studio",
		},
		{
			id: "org_playground_beta",
			name: "Interface Lab",
			slug: "interface-lab",
		},
	],
};

export interface PreparedSandbox {
	readonly identity: PlaygroundIdentity;
	readonly identitySource: "fixture-fallback" | "fixture" | "mirrored-real";
	readonly paths: PlaygroundPaths;
}

export async function prepareSandbox(
	profile: PlaygroundProfile,
	fixture: FixtureVariant,
	agentState: AgentState,
	stubBase: string,
	paths: PlaygroundPaths,
): Promise<PreparedSandbox> {
	await Promise.all([
		mkdir(paths.configDir, { recursive: true, mode: 0o700 }),
		mkdir(paths.runtimeRoot, { recursive: true, mode: 0o700 }),
		mkdir(paths.workdir, { recursive: true, mode: 0o700 }),
	]);
	await chmod(paths.configDir, 0o700);
	await resetAgentHome(paths.agentHome, paths.runtimeRoot);
	await seedAgentState(paths, agentState);

	if (profile === "local-real") {
		await rm(join(paths.configDir, "failed-uploads.json"), { force: true });
		const mirrored = await mirrorCredentialsForPlayground(
			join(homedir(), ".rudel", "credentials.json"),
			paths.configDir,
			stubBase,
		);
		return {
			identity: mirrored.identity,
			identitySource: mirrored.source,
			paths,
		};
	}

	const generated = await generateFixture(fixture);
	if (fixture === "signed-out") {
		await rm(join(paths.configDir, "credentials.json"), { force: true });
	} else {
		await writeCredentials(paths.configDir, stubBase, FIXTURE_IDENTITY);
	}
	if (fixture === "retry-queue") {
		await writeRetryQueue(
			paths.configDir,
			generated.firstTranscript,
			paths.workdir,
		);
	} else {
		await rm(join(paths.configDir, "failed-uploads.json"), { force: true });
	}
	return { identity: FIXTURE_IDENTITY, identitySource: "fixture", paths };
}

export async function mirrorCredentialsForPlayground(
	realCredentialsPath: string,
	configDir: string,
	stubBase: string,
): Promise<{
	readonly identity: PlaygroundIdentity;
	readonly source: "fixture-fallback" | "mirrored-real";
}> {
	let raw: string;
	try {
		raw = await readFile(realCredentialsPath, "utf8");
	} catch (error) {
		if (hasErrorCode(error, "ENOENT")) {
			await writeCredentials(configDir, stubBase, FIXTURE_IDENTITY);
			return { identity: FIXTURE_IDENTITY, source: "fixture-fallback" };
		}
		throw new Error(
			"Unable to read cached Rudel identity fields for local-real mode. The credential contents were not included in this error.",
		);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(
			"Unable to parse cached Rudel identity fields for local-real mode. The credential contents were not included in this error.",
		);
	}
	if (!isRecord(parsed) || typeof parsed.token !== "string") {
		throw new Error(
			"Cached Rudel credentials do not have the expected shape for local-real mode.",
		);
	}
	const user = parseUser(parsed.user);
	if (!user) {
		await writeCredentials(configDir, stubBase, FIXTURE_IDENTITY);
		return { identity: FIXTURE_IDENTITY, source: "fixture-fallback" };
	}
	const organizations = parseOrganizations(parsed.organizations);
	const identity: PlaygroundIdentity = { user, organizations };
	const serialized = await writeCredentials(configDir, stubBase, identity);
	if (serialized.includes(parsed.token)) {
		await rm(join(configDir, "credentials.json"), { force: true });
		throw new Error(
			"The playground refused to persist a real credential token.",
		);
	}
	return { identity, source: "mirrored-real" };
}

async function writeCredentials(
	configDir: string,
	stubBase: string,
	identity: PlaygroundIdentity,
): Promise<string> {
	const credentials = {
		token: MARKER_TOKEN,
		apiBaseUrl: stubBase,
		authType: "api-key",
		user: identity.user,
		organizations: identity.organizations,
	};
	const serialized = `${JSON.stringify(credentials, null, 2)}\n`;
	const credentialsPath = join(configDir, "credentials.json");
	await writeFile(credentialsPath, serialized, { mode: 0o600 });
	await chmod(credentialsPath, 0o600);
	return serialized;
}

async function writeRetryQueue(
	configDir: string,
	firstTranscript: string | null,
	workdir: string,
): Promise<void> {
	if (!firstTranscript) {
		throw new Error("Retry-queue fixture requires at least one transcript");
	}
	const queuePath = join(configDir, "failed-uploads.json");
	const queue = {
		failures: [
			{
				sessionId: "fixture-current-01",
				transcriptPath: firstTranscript,
				projectPath: workdir,
				source: "claude_code",
				error: "Service unavailable",
				failedAt: "2026-08-20T08:00:00.000Z",
				status: "retryable",
			},
			{
				sessionId: "fixture-permanent-01",
				transcriptPath: firstTranscript,
				projectPath: workdir,
				source: "claude_code",
				error: "Payload too large",
				failedAt: "2026-08-19T08:00:00.000Z",
				status: "permanent",
			},
		],
	};
	await writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`, {
		mode: 0o600,
	});
	await chmod(queuePath, 0o600);
}

async function resetAgentHome(
	agentHome: string,
	runtimeRoot: string,
): Promise<void> {
	const pathFromRuntime = relative(runtimeRoot, agentHome);
	if (
		pathFromRuntime === "" ||
		pathFromRuntime === ".." ||
		pathFromRuntime.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
	) {
		throw new Error(
			"Refusing to reset an agent path outside playground runtime",
		);
	}
	await rm(agentHome, { recursive: true, force: true });
	await mkdir(agentHome, { recursive: true, mode: 0o700 });
}

async function seedAgentState(
	paths: PlaygroundPaths,
	agentState: AgentState,
): Promise<void> {
	if (agentState !== "hooks-enabled") return;
	const claudeSettingsPath = join(paths.agentHome, ".claude", "settings.json");
	await mkdir(dirname(claudeSettingsPath), { recursive: true });
	await mkdir(dirname(paths.codexConfig), { recursive: true });
	await Promise.all([
		writeFile(
			claudeSettingsPath,
			`${JSON.stringify(
				{
					hooks: {
						SessionEnd: [
							{
								matcher: "",
								hooks: [
									{
										type: "command",
										command: "rudel hooks claude session-end",
										async: true,
									},
								],
							},
						],
					},
				},
				null,
				2,
			)}\n`,
			{ mode: 0o600 },
		),
		writeFile(
			paths.codexConfig,
			'notify = ["rudel", "hooks", "codex", "turn-complete"]\n',
			{ mode: 0o600 },
		),
	]);
}

function parseUser(value: unknown): PlaygroundUser | null {
	if (!isRecord(value)) return null;
	if (
		typeof value.id !== "string" ||
		typeof value.email !== "string" ||
		typeof value.name !== "string"
	) {
		return null;
	}
	return { id: value.id, email: value.email, name: value.name };
}

function parseOrganizations(value: unknown): readonly PlaygroundOrganization[] {
	if (!Array.isArray(value)) return [];
	const organizations: PlaygroundOrganization[] = [];
	for (const item of value) {
		if (!isRecord(item)) continue;
		if (
			typeof item.id !== "string" ||
			typeof item.name !== "string" ||
			typeof item.slug !== "string"
		) {
			continue;
		}
		organizations.push({ id: item.id, name: item.name, slug: item.slug });
	}
	return organizations;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function hasErrorCode(value: unknown, code: string): boolean {
	return isRecord(value) && value.code === code;
}
