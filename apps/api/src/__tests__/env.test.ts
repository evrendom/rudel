import { afterEach, describe, expect, test } from "bun:test";
import { readRequiredSecretEnv } from "../lib/env.js";

const TEST_SECRET_ENV_NAME = "RUDEL_TEST_REQUIRED_SECRET";

describe("readRequiredSecretEnv", () => {
	afterEach(() => {
		delete process.env[TEST_SECRET_ENV_NAME];
	});

	test("accepts and trims a secret at the minimum length", () => {
		const secret = "a".repeat(32);
		process.env[TEST_SECRET_ENV_NAME] = ` ${secret} `;

		expect(readRequiredSecretEnv(TEST_SECRET_ENV_NAME, 32)).toBe(secret);
	});

	test("fails closed when the secret is absent, empty, or too short", () => {
		for (const invalidValue of [undefined, "", "   ", "a".repeat(31)]) {
			if (invalidValue === undefined) {
				delete process.env[TEST_SECRET_ENV_NAME];
			} else {
				process.env[TEST_SECRET_ENV_NAME] = invalidValue;
			}

			expect(() => readRequiredSecretEnv(TEST_SECRET_ENV_NAME, 32)).toThrow(
				`${TEST_SECRET_ENV_NAME} must be set to at least 32 characters`,
			);
		}
	});
});
