import type { SafeUrlResult } from "@rudel/api-routes";

const TRUTHY_ENV_VALUES = ["1", "true", "yes", "on"];

/** Resolve a command flag and its matching environment opt-in. */
export function resolveInsecureUrlOptIn(
	allowInsecureFlag: boolean,
	environmentValue: string | undefined,
): boolean {
	return allowInsecureFlag || hasTruthyEnvironmentValue(environmentValue);
}

/** Add an opt-in hint only when it can override the rejection. */
export function describeUrlRejectionWithOptIn(
	result: Extract<SafeUrlResult, { ok: false }>,
	optInHint: string,
): string {
	if (result.reason !== "plaintext_non_loopback") {
		return result.detail;
	}
	return `${result.detail}. ${optInHint}`;
}

/** Interpret the repository's supported truthy environment values. */
export function hasTruthyEnvironmentValue(value: string | undefined): boolean {
	const normalized = value?.trim().toLowerCase();
	if (normalized === undefined) {
		return false;
	}
	return TRUTHY_ENV_VALUES.includes(normalized);
}
