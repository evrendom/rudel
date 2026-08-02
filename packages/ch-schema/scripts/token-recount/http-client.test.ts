import { describe, expect, test } from "bun:test";
import { validateReadonlyQuery } from "./http-client.js";

describe("token recount read-only ClickHouse client", () => {
	test("accepts bounded read query shapes", () => {
		expect(validateReadonlyQuery("SELECT 1;")).toBe("SELECT 1");
		expect(validateReadonlyQuery("WITH 1 AS value SELECT value")).toBe(
			"WITH 1 AS value SELECT value",
		);
		expect(validateReadonlyQuery("EXPLAIN ESTIMATE SELECT 1")).toBe(
			"EXPLAIN ESTIMATE SELECT 1",
		);
	});

	test("rejects mutations, multiple statements, and external table functions", () => {
		expect(() => validateReadonlyQuery("DELETE FROM rudel.sessions")).toThrow();
		expect(() => validateReadonlyQuery("SELECT 1; SELECT 2")).toThrow();
		expect(() => validateReadonlyQuery("SELECT * FROM s3('bucket')")).toThrow();
		expect(() =>
			validateReadonlyQuery("SELECT * INTO OUTFILE '/tmp/result'"),
		).toThrow();
	});
});
