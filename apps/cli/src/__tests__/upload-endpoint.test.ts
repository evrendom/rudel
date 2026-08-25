import { afterEach, describe, expect, test } from "bun:test";
import {
	parseSafeApiEndpoint,
	type SafeUrlResult,
} from "../contracts/index.js";
import {
	allowsInsecureEndpoint,
	allowsInsecureEndpointFromEnv,
	describeUploadEndpointRejection,
} from "../lib/upload-endpoint.js";

const ENDPOINT_ENV_VAR = "RUDEL_ALLOW_INSECURE_ENDPOINT";
const API_BASE_ENV_VAR = "RUDEL_ALLOW_INSECURE_API_BASE";
const originalEndpointEnv = process.env[ENDPOINT_ENV_VAR];
const originalApiBaseEnv = process.env[API_BASE_ENV_VAR];

afterEach(() => {
	if (originalEndpointEnv === undefined) {
		delete process.env[ENDPOINT_ENV_VAR];
	} else {
		process.env[ENDPOINT_ENV_VAR] = originalEndpointEnv;
	}
	if (originalApiBaseEnv === undefined) {
		delete process.env[API_BASE_ENV_VAR];
	} else {
		process.env[API_BASE_ENV_VAR] = originalApiBaseEnv;
	}
});

function rejection(
	result: SafeUrlResult,
): Extract<SafeUrlResult, { ok: false }> {
	if (result.ok) {
		throw new Error(`expected rejection, got accepted URL: ${result.url}`);
	}
	return result;
}

describe("allowsInsecureEndpoint", () => {
	test.each(["1", "true", "TRUE", "yes", "on"])(
		"accepts the endpoint-specific env opt-in %p",
		(value) => {
			process.env[ENDPOINT_ENV_VAR] = value;

			expect(allowsInsecureEndpointFromEnv()).toBe(true);
			expect(allowsInsecureEndpoint(false)).toBe(true);
		},
	);

	test("accepts the endpoint-specific command flag", () => {
		delete process.env[ENDPOINT_ENV_VAR];

		expect(allowsInsecureEndpoint(true)).toBe(true);
	});

	test("does not reuse the API-base opt-in", () => {
		delete process.env[ENDPOINT_ENV_VAR];
		process.env[API_BASE_ENV_VAR] = "1";

		expect(allowsInsecureEndpoint(false)).toBe(false);
	});
});

describe("describeUploadEndpointRejection", () => {
	test("offers the upload opt-in for plaintext non-loopback endpoints", () => {
		const result = rejection(
			parseSafeApiEndpoint("http://evil.example/rpc", {
				allowPlaintext: false,
			}),
		);

		expect(describeUploadEndpointRejection(result)).toContain(
			"--allow-insecure-endpoint",
		);
		expect(describeUploadEndpointRejection(result)).toContain(
			"OPALINE_ALLOW_INSECURE_ENDPOINT=1",
		);
		expect(describeUploadEndpointRejection(result)).toContain(
			"--allow-insecure-api-base",
		);
	});

	test.each([
		"file:///etc/passwd",
		"http://user:pass@evil.example/rpc",
		"not a url",
	])("does not offer a useless opt-in for %p", (input) => {
		const result = rejection(
			parseSafeApiEndpoint(input, {
				allowPlaintext: true,
			}),
		);

		expect(describeUploadEndpointRejection(result)).not.toContain(
			"--allow-insecure-endpoint",
		);
	});
});
