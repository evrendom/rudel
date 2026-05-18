import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
	addOptionalStringEqFilter,
	addOptionalStringInFilter,
	buildAbsoluteDateFilter,
	buildClickHouseInsertQuery,
	buildDateFilter,
	getSafeClickHouseTable,
} from "../clickhouse.js";

describe("clickhouse helpers", () => {
	test("keeps malicious scalar values out of SQL text", () => {
		const where: string[] = [];
		const query_params: Record<string, unknown> = {};
		const payload = "abc'\\\\\n--\u2028";

		addOptionalStringEqFilter(
			where,
			query_params,
			"session_id",
			"sessionId",
			payload,
		);

		expect(where).toEqual(["session_id = {sessionId:String}"]);
		expect(query_params).toEqual({ sessionId: payload });
		expect(where.join(" ")).not.toContain(payload);
	});

	test("parameterizes every value in IN filters", () => {
		const where: string[] = [];
		const query_params: Record<string, unknown> = {};
		const values = ["one' OR 1=1", "two\\\\\n", "three\u2028"];

		addOptionalStringInFilter(
			where,
			query_params,
			"project_path",
			"projectPath",
			values,
		);

		expect(where).toEqual([
			"project_path IN ({projectPath_0:String}, {projectPath_1:String}, {projectPath_2:String})",
		]);
		expect(query_params).toEqual({
			projectPath_0: values[0],
			projectPath_1: values[1],
			projectPath_2: values[2],
		});
		expect(where[0]).not.toContain(values[0] ?? "");
	});

	test("date filters emit placeholders instead of interpolated values", () => {
		expect(buildDateFilter("days", "sa.session_date")).toBe(
			"sa.session_date >= now64(3) - toIntervalDay({days:UInt32}) AND sa.session_date <= now64(3)",
		);
		expect(
			buildAbsoluteDateFilter("startDate", "endDate", "session_date"),
		).toBe(
			"toDate(session_date) >= toDate({startDate:String}) AND toDate(session_date) <= toDate({endDate:String})",
		);
	});

	test("rejects unknown insert tables", () => {
		expect(() => getSafeClickHouseTable("rudel.unknown_table")).toThrow(
			"Unsupported ClickHouse table",
		);
	});

	test("enables the analyzer for inserts that fan out through materialized views", () => {
		const query = buildClickHouseInsertQuery("rudel.claude_sessions", [
			{
				session_id: "session-1",
				content: "line1\nline2",
			},
		]);

		expect(
			query.startsWith(
				"INSERT INTO rudel.claude_sessions SETTINGS async_insert=0, allow_experimental_analyzer=1 FORMAT JSONEachRow ",
			),
		).toBe(true);
		expect(query).toContain('"session_id":"session-1"');
	});
});

describe("analytics service guardrails", () => {
	test("does not use quoted interpolation or escapeString in runtime services", async () => {
		const serviceFiles = [
			"developer.service.ts",
			"error.service.ts",
			"learnings.service.ts",
			"org-session.service.ts",
			"overview.service.ts",
			"project.service.ts",
			"roi.service.ts",
			"session-analytics.service.ts",
		];

		for (const file of serviceFiles) {
			const source = await readFile(
				resolve(import.meta.dir, "..", "services", file),
				"utf8",
			);
			expect(source).not.toContain("escapeString(");
			expect(source).not.toMatch(/'\$\{/);
		}
	});

	test("does not allow raw executor strings or dimension fallbacks", async () => {
		const clickhouseSource = await readFile(
			resolve(import.meta.dir, "..", "clickhouse.ts"),
			"utf8",
		);
		const sessionAnalyticsSource = await readFile(
			resolve(
				import.meta.dir,
				"..",
				"services",
				"session-analytics.service.ts",
			),
			"utf8",
		);

		expect(clickhouseSource).not.toContain("string | ClickHouseStatement");
		expect(clickhouseSource).not.toContain("normalizeStatement(");
		expect(clickhouseSource).not.toContain("{table:Identifier}");
		expect(sessionAnalyticsSource).not.toContain("{table:Identifier}");
		expect(sessionAnalyticsSource).not.toContain("|| dimension");
		expect(sessionAnalyticsSource).not.toContain("|| split_by");
	});
});
