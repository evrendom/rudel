import { describe, expect, test } from "bun:test";
import type { ClickHouseExecutor } from "../clickhouse.js";
import { hasRawSessionRow } from "./raw-session.service.js";

describe("hasRawSessionRow", () => {
	test("queries the tenant, owner, session, and a one-day date tolerance", async () => {
		let queryCount = 0;
		let statement: Parameters<ClickHouseExecutor["query"]>[0] | undefined;
		const present = await hasRawSessionRow(
			{
				organizationId: "org-1",
				sessionDate: new Date("2026-08-01T10:00:00.000Z"),
				sessionId: "session-1",
				table: "rudel.claude_sessions",
				userId: "user-1",
			},
			{
				query: async <T>(next: Parameters<ClickHouseExecutor["query"]>[0]) => {
					queryCount += 1;
					statement = next;
					return [{ present: 1 } as T];
				},
			},
		);

		expect(present).toBe(true);
		expect(queryCount).toBe(1);
		expect(statement?.query).toContain("FROM rudel.claude_sessions");
		expect(statement?.query).toContain(
			"session_date BETWEEN parseDateTime64BestEffort({sessionDate:String}, 3, 'UTC') - INTERVAL 1 DAY",
		);
		expect(statement?.query).toContain("+ INTERVAL 1 DAY");
		expect(statement?.query_params).toEqual({
			organizationId: "org-1",
			sessionDate: "2026-08-01T10:00:00.000Z",
			sessionId: "session-1",
			userId: "user-1",
		});
	});

	test("retries a bounded miss without the date bound", async () => {
		const statements: Parameters<ClickHouseExecutor["query"]>[0][] = [];
		const present = await hasRawSessionRow(
			{
				organizationId: "org-1",
				sessionDate: new Date("2026-08-01T10:00:00.000Z"),
				sessionId: "session-outside-bound",
				table: "rudel.claude_sessions",
				userId: "user-1",
			},
			{
				query: async <T>(next: Parameters<ClickHouseExecutor["query"]>[0]) => {
					statements.push(next);
					return statements.length === 1 ? [] : [{ present: 1 } as T];
				},
			},
		);

		expect(present).toBe(true);
		expect(statements).toHaveLength(2);
		expect(statements[0]?.query).toContain("session_date BETWEEN");
		expect(statements[0]?.query_params).toHaveProperty("sessionDate");
		expect(statements[1]?.query).not.toContain("session_date BETWEEN");
		expect(statements[1]?.query_params).not.toHaveProperty("sessionDate");
	});

	test("retries a bounded probe failure without the date bound", async () => {
		let queryCount = 0;
		const present = await hasRawSessionRow(
			{
				organizationId: "org-1",
				sessionDate: new Date("2026-08-01T10:00:00.000Z"),
				sessionId: "session-after-bounded-failure",
				table: "rudel.codex_sessions",
				userId: "user-1",
			},
			{
				query: async <T>() => {
					queryCount += 1;
					if (queryCount === 1) throw new Error("bounded query failed");
					return [{ present: 1 } as T];
				},
			},
		);

		expect(present).toBe(true);
		expect(queryCount).toBe(2);
	});

	test("omits the date bound when legacy ownership has no date", async () => {
		let statement: Parameters<ClickHouseExecutor["query"]>[0] | undefined;
		const present = await hasRawSessionRow(
			{
				organizationId: "org-1",
				sessionDate: null,
				sessionId: "legacy-session",
				table: "rudel.claude_sessions",
				userId: "user-1",
			},
			{
				query: async <T>(next: Parameters<ClickHouseExecutor["query"]>[0]) => {
					statement = next;
					return [{ present: 1 } as T];
				},
			},
		);

		expect(present).toBe(true);
		expect(statement?.query).not.toContain("session_date BETWEEN");
		expect(statement?.query_params).toEqual({
			organizationId: "org-1",
			sessionId: "legacy-session",
			userId: "user-1",
		});
	});

	test("normalizes the timestamp string returned by Postgres", async () => {
		let statement: Parameters<ClickHouseExecutor["query"]>[0] | undefined;
		const present = await hasRawSessionRow(
			{
				organizationId: "org-1",
				sessionDate: "2026-08-01 10:00:00+00",
				sessionId: "postgres-timestamp-session",
				table: "rudel.claude_sessions",
				userId: "user-1",
			},
			{
				query: async <T>(next: Parameters<ClickHouseExecutor["query"]>[0]) => {
					statement = next;
					return [{ present: 1 } as T];
				},
			},
		);

		expect(present).toBe(true);
		expect(statement?.query).toContain("session_date BETWEEN");
		expect(statement?.query_params).toHaveProperty(
			"sessionDate",
			"2026-08-01T10:00:00.000Z",
		);
	});

	test("uses the unbounded fallback for an invalid session date", async () => {
		let queryCount = 0;
		let statement: Parameters<ClickHouseExecutor["query"]>[0] | undefined;
		const invalidDateResult = await hasRawSessionRow(
			{
				organizationId: "org-1",
				sessionDate: new Date(Number.NaN),
				sessionId: "invalid-date",
				table: "rudel.claude_sessions",
				userId: "user-1",
			},
			{
				query: async <T>(next: Parameters<ClickHouseExecutor["query"]>[0]) => {
					queryCount += 1;
					statement = next;
					return [{ present: 1 } as T];
				},
			},
		);

		expect(invalidDateResult).toBe(true);
		expect(queryCount).toBe(1);
		expect(statement?.query).not.toContain("session_date BETWEEN");
		expect(statement?.query_params).not.toHaveProperty("sessionDate");
	});

	test("continues ingest when both ClickHouse probes fail", async () => {
		let queryCount = 0;
		const clickhouseFailureResult = await hasRawSessionRow(
			{
				organizationId: "org-1",
				sessionDate: new Date("2026-08-01T10:00:00.000Z"),
				sessionId: "clickhouse-failure",
				table: "rudel.codex_sessions",
				userId: "user-1",
			},
			{
				query: async () => {
					queryCount += 1;
					throw new Error("ClickHouse unavailable");
				},
			},
		);

		expect(clickhouseFailureResult).toBe(false);
		expect(queryCount).toBe(2);
	});

	test("returns false after raw TTL expiry", async () => {
		let queryCount = 0;
		const present = await hasRawSessionRow(
			{
				organizationId: "org-1",
				sessionDate: new Date("2026-08-01T10:00:00.000Z"),
				sessionId: "expired-session",
				table: "rudel.codex_sessions",
				userId: "user-1",
			},
			{
				query: async () => {
					queryCount += 1;
					return [];
				},
			},
		);

		expect(present).toBe(false);
		expect(queryCount).toBe(2);
	});

	test("rejects non-allowlisted table interpolation", async () => {
		expect(
			hasRawSessionRow(
				{
					organizationId: "org-1",
					sessionDate: new Date("2026-08-01T10:00:00.000Z"),
					sessionId: "session-1",
					table: "rudel.claude_sessions; DROP TABLE rudel.claude_sessions",
					userId: "user-1",
				},
				{ query: async () => [] },
			),
		).rejects.toThrow("Unsupported ClickHouse table");
	});
});
