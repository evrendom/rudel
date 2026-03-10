import { describe, expect, test } from "bun:test";
import {
	applyRetentionPolicy,
	applySubagentRetentionPolicy,
	retainContent,
} from "./retention.js";

describe("retention helpers", () => {
	test("retains full content by default", () => {
		expect(retainContent("a\nb", "full", 1)).toBe("a\nb");
	});

	test("drops content entirely in none mode", () => {
		expect(retainContent("a\nb", "none", 100)).toBe("");
	});

	test("truncates on line boundaries", () => {
		expect(retainContent("one\ntwo\nthree", "truncate", 7)).toBe("one\ntwo");
		expect(retainContent("one\ntwo\nthree", "truncate", 8)).toBe("one\ntwo");
	});

	test("applies transcript and subagent policy wrappers", () => {
		expect(
			applyRetentionPolicy("hello", {
				transcriptMode: "truncate",
				transcriptMaxBytes: 4,
			}),
		).toBe("");
		expect(
			applySubagentRetentionPolicy("hello", {
				subagentMode: "none",
				subagentMaxBytes: 100,
			}),
		).toBe("");
	});
});
