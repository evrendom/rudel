import { beforeEach, describe, expect, mock, test } from "bun:test";

interface QueryClickhouseInput {
	query: string;
}

let summaryTotalSessions = 0;
let summaryActiveDays = 0;
let archetypeRows: unknown[] = [];

const queryClickhouse = mock((input: QueryClickhouseInput) => {
	expect(input.query).not.toMatch(
		/FROM\s+rudel\.session_analytics(?!\s+FINAL\b)/u,
	);

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

const allowedClickHouseTables = new Set([
	"rudel.claude_sessions",
	"rudel.codex_sessions",
	"rudel.session_analytics",
]);

function getSafeClickHouseTable(table: string): string {
	if (!allowedClickHouseTables.has(table)) {
		throw new Error(`Unsupported ClickHouse table: ${table}`);
	}

	return table;
}

function addOptionalStringEqFilter(
	where: string[],
	query_params: Record<string, unknown>,
	column: string,
	paramName: string,
	value?: string,
): void {
	if (!value) {
		return;
	}

	where.push(`${column} = {${paramName}:String}`);
	query_params[paramName] = value;
}

function addOptionalStringInFilter(
	where: string[],
	query_params: Record<string, unknown>,
	column: string,
	paramBase: string,
	values?: string[],
): void {
	if (!values || values.length === 0) {
		return;
	}

	const placeholders = values.map((value, index) => {
		const paramName = `${paramBase}_${index}`;
		query_params[paramName] = value;
		return `{${paramName}:String}`;
	});
	where.push(`${column} IN (${placeholders.join(", ")})`);
}

function buildDateFilter(paramName: string, column = "session_date"): string {
	return `${column} >= now64(3) - toIntervalDay({${paramName}:UInt32}) AND ${column} <= now64(3)`;
}

function buildAbsoluteDateFilter(
	startParamName: string,
	endParamName: string,
	column = "session_date",
): string {
	return `toDate(${column}) >= toDate({${startParamName}:String}) AND toDate(${column}) <= toDate({${endParamName}:String})`;
}

mock.module("../clickhouse.js", () => ({
	addOptionalStringEqFilter,
	addOptionalStringInFilter,
	buildAbsoluteDateFilter,
	buildDateFilter,
	getSafeClickHouseTable,
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
