import { describe, expect, test } from "bun:test";
import { compareVersions } from "../commands/doctor.js";

describe("doctor version comparison", () => {
	test("orders semantic versions", () => {
		expect(compareVersions("0.4.0", "0.3.0")).toBe(1);
		expect(compareVersions("0.4.0", "0.4.0")).toBe(0);
		expect(compareVersions("0.3.9", "0.4.0")).toBe(-1);
	});

	test("rejects malformed versions", () => {
		expect(compareVersions("dev", "0.4.0")).toBeNull();
	});
});
