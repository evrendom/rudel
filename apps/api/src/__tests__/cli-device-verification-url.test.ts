import { afterEach, describe, expect, test } from "bun:test";
import { readCliDeviceVerificationUrl } from "../lib/env.js";

const ENV_VAR = "CLI_DEVICE_VERIFICATION_URL";
const originalEnvValue = process.env[ENV_VAR];

afterEach(() => {
	if (originalEnvValue === undefined) {
		delete process.env[ENV_VAR];
	} else {
		process.env[ENV_VAR] = originalEnvValue;
	}
});

describe("readCliDeviceVerificationUrl: derived from ALLOWED_ORIGIN", () => {
	test("accepts an https origin without a warning", () => {
		delete process.env[ENV_VAR];
		const config = readCliDeviceVerificationUrl("https://app.rudel.ai");

		expect(config.url).toBe("https://app.rudel.ai/device");
		expect(config.warning).toBeUndefined();
	});

	test.each([
		"http://localhost:4011",
		"http://127.0.0.1:4011",
	])("accepts loopback %p without a warning", (origin) => {
		delete process.env[ENV_VAR];
		const config = readCliDeviceVerificationUrl(origin);

		expect(config.url).toBe(`${origin}/device`);
		expect(config.warning).toBeUndefined();
	});

	test("warns rather than refusing to boot on a plaintext deployment", () => {
		// A plaintext internal deployment is a deliberate operator choice, so the
		// API must still start; failing here would make self-hosting impossible.
		delete process.env[ENV_VAR];
		const config = readCliDeviceVerificationUrl("http://rudel.internal");

		expect(config.url).toBe("http://rudel.internal/device");
		expect(config.warning).toContain("plaintext");
		expect(config.warning).toContain("--allow-insecure-api-base");
		expect(config.warning).toContain("ALLOWED_ORIGIN");
	});
});

describe("readCliDeviceVerificationUrl: explicit env var", () => {
	test("prefers the explicit value over the fallback origin", () => {
		process.env[ENV_VAR] = "https://login.rudel.ai/device";

		expect(readCliDeviceVerificationUrl("https://app.rudel.ai").url).toBe(
			"https://login.rudel.ai/device",
		);
	});

	test("names the explicit variable in the plaintext warning", () => {
		process.env[ENV_VAR] = "http://rudel.internal/device";
		const config = readCliDeviceVerificationUrl("https://app.rudel.ai");

		expect(config.warning).toContain(ENV_VAR);
	});

	test.each([
		"javascript:alert(1)//",
		"file:///etc/passwd",
		"not a url",
		"https://app.rudel.ai@evil.example/device",
	])("throws at boot for %p", (value) => {
		process.env[ENV_VAR] = value;

		expect(() => readCliDeviceVerificationUrl("https://app.rudel.ai")).toThrow(
			/CLI device verification URL/,
		);
	});
});
