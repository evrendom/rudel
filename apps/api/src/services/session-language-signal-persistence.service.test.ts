import { describe, expect, test } from "bun:test";
import type { LanguageSignalCounts } from "@rudel/language-signals";
import {
	buildSessionLanguageSignalRow,
	persistSessionLanguageSignalsBestEffort,
} from "./session-language-signal-persistence.service.js";

const ZERO_COUNTS: LanguageSignalCounts = {
	member_apologies: 0,
	member_positive: 0,
	member_swears: 0,
	model_apologies: 0,
	model_positive: 0,
	model_swears: 0,
};

const scanInput = {
	content: "transcript",
	organizationId: "org-1",
	rawIngestedAt: "2026-08-19T12:00:01.123Z",
	sessionDate: "2026-08-19T12:00:00.000Z",
	sessionId: "session-1",
	source: "codex" as const,
	userId: "user-1",
};

describe("session language-signal ingest persistence", () => {
	test("builds the persisted row with the current scan version", () => {
		expect(
			buildSessionLanguageSignalRow(
				scanInput,
				{ ...ZERO_COUNTS, member_swears: 2 },
				"2026-08-19T12:00:02.456Z",
			),
		).toEqual({
			member_apologies: 0,
			member_positive: 0,
			member_swears: 2,
			model_apologies: 0,
			model_positive: 0,
			model_swears: 0,
			organization_id: "org-1",
			raw_ingested_at: "2026-08-19 12:00:01.123",
			scan_version: 1,
			scanned_at: "2026-08-19 12:00:02.456",
			session_date: "2026-08-19 12:00:00.000",
			session_id: "session-1",
			source: "codex",
			user_id: "user-1",
		});
	});

	test("does not reject the upload hook when the scanner throws", async () => {
		let insertCalls = 0;

		await expect(
			persistSessionLanguageSignalsBestEffort(scanInput, {
				insertRows: async () => {
					insertCalls += 1;
				},
				now: () => new Date("2026-08-19T12:00:02.456Z"),
				scan: async () => {
					throw new Error("scanner unavailable");
				},
			}),
		).resolves.toBeUndefined();
		expect(insertCalls).toBe(0);
	});

	test("does not reject the upload hook when the signal insert throws", async () => {
		await expect(
			persistSessionLanguageSignalsBestEffort(scanInput, {
				insertRows: async () => {
					throw new Error("ClickHouse unavailable");
				},
				now: () => new Date("2026-08-19T12:00:02.456Z"),
				scan: async () => ZERO_COUNTS,
			}),
		).resolves.toBeUndefined();
	});
});
