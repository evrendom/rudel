import { parseSafeBrowserUrl } from "@rudel/api-routes";

const MINIMUM_AUTH_SECRET_LENGTH = 32;

/**
 * Resolve the URL the CLI is told to open to approve a device authorization.
 *
 * This value is handed to every CLI client and opened in a browser there, so a
 * misconfigured deployment must fail at boot rather than shipping an unopenable
 * — or hostile — URL to users (RUD-203). Neither this env var nor the
 * `ALLOWED_ORIGIN` it falls back to was previously validated, and better-auth
 * normalizes the value without applying any scheme allowlist.
 */
export function readCliDeviceVerificationUrl(fallbackOrigin: string): string {
	const explicit = process.env.CLI_DEVICE_VERIFICATION_URL;
	const source =
		explicit === undefined ? "ALLOWED_ORIGIN" : "CLI_DEVICE_VERIFICATION_URL";
	const result = parseSafeBrowserUrl(explicit ?? `${fallbackOrigin}/device`);
	if (!result.ok) {
		throw new Error(
			`The CLI device verification URL derived from ${source} is invalid: ${result.detail}`,
		);
	}

	return result.url;
}

export function readBetterAuthSecret(): string {
	return readRequiredSecretEnv(
		"BETTER_AUTH_SECRET",
		MINIMUM_AUTH_SECRET_LENGTH,
	);
}

export function readPositiveSafeIntegerEnv(
	name: string,
	defaultValue: number,
): number {
	const rawValue = process.env[name];
	if (rawValue === undefined) {
		return defaultValue;
	}

	const parsedValue = Number(rawValue);
	if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
		throw new Error(`${name} must be a positive safe integer`);
	}

	return parsedValue;
}

export function readRequiredSecretEnv(
	name: string,
	minimumLength: number,
): string {
	const value = process.env[name]?.trim();
	if (!value || value.length < minimumLength) {
		throw new Error(
			`${name} must be set to at least ${minimumLength} characters`,
		);
	}

	return value;
}
