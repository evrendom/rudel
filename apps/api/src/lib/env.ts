import { isLoopbackHostname, parseSafeBrowserUrl } from "@rudel/api-routes";

const MINIMUM_AUTH_SECRET_LENGTH = 32;

export interface CliDeviceVerificationUrlConfig {
	url: string;
	/** Non-fatal configuration concern for the caller to log. */
	warning: string | undefined;
}

/**
 * Append `/device` to the CORS origin, which by definition carries no path,
 * query or fragment.
 *
 * String-concatenating a non-bare origin corrupts the result rather than failing
 * — `https://app.rudel.ai?tenant=acme` would become
 * `https://app.rudel.ai/?tenant=acme/device`, and a fragment swallows `/device`
 * entirely. Reject at boot instead, consistent with this file's fail-fast
 * doctrine, and build the path with the URL API rather than by concatenation.
 */
function deriveVerificationUrlFromOrigin(fallbackOrigin: string): string {
	let parsed: URL;
	try {
		parsed = new URL(fallbackOrigin);
	} catch {
		throw new Error(
			`ALLOWED_ORIGIN must be an absolute URL (got "${fallbackOrigin}")`,
		);
	}

	if (parsed.search !== "" || parsed.hash !== "" || parsed.pathname !== "/") {
		throw new Error(
			`ALLOWED_ORIGIN must be a bare origin with no path, query string or fragment (got "${fallbackOrigin}"). Set CLI_DEVICE_VERIFICATION_URL explicitly if the device page is not at /device on that origin.`,
		);
	}

	return new URL("/device", parsed).toString();
}

/**
 * Resolve the URL the CLI is told to open to approve a device authorization.
 *
 * This value is handed to every CLI client and opened in a browser there, so a
 * misconfigured deployment must fail at boot rather than shipping an unopenable
 * — or hostile — URL to users (RUD-203). Neither this env var nor the
 * `ALLOWED_ORIGIN` it falls back to was previously validated, and better-auth
 * normalizes the value without applying any scheme allowlist.
 *
 * A plaintext http: origin is a deliberate operator choice for an internal
 * deployment, so it warns rather than refusing to boot. A malformed value, a
 * non-http scheme or embedded credentials are always fatal.
 */
export function readCliDeviceVerificationUrl(
	fallbackOrigin: string,
): CliDeviceVerificationUrlConfig {
	const explicit = process.env.CLI_DEVICE_VERIFICATION_URL;
	const source =
		explicit === undefined ? "ALLOWED_ORIGIN" : "CLI_DEVICE_VERIFICATION_URL";
	const result = parseSafeBrowserUrl(
		explicit ?? deriveVerificationUrlFromOrigin(fallbackOrigin),
		{ allowPlaintext: true },
	);
	if (!result.ok) {
		throw new Error(
			`The CLI device verification URL derived from ${source} is invalid: ${result.detail}`,
		);
	}

	const parsed = new URL(result.url);
	const isPlaintext =
		parsed.protocol === "http:" && !isLoopbackHostname(parsed.hostname);

	return {
		url: result.url,
		warning: isPlaintext
			? `The CLI device verification URL derived from ${source} uses plaintext http: (${result.url}). CLI users must pass --allow-insecure-api-base to log in, and their credentials will cross the network unencrypted. Serve this deployment over HTTPS instead.`
			: undefined,
	};
}

export function readBetterAuthSecret(): string {
	return readRequiredSecretEnv(
		"BETTER_AUTH_SECRET",
		MINIMUM_AUTH_SECRET_LENGTH,
	);
}

export function readBooleanEnv(name: string, defaultValue: boolean): boolean {
	const rawValue = process.env[name];
	if (rawValue === undefined) {
		return defaultValue;
	}
	if (rawValue === "true") {
		return true;
	}
	if (rawValue === "false") {
		return false;
	}
	throw new Error(`${name} must be either "true" or "false"`);
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

export function readNonNegativeSafeIntegerEnv(
	name: string,
	defaultValue: number,
): number {
	const rawValue = process.env[name];
	if (rawValue === undefined) {
		return defaultValue;
	}

	if (rawValue.trim() === "") {
		throw new Error(`${name} must be a non-negative safe integer`);
	}

	const parsedValue = Number(rawValue);
	if (!Number.isSafeInteger(parsedValue) || parsedValue < 0) {
		throw new Error(`${name} must be a non-negative safe integer`);
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
