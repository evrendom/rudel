import { describe, expect, test } from "bun:test";
import type { ClickHouseExecutor } from "../clickhouse.js";
import { hasRawSessionRow } from "./raw-session.service.js";

describe("hasRawSessionRow", () => {
	test("queries the tenant, owner, session, and a one-day date tolerance", async () => {
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
					statement = next;
					return [{ present: 1 } as T];
				},
			},
		);

		expect(present).toBe(true);
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

	test("continues ingest when date serialization or ClickHouse probing fails", async () => {
		let queryCount = 0;
		const invalidDateResult = await hasRawSessionRow(
			{
				organizationId: "org-1",
				sessionDate: new Date(Number.NaN),
				sessionId: "invalid-date",
				table: "rudel.claude_sessions",
				userId: "user-1",
			},
			{
				query: async () => {
					queryCount += 1;
					return [];
				},
			},
		);
		const clickhouseFailureResult = await hasRawSessionRow(
			{
				organizationId: "org-1",
				sessionDate: null,
				sessionId: "clickhouse-failure",
				table: "rudel.codex_sessions",
				userId: "user-1",
			},
			{
				query: async () => {
					throw new Error("ClickHouse unavailable");
				},
			},
		);

		expect(invalidDateResult).toBe(false);
		expect(queryCount).toBe(0);
		expect(clickhouseFailureResult).toBe(false);
	});

	test("returns false after raw TTL expiry", async () => {
		const present = await hasRawSessionRow(
			{
				organizationId: "org-1",
				sessionDate: new Date("2026-08-01T10:00:00.000Z"),
				sessionId: "expired-session",
				table: "rudel.codex_sessions",
				userId: "user-1",
			},
			{ query: async () => [] },
		);

		expect(present).toBe(false);
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
