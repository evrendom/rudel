import { isLoopbackHostname } from "../../packages/api-routes/src/index.js";
import { SCENARIOS, STUB_BASE_PLACEHOLDER } from "./scenarios.js";
import type { PlaygroundProfile, Scenario } from "./types.js";

type AllowedCommand =
	| "dev"
	| "disable"
	| "enable"
	| "hooks"
	| "login"
	| "logout"
	| "set-org"
	| "upload"
	| "whoami";

const COMMANDS_BY_PROFILE: Readonly<
	Record<PlaygroundProfile, readonly AllowedCommand[]>
> = {
	"local-real": ["dev", "disable", "enable", "set-org", "upload", "whoami"],
	fixture: [
		"dev",
		"disable",
		"enable",
		"hooks",
		"login",
		"logout",
		"set-org",
		"upload",
		"whoami",
	],
};

const SAFE_SCENARIO_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const URL_FLAGS = ["--api-base", "--endpoint"];
const ALLOWED_SCENARIO_ENV_KEYS = new Set(["NO_COLOR"]);

export function getScenario(name: string): Scenario {
	const scenario = SCENARIOS.find((candidate) => candidate.name === name);
	if (!scenario) {
		throw new Error(
			`Unknown scenario: ${name}. Choose one of: ${SCENARIOS.map((candidate) => candidate.name).join(", ")}`,
		);
	}
	return scenario;
}

export function parseScenarioInvocation(args: readonly string[]): Scenario {
	if (args.length !== 1 || !args[0]) {
		throw new Error(
			"Pass exactly one scenario name. Extra arguments are never forwarded to the CLI.",
		);
	}
	return getScenario(args[0]);
}

export function resolveScenarioArg(arg: string, stubBase: string): string {
	return arg.replaceAll(STUB_BASE_PLACEHOLDER, stubBase);
}

export function validateScenario(scenario: Scenario, stubBase: string): void {
	if (!SAFE_SCENARIO_NAME.test(scenario.name)) {
		throw new Error(`Scenario has an invalid name: ${scenario.name}`);
	}
	const [command] = scenario.argv;
	if (!isAllowedCommand(command)) {
		throw new Error(`Scenario ${scenario.name} has no recognized command`);
	}
	if (!COMMANDS_BY_PROFILE[scenario.profile].includes(command)) {
		throw new Error(
			`Command ${command} is forbidden in the ${scenario.profile} profile`,
		);
	}

	validateLoopbackUrl(stubBase, `stub base for ${scenario.name}`);
	for (let index = 0; index < scenario.argv.length; index++) {
		const argument = scenario.argv[index];
		if (!argument) continue;
		const matchingFlag = URL_FLAGS.find(
			(flag) => argument === flag || argument.startsWith(`${flag}=`),
		);
		if (!matchingFlag) continue;

		const inlineValue = argument.startsWith(`${matchingFlag}=`)
			? argument.slice(matchingFlag.length + 1)
			: undefined;
		const value = inlineValue ?? scenario.argv[index + 1];
		if (!value) {
			throw new Error(
				`${scenario.name} is missing a value for ${matchingFlag}`,
			);
		}
		validateLoopbackUrl(
			resolveScenarioArg(value, stubBase),
			`${matchingFlag} in ${scenario.name}`,
		);
	}

	for (const key of Object.keys(scenario.env)) {
		if (!ALLOWED_SCENARIO_ENV_KEYS.has(key)) {
			throw new Error(
				`${scenario.name} may not set unapproved environment value ${key}`,
			);
		}
	}
}

export function validateLoopbackUrl(value: string, label: string): URL {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`${label} must be a valid loopback URL`);
	}
	if (
		(url.protocol !== "http:" && url.protocol !== "https:") ||
		!isLoopbackHostname(url.hostname)
	) {
		throw new Error(`${label} must stay on loopback`);
	}
	return url;
}

function isAllowedCommand(value: string | undefined): value is AllowedCommand {
	return (
		value === "dev" ||
		value === "disable" ||
		value === "enable" ||
		value === "hooks" ||
		value === "login" ||
		value === "logout" ||
		value === "set-org" ||
		value === "upload" ||
		value === "whoami"
	);
}
