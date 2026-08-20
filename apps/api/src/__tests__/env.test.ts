import { afterEach, describe, expect, test } from "bun:test";
import {
	readBooleanEnv,
	readNonNegativeSafeIntegerEnv,
	readRequiredSecretEnv,
	readSkillAnalyticsCutoverConfig,
	readUsageEventAnalyticsCutoverConfig,
	shouldUsePersistentSkillAnalytics,
	shouldUseUsageEventAnalytics,
} from "../lib/env.js";

const TEST_SECRET_ENV_NAME = "RUDEL_TEST_REQUIRED_SECRET";
const TEST_BOOLEAN_ENV_NAME = "RUDEL_TEST_BOOLEAN";

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

describe("readBooleanEnv", () => {
	afterEach(() => {
		delete process.env[TEST_BOOLEAN_ENV_NAME];
	});

	test("uses the default and accepts explicit boolean strings", () => {
		expect(readBooleanEnv(TEST_BOOLEAN_ENV_NAME, true)).toBe(true);
		process.env[TEST_BOOLEAN_ENV_NAME] = "false";
		expect(readBooleanEnv(TEST_BOOLEAN_ENV_NAME, true)).toBe(false);
		process.env[TEST_BOOLEAN_ENV_NAME] = "true";
		expect(readBooleanEnv(TEST_BOOLEAN_ENV_NAME, false)).toBe(true);
	});

	test("fails closed for ambiguous values", () => {
		for (const invalidValue of ["1", "FALSE", "yes", ""]) {
			process.env[TEST_BOOLEAN_ENV_NAME] = invalidValue;
			expect(() => readBooleanEnv(TEST_BOOLEAN_ENV_NAME, true)).toThrow(
				`${TEST_BOOLEAN_ENV_NAME} must be either "true" or "false"`,
			);
		}
	});
});

describe("usage-event analytics cutover configuration", () => {
	test("fails closed for missing, empty, and invalid modes", () => {
		for (const mode of [undefined, "", "enabled", "ALL"]) {
			const config = readUsageEventAnalyticsCutoverConfig({
				USAGE_EVENT_ANALYTICS_CUTOVER_MODE: mode,
			});

			expect(config.mode).toBe("off");
			expect(shouldUseUsageEventAnalytics("org-owner", config)).toBe(false);
		}
	});

	test("keeps an empty canary list off", () => {
		for (const canaryIds of [undefined, "", " ,  "]) {
			const config = readUsageEventAnalyticsCutoverConfig({
				USAGE_EVENT_ANALYTICS_CANARY_ORG_IDS: canaryIds,
				USAGE_EVENT_ANALYTICS_CUTOVER_MODE: "canary",
			});

			expect(config.mode).toBe("off");
			expect(shouldUseUsageEventAnalytics("org-owner", config)).toBe(false);
		}
	});

	test("routes only normalized canary organization IDs", () => {
		const config = readUsageEventAnalyticsCutoverConfig({
			USAGE_EVENT_ANALYTICS_CANARY_ORG_IDS: " org-owner,org-second,org-owner ",
			USAGE_EVENT_ANALYTICS_CUTOVER_MODE: "canary",
		});

		expect(config.mode).toBe("canary");
		expect([...config.canaryOrganizationIds]).toEqual([
			"org-owner",
			"org-second",
		]);
		expect(shouldUseUsageEventAnalytics("org-owner", config)).toBe(true);
		expect(shouldUseUsageEventAnalytics("org-third", config)).toBe(false);
	});

	test("routes every organization only in all mode", () => {
		const config = readUsageEventAnalyticsCutoverConfig({
			USAGE_EVENT_ANALYTICS_CANARY_ORG_IDS: "org-owner",
			USAGE_EVENT_ANALYTICS_CUTOVER_MODE: "all",
		});

		expect(config.mode).toBe("all");
		expect(shouldUseUsageEventAnalytics("org-owner", config)).toBe(true);
		expect(shouldUseUsageEventAnalytics("org-third", config)).toBe(true);
	});
});

describe("skill analytics cutover configuration", () => {
	test("fails closed unless all or a non-empty canary is explicit", () => {
		for (const mode of [undefined, "", "enabled", "ALL"]) {
			const config = readSkillAnalyticsCutoverConfig({
				SKILL_ANALYTICS_CUTOVER_MODE: mode,
			});
			expect(config.mode).toBe("off");
			expect(shouldUsePersistentSkillAnalytics("org-a", config)).toBe(false);
		}
		const emptyCanary = readSkillAnalyticsCutoverConfig({
			SKILL_ANALYTICS_CANARY_ORG_IDS: " , ",
			SKILL_ANALYTICS_CUTOVER_MODE: "canary",
		});
		expect(emptyCanary.mode).toBe("off");
	});

	test("routes normalized canaries and all mode", () => {
		const canary = readSkillAnalyticsCutoverConfig({
			SKILL_ANALYTICS_CANARY_ORG_IDS: " org-a,org-b,org-a ",
			SKILL_ANALYTICS_CUTOVER_MODE: "canary",
		});
		expect([...canary.canaryOrganizationIds]).toEqual(["org-a", "org-b"]);
		expect(shouldUsePersistentSkillAnalytics("org-a", canary)).toBe(true);
		expect(shouldUsePersistentSkillAnalytics("org-c", canary)).toBe(false);

		const all = readSkillAnalyticsCutoverConfig({
			SKILL_ANALYTICS_CUTOVER_MODE: "all",
		});
		expect(shouldUsePersistentSkillAnalytics("org-c", all)).toBe(true);
	});
});
