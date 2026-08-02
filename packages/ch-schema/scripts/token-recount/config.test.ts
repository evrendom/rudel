import { describe, expect, test } from "bun:test";
import { parseCliArguments, resolveReadonlyConnection } from "./config.js";

describe("token recount CLI configuration", () => {
	test("parses bounded defaults and explicit finding gates", () => {
		const result = parseCliArguments(
			[
				"--organization-id",
				"owner-one",
				"--expect-findings",
				"H1,M9",
				"--require-zero-diff",
				"--require-feature-anchors",
			],
			"/workspace",
			{},
		);

		expect(result.kind).toBe("run");
		if (result.kind !== "run") throw new Error("expected runnable options");
		expect(result.options.lookbackDays).toBe(30);
		expect(result.options.sampleSizePerSource).toBe(100);
		expect(result.options.expectedFindings).toEqual(["H1", "M9"]);
		expect(result.options.requireZeroDiff).toBe(true);
		expect(result.options.requireFeatureAnchors).toBe(true);
		expect(result.options.anchorFile).toBe(
			"/workspace/.context/token-recount-anchors.json",
		);
	});

	test("fails closed for unscoped or out-of-bounds runs", () => {
		expect(() => parseCliArguments([], "/workspace", {})).toThrow(
			"--organization-id",
		);
		expect(() =>
			parseCliArguments(
				["--organization-id", "owner", "--lookback-days", "366"],
				"/workspace",
				{},
			),
		).toThrow("1 to 365");
	});

	test("requires a least-privilege HTTPS production identity", () => {
		expect(() =>
			resolveReadonlyConnection("prod", {
				CLICKHOUSE_READONLY_URL: "http://example.com:8123",
				CLICKHOUSE_READONLY_USERNAME: "readonly",
				CLICKHOUSE_READONLY_PASSWORD: "secret",
			}),
		).toThrow("HTTPS");
		expect(() =>
			resolveReadonlyConnection("prod", {
				CLICKHOUSE_READONLY_URL: "https://example.com:8443",
				CLICKHOUSE_READONLY_USERNAME: "default",
				CLICKHOUSE_READONLY_PASSWORD: "secret",
			}),
		).toThrow("default");
	});

	test("keeps the local profile on loopback", () => {
		expect(resolveReadonlyConnection("local", {})).toEqual({
			url: "http://localhost:8123",
			username: "default",
			password: "clickhouse",
		});
		expect(() =>
			resolveReadonlyConnection("local", {
				CLICKHOUSE_URL: "https://remote.example.com",
			}),
		).toThrow("loopback");
	});
});
