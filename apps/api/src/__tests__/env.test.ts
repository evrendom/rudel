import { afterEach, describe, expect, test } from "bun:test";
import {
	readNonNegativeSafeIntegerEnv,
	readRequiredSecretEnv,
} from "../lib/env.js";

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

describe("readNonNegativeSafeIntegerEnv", () => {
	const envName = "TEST_NON_NEGATIVE_INTEGER";

	afterEach(() => {
		delete process.env[envName];
	});

	test("uses the default when the variable is absent", () => {
		expect(readNonNegativeSafeIntegerEnv(envName, 0)).toBe(0);
	});

	test("accepts zero and positive safe integers", () => {
		process.env[envName] = "0";
		expect(readNonNegativeSafeIntegerEnv(envName, 4)).toBe(0);

		process.env[envName] = "3";
		expect(readNonNegativeSafeIntegerEnv(envName, 4)).toBe(3);
	});

	test("rejects invalid values", () => {
		for (const invalidValue of [
			"",
			"-1",
			"1.5",
			"abc",
			"Infinity",
			"9007199254740992",
		]) {
			process.env[envName] = invalidValue;
			expect(() => readNonNegativeSafeIntegerEnv(envName, 0)).toThrow(
				`${envName} must be a non-negative safe integer`,
			);
		}
	});
});
