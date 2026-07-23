import { describe, expect, test } from "bun:test";
import {
	parseReleaseArgs,
	validateReleaseTagAtHead,
} from "./release-cli.js";

describe("parseReleaseArgs", () => {
	test("uses publish mode by default", () => {
		expect(parseReleaseArgs([])).toEqual({ dryRun: false });
	});

	test("accepts dry-run mode", () => {
		expect(parseReleaseArgs(["--dry-run"])).toEqual({ dryRun: true });
	});

	test("rejects version bump arguments", () => {
		expect(() => parseReleaseArgs(["patch"])).toThrow(
			"Unknown argument: patch. Usage: release-cli.ts [--dry-run]",
		);
	});
});

describe("validateReleaseTagAtHead", () => {
	test("returns the matching Release Please tag", () => {
		expect(validateReleaseTagAtHead("1.2.3", ["rudel@1.2.3"])).toBe(
			"rudel@1.2.3",
		);
	});

	test("rejects a mismatched release tag", () => {
		expect(() =>
			validateReleaseTagAtHead("1.2.3", ["rudel@1.2.2"]),
		).toThrow(
			"Release tag mismatch. Expected rudel@1.2.3 at HEAD; found: rudel@1.2.2.",
		);
	});

	test("rejects a commit with no release tag", () => {
		expect(() => validateReleaseTagAtHead("1.2.3", [])).toThrow(
			"Release tag mismatch. Expected rudel@1.2.3 at HEAD; found: none.",
		);
	});
});
