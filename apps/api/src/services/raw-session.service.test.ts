import { describe, expect, test } from "bun:test";
import type { ClickHouseExecutor } from "../clickhouse.js";
import { hasRawSessionRow } from "./raw-session.service.js";

describe("hasRawSessionRow", () => {
	test("queries the exact tenant, owner, and session in the selected raw table", async () => {
		let statement: Parameters<ClickHouseExecutor["query"]>[0] | undefined;
		const present = await hasRawSessionRow(
			{
				organizationId: "org-1",
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
		expect(statement?.query_params).toEqual({
			organizationId: "org-1",
			sessionId: "session-1",
			userId: "user-1",
		});
	});

	test("returns false after raw TTL expiry", async () => {
		const present = await hasRawSessionRow(
			{
				organizationId: "org-1",
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
					sessionId: "session-1",
					table: "rudel.claude_sessions; DROP TABLE rudel.claude_sessions",
					userId: "user-1",
				},
				{ query: async () => [] },
			),
		).rejects.toThrow("Unsupported ClickHouse table");
	});
});
