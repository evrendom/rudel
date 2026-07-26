import type { SafeUrlResult } from "@rudel/api-routes";
import {
	describeUrlRejectionWithOptIn,
	hasTruthyEnvironmentValue,
	resolveInsecureUrlOptIn,
} from "./insecure-url-opt-in.js";

const INSECURE_ENDPOINT_ENV_VAR = "RUDEL_ALLOW_INSECURE_ENDPOINT";

/**
 * Escape hatch for unattended hooks and other automation that cannot change
 * argv. Deliberately separate from RUDEL_ALLOW_INSECURE_API_BASE: login and
 * transcript upload accept different risks and URL shapes.
 */
export function allowsInsecureEndpointFromEnv(): boolean {
	return hasTruthyEnvironmentValue(process.env[INSECURE_ENDPOINT_ENV_VAR]);
}

/** Resolve the upload-specific flag and environment opt-in once per caller. */
export function allowsInsecureEndpoint(allowInsecureFlag: boolean): boolean {
	return resolveInsecureUrlOptIn(
		allowInsecureFlag,
		process.env[INSECURE_ENDPOINT_ENV_VAR],
	);
}

/**
 * Explain why an authenticated upload destination was refused, including the
 * opt-in only for the one rejection it can override.
 */
export function describeUploadEndpointRejection(
	result: Extract<SafeUrlResult, { ok: false }>,
): string {
	return describeUrlRejectionWithOptIn(
		result,
		`Pass --allow-insecure-endpoint (or set ${INSECURE_ENDPOINT_ENV_VAR}=1) if this upload destination really is plaintext. This does not opt login or other API-base traffic into --allow-insecure-api-base.`,
	);
}
