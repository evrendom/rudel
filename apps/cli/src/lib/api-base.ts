import { parseSafeApiBase, type SafeUrlResult } from "@rudel/api-routes";

const INSECURE_API_BASE_ENV_VAR = "RUDEL_ALLOW_INSECURE_API_BASE";
const TRUTHY_ENV_VALUES = ["1", "true", "yes", "on"];

/**
 * Escape hatch for automation that cannot easily change its argv (RUD-237).
 * Mirrors the `--allow-insecure-api-base` flag.
 */
export function allowsInsecureApiBaseFromEnv(): boolean {
	const raw = process.env[INSECURE_API_BASE_ENV_VAR]?.trim().toLowerCase();
	if (raw === undefined) {
		return false;
	}
	return TRUTHY_ENV_VALUES.includes(raw);
}

/**
 * Validate the API base that will receive the device code, the access token and
 * the minted ingest API key. Plaintext http: to a non-loopback host exposes all
 * three to a network attacker, so it requires an explicit opt-in.
 */
export function resolveApiBase(
	rawApiBase: string,
	allowInsecureFlag: boolean,
): SafeUrlResult {
	return parseSafeApiBase(rawApiBase, {
		allowPlaintext: allowInsecureFlag || allowsInsecureApiBaseFromEnv(),
	});
}

/**
 * Human-readable explanation for a rejected API base, including the opt-in hint
 * only when overriding would actually help — suggesting it for a `file:` URL or
 * a typo would just be misleading.
 */
export function describeApiBaseRejection(
	result: Extract<SafeUrlResult, { ok: false }>,
): string {
	if (result.reason !== "plaintext_non_loopback") {
		return result.detail;
	}
	return `${result.detail}. Pass --allow-insecure-api-base (or set ${INSECURE_API_BASE_ENV_VAR}=1) if this deployment really is plaintext.`;
}

/**
 * Warning for a credentials file written before the login-time check existed.
 *
 * Deliberately a warning rather than a refusal: someone who logged in over
 * plaintext http: should not be silently locked out of uploading by an upgrade.
 * Returns undefined when the stored base is fine.
 */
export function describeStoredApiBaseRisk(
	storedApiBase: string,
): string | undefined {
	// `allowPlaintext: false` so the risk is reported regardless of the opt-in;
	// this describes what was already persisted, not what is being chosen now.
	const result = parseSafeApiBase(storedApiBase, { allowPlaintext: false });
	if (result.ok || result.reason !== "plaintext_non_loopback") {
		return undefined;
	}
	return `Saved credentials use a plaintext API base (${storedApiBase}). Uploads and your API key are sent unencrypted. Run \`rudel logout\` then \`rudel login\` against an https:// base to fix this.`;
}
