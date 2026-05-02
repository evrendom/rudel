import { beforeEach, describe, expect, mock, test } from "bun:test";

interface QueryClickhouseInput {
	query: string;
}

let summaryTotalSessions = 0;
let summaryActiveDays = 0;
let archetypeRows: unknown[] = [];

const queryClickhouse = mock((input: QueryClickhouseInput) => {
	if (input.query.includes("count() AS total_sessions")) {
		return Promise.resolve([
			{
				active_days: summaryActiveDays,
				claude_session_count: summaryTotalSessions,
				codex_session_count: 0,
				estimated_spend_usd: 12.34,
				first_session_at: "2026-04-01T10:00:00Z",
				last_session_at: "2026-04-22T10:00:00Z",
				longest_session_min: 45,
				total_sessions: summaryTotalSessions,
				total_tokens: 123_456,
			},
		]);
	}

	if (input.query.includes("SELECT favorite_model")) {
		return Promise.resolve([]);
	}

	if (input.query.includes("formatDateTime(toStartOfMonth")) {
		return Promise.resolve([]);
	}

	if (input.query.includes("wrapped_user_archetype_runs_v1")) {
		return Promise.resolve(archetypeRows);
	}

	throw new Error(`Unexpected ClickHouse query: ${input.query.slice(0, 120)}`);
});

mock.module("../clickhouse.js", () => ({
	queryClickhouse,
}));

const { getWrappedV1Data } = await import("./wrapped.service.js");

describe("wrapped service archetype gate", () => {
	beforeEach(() => {
		queryClickhouse.mockClear();
		summaryTotalSessions = 0;
		summaryActiveDays = 0;
		archetypeRows = [
			{
				computedAt: "2026-04-29T19:25:56Z",
				distanceRatioToMax: 0.2,
				key: "maniac",
				snapshotId: "snapshot-1",
				topTwoMargin: 0.12,
			},
		];
	});

	test("returns a null archetype for a 38-session user", async () => {
		summaryTotalSessions = 38;
		summaryActiveDays = 20;

		const wrapped = await getWrappedV1Data("org-1", "user-1");

		expect(wrapped.archetype).toBeNull();
		expect(wrapped.archetype_gate.is_eligible).toBe(false);
		expect(wrapped.archetype_gate.reason).toBe("needs_more_sessions");
		expect(wrapped.archetype_gate.thresholds.min_total_sessions).toBe(100);
		expect(wrapped.archetype_gate.values.total_sessions).toBe(38);
	});

	test("returns a null archetype for a 99-session user", async () => {
		summaryTotalSessions = 99;
		summaryActiveDays = 20;

		const wrapped = await getWrappedV1Data("org-1", "user-1");

		expect(wrapped.archetype).toBeNull();
		expect(wrapped.archetype_gate.is_eligible).toBe(false);
		expect(wrapped.archetype_gate.reason).toBe("needs_more_sessions");
		expect(wrapped.archetype_gate.values.total_sessions).toBe(99);
	});

	test("returns the archetype for a 100-session active confident user", async () => {
		summaryTotalSessions = 100;
		summaryActiveDays = 14;

		const wrapped = await getWrappedV1Data("org-1", "user-1");

		expect(wrapped.archetype).toEqual({
			computedAt: "2026-04-29T19:25:56Z",
			key: "maniac",
			snapshotId: "snapshot-1",
		});
		expect(wrapped.archetype_gate.is_eligible).toBe(true);
		expect(wrapped.archetype_gate.reason).toBe("eligible");
		expect(wrapped.archetype_gate.values.active_days).toBe(14);
	});
});
