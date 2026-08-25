import { parseSafeApiBase, type SafeUrlResult } from "../contracts/index.js";
import { loadCredentials } from "./credentials.js";
import {
	describeUrlRejectionWithOptIn,
	hasTruthyEnvironmentValue,
	resolveInsecureUrlOptIn,
} from "./insecure-url-opt-in.js";

const INSECURE_API_BASE_ENV_VAR = "OPALINE_ALLOW_INSECURE_API_BASE";
const LEGACY_INSECURE_API_BASE_ENV_VAR = "RUDEL_ALLOW_INSECURE_API_BASE";

/**
 * Escape hatch for automation that cannot easily change its argv (RUD-237).
 * Mirrors the `--allow-insecure-api-base` flag.
 */
export function allowsInsecureApiBaseFromEnv(): boolean {
	return hasTruthyEnvironmentValue(getInsecureApiBaseEnvironmentValue());
}

/**
 * Whether this invocation has accepted plaintext http: to a non-loopback host,
 * via either the flag or the env var.
 *
 * Callers should resolve this once and thread it through every check in the
 * flow: the API base and the verification URL must agree, or a plaintext
 * self-hosted deployment passes one gate and fails the other.
 */
export function allowsPlaintext(allowInsecureFlag: boolean): boolean {
	return resolveInsecureUrlOptIn(
		allowInsecureFlag,
		getInsecureApiBaseEnvironmentValue(),
	);
}

/**
 * Validate the API base that will receive the device code, the access token and
 * the minted ingest API key. Plaintext http: to a non-loopback host exposes all
 * three to a network attacker, so it requires an explicit opt-in.
 */
export function resolveApiBase(
	rawApiBase: string,
	allowPlaintext: boolean,
): SafeUrlResult {
	return parseSafeApiBase(rawApiBase, { allowPlaintext });
}

/**
 * Human-readable explanation for a rejected API base, including the opt-in hint
 * only when overriding would actually help — suggesting it for a `file:` URL or
 * a typo would just be misleading.
 */
export function describeApiBaseRejection(
	result: Extract<SafeUrlResult, { ok: false }>,
): string {
	return describeUrlRejectionWithOptIn(
		result,
		`Pass --allow-insecure-api-base (or set ${INSECURE_API_BASE_ENV_VAR}=1) if this deployment really is plaintext. This does not opt transcript uploads into --allow-insecure-endpoint.`,
	);
}

function getInsecureApiBaseEnvironmentValue(): string | undefined {
	return (
		process.env[INSECURE_API_BASE_ENV_VAR] ??
		process.env[LEGACY_INSECURE_API_BASE_ENV_VAR]
	);
}

/**
 * Warning about the API base in the saved credentials file, or undefined when
 * there is nothing to report.
 *
 * Reads credentials directly so interactive commands can surface this *before*
 * any request carries the stored token to that base — the warning is worthless
 * if it prints after the credential has already crossed the network.
 */
export function describeSavedCredentialsApiBaseRisk(): string | undefined {
	const credentials = loadCredentials();
	if (!credentials) {
		return undefined;
	}
	return describeStoredApiBaseRisk(credentials.apiBaseUrl);
}

/**
 * Shared body of the stored-plaintext warning, with a caller-supplied
 * remediation sentence. Returns undefined when the stored base is fine.
 *
 * Deliberately a warning rather than a refusal: someone who logged in over
 * plaintext http: should not be silently locked out by an upgrade.
 */
function describePlaintextStoredBase(
	storedApiBase: string,
	remediation: string,
): string | undefined {
	// `allowPlaintext: false` so the risk is reported regardless of the opt-in;
	// this describes what was already persisted, not what is being chosen now.
	const result = parseSafeApiBase(storedApiBase, { allowPlaintext: false });
	if (result.ok || result.reason !== "plaintext_non_loopback") {
		return undefined;
	}
	return `Saved credentials use a plaintext API base (${storedApiBase}), so the stored API key crosses the network unencrypted. ${remediation}`;
}

/** Warning for commands that will keep using the stored base. */
export function describeStoredApiBaseRisk(
	storedApiBase: string,
): string | undefined {
	return describePlaintextStoredBase(
		storedApiBase,
		"Run `opaline logout` then `opaline login` against an https:// base to fix this.",
	);
}

/**
 * Warning for `logout`, where "log out and log back in" is nonsense advice.
 *
 * Deliberately does not mention `--local-only`: leaving a live key valid on the
 * server is strictly worse than revoking it over the same plaintext connection
 * the key has already traversed.
 */
export function describeLogoutApiBaseRisk(
	storedApiBase: string,
): string | undefined {
	return describePlaintextStoredBase(
		storedApiBase,
		"Revoking it now reuses that plaintext connection, which is still better than leaving the key valid on the server.",
	);
}
