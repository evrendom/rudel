import type { SafeUrlResult } from "@rudel/api-routes";

const INSECURE_ENDPOINT_ENV_VAR = "RUDEL_ALLOW_INSECURE_ENDPOINT";
const TRUTHY_ENV_VALUES = ["1", "true", "yes", "on"];

/**
 * Escape hatch for unattended hooks and other automation that cannot change
 * argv. Deliberately separate from RUDEL_ALLOW_INSECURE_API_BASE: login and
 * transcript upload accept different risks and URL shapes.
 */
export function allowsInsecureEndpointFromEnv(): boolean {
	const raw = process.env[INSECURE_ENDPOINT_ENV_VAR]?.trim().toLowerCase();
	if (raw === undefined) {
		return false;
	}
	return TRUTHY_ENV_VALUES.includes(raw);
}

/** Resolve the upload-specific flag and environment opt-in once per caller. */
export function allowsInsecureEndpoint(allowInsecureFlag: boolean): boolean {
	return allowInsecureFlag || allowsInsecureEndpointFromEnv();
}

/**
 * Explain why an authenticated upload destination was refused, including the
 * opt-in only for the one rejection it can override.
 */
export function describeUploadEndpointRejection(
	result: Extract<SafeUrlResult, { ok: false }>,
): string {
	if (result.reason !== "plaintext_non_loopback") {
		return result.detail;
	}
	return `${result.detail}. Pass --allow-insecure-endpoint (or set ${INSECURE_ENDPOINT_ENV_VAR}=1) if this upload destination really is plaintext.`;
}
