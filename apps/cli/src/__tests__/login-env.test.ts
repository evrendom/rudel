import { afterEach, describe, expect, test } from "bun:test";
import { getDefaultApiBase } from "../commands/login.js";

const originalApiBase = process.env.RUDEL_API_BASE;

afterEach(() => {
	if (originalApiBase === undefined) {
		delete process.env.RUDEL_API_BASE;
	} else {
		process.env.RUDEL_API_BASE = originalApiBase;
	}
});

describe("login environment defaults", () => {
	test("defaults to production when no local override is configured", () => {
		delete process.env.RUDEL_API_BASE;

		expect(getDefaultApiBase()).toBe("https://app.rudel.ai");
	});

	test("uses RUDEL_API_BASE for local device login", () => {
		process.env.RUDEL_API_BASE = "http://localhost:4010";

		expect(getDefaultApiBase()).toBe("http://localhost:4010");
	});
});
