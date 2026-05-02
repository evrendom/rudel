import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import pkg from "../../package.json" with { type: "json" };

const NPM_LATEST_URL = "https://registry.npmjs.org/rudel/latest";
const UPDATE_CHECK_FILE = "update-check.json";
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const UPDATE_CHECK_TIMEOUT_MS = 1_000;
const SKIPPED_COMMANDS = new Set(["dev", "help", "hooks"]);

interface UpdateCheckState {
	readonly lastCheckedAt: number | null;
	readonly latestVersion: string | null;
}

export interface CliUpdateNoticeOptions {
	readonly commandName: string;
	readonly currentVersion?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly fetchLatestVersion?: (signal: AbortSignal) => Promise<string | null>;
	readonly isTty?: boolean;
	readonly now?: number;
}

export async function getCliUpdateNotice(
	options: CliUpdateNoticeOptions,
): Promise<string | null> {
	const env = options.env ?? process.env;
	const isTty = options.isTty ?? Boolean(process.stderr.isTTY);
	const now = options.now ?? Date.now();

	if (shouldSkipUpdateCheck(options.commandName, env, isTty)) {
		return null;
	}

	const state = readUpdateCheckState();
	if (
		state.lastCheckedAt !== null &&
		now - state.lastCheckedAt < UPDATE_CHECK_INTERVAL_MS
	) {
		return null;
	}

	const latestVersion = await getLatestVersionWithTimeout(
		options.fetchLatestVersion ?? fetchLatestCliVersion,
	);
	writeUpdateCheckState({ lastCheckedAt: now, latestVersion });

	const currentVersion = options.currentVersion ?? pkg.version;
	if (
		latestVersion !== null &&
		compareCliVersions(currentVersion, latestVersion) < 0
	) {
		return [
			`A newer rudel CLI is available: ${latestVersion} (current: ${currentVersion}).`,
			"Update with: npm install -g rudel@latest",
		].join("\n");
	}

	return null;
}

export function compareCliVersions(left: string, right: string): number {
	const leftParts = parseCliVersion(left);
	const rightParts = parseCliVersion(right);

	if (leftParts === null || rightParts === null) {
		return left.localeCompare(right);
	}

	for (let index = 0; index < leftParts.length; index += 1) {
		const leftPart = leftParts[index];
		const rightPart = rightParts[index];
		if (leftPart === undefined || rightPart === undefined) {
			return 0;
		}
		if (leftPart !== rightPart) {
			return leftPart - rightPart;
		}
	}

	return 0;
}

async function fetchLatestCliVersion(
	signal: AbortSignal,
): Promise<string | null> {
	const response = await fetch(NPM_LATEST_URL, {
		headers: { Accept: "application/json" },
		signal,
	});
	if (!response.ok) {
		return null;
	}

	const body: unknown = await response.json();
	return getStringProperty(isRecord(body) ? body : null, "version");
}

async function getLatestVersionWithTimeout(
	fetchLatestVersion: (signal: AbortSignal) => Promise<string | null>,
) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), UPDATE_CHECK_TIMEOUT_MS);
	try {
		return await fetchLatestVersion(controller.signal);
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

function shouldSkipUpdateCheck(
	commandName: string,
	env: NodeJS.ProcessEnv,
	isTty: boolean,
) {
	return (
		!isTty ||
		SKIPPED_COMMANDS.has(commandName) ||
		isTruthyEnv(env.CI) ||
		isTruthyEnv(env.RUDEL_NO_UPDATE_CHECK)
	);
}

function readUpdateCheckState(): UpdateCheckState {
	const path = getUpdateCheckPath();
	if (!existsSync(path)) {
		return { lastCheckedAt: null, latestVersion: null };
	}

	try {
		const body: unknown = JSON.parse(readFileSync(path, "utf8"));
		const record = isRecord(body) ? body : null;
		return {
			lastCheckedAt: getNumberProperty(record, "lastCheckedAt"),
			latestVersion: getStringProperty(record, "latestVersion"),
		};
	} catch {
		return { lastCheckedAt: null, latestVersion: null };
	}
}

function writeUpdateCheckState(state: UpdateCheckState) {
	mkdirSync(getConfigDir(), { recursive: true, mode: 0o700 });
	writeFileSync(getUpdateCheckPath(), JSON.stringify(state, null, 2), {
		mode: 0o600,
	});
}

function getConfigDir() {
	return process.env.RUDEL_CONFIG_DIR ?? join(homedir(), ".rudel");
}

function getUpdateCheckPath() {
	return join(getConfigDir(), UPDATE_CHECK_FILE);
}

function parseCliVersion(
	version: string,
): readonly [number, number, number] | null {
	const [majorText, minorText, patchAndPrereleaseText] = version
		.replace(/^v/, "")
		.split(".");
	if (
		majorText === undefined ||
		minorText === undefined ||
		patchAndPrereleaseText === undefined
	) {
		return null;
	}

	const patchText = patchAndPrereleaseText.split("-")[0];
	if (patchText === undefined) {
		return null;
	}

	const major = parseVersionPart(majorText);
	const minor = parseVersionPart(minorText);
	const patch = parseVersionPart(patchText);
	if (major === null || minor === null || patch === null) {
		return null;
	}

	return [major, minor, patch];
}

function parseVersionPart(value: string) {
	if (!/^\d+$/.test(value)) {
		return null;
	}
	return Number(value);
}

function isTruthyEnv(value: string | undefined) {
	return (
		value !== undefined && value !== "" && value !== "0" && value !== "false"
	);
}

function getStringProperty(
	record: Record<string, unknown> | null,
	key: string,
) {
	const value = record?.[key];
	return typeof value === "string" && value.length > 0 ? value : null;
}

function getNumberProperty(
	record: Record<string, unknown> | null,
	key: string,
) {
	const value = record?.[key];
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
