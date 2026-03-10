import { describe, expect, test } from "bun:test";
import { escapeString } from "../clickhouse.js";

describe("escapeString", () => {
	test("escapes backslashes before quotes", () => {
		expect(escapeString(String.raw`abc\'def`)).toBe(String.raw`abc\\\'def`);
	});

	test("escapes control characters used in ClickHouse string literals", () => {
		expect(escapeString("line1\nline2\r\t\0")).toBe(
			String.raw`line1\nline2\r\t\0`,
		);
	});
});
