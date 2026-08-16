import { describe, expect, test } from "bun:test";
import {
	resolveSessionErrorCount,
	resolveSessionSubagentCount,
} from "./session-overview-metrics";

describe("session overview metric compatibility", () => {
	test("keeps the authoritative subagent count when the API provides it", () => {
		expect(resolveSessionSubagentCount(4, ["reviewer", "tester"])).toBe(4);
	});

	test("falls back to legacy subagent types when the count is absent", () => {
		expect(resolveSessionSubagentCount(undefined, ["reviewer", "tester"])).toBe(
			2,
		);
	});

	test("treats an absent legacy error count as zero", () => {
		expect(resolveSessionErrorCount(undefined)).toBe(0);
	});
});
