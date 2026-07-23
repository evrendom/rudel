import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { ClickHouseStatement } from "../clickhouse.js";
import {
	createOrgSessionCountCache,
	getOrgSessionCount,
} from "../services/org-session.service.js";

const queryCalls: ClickHouseStatement[] = [];
let rawTableCounts = new Map<string, string>();
let sessionAnalyticsCount = "0";

const querySessionCount = mock((input: ClickHouseStatement) => {
	queryCalls.push(input);

	if (input.query.includes("rudel.session_analytics")) {
		return Promise.resolve([{ count: sessionAnalyticsCount }]);
	}

	for (const [table, count] of rawTableCounts.entries()) {
		if (input.query.includes(table)) {
			return Promise.resolve([{ count }]);
		}
	}

	throw new Error(`Unexpected ClickHouse query: ${input.query}`);
});

describe("getOrgSessionCount", () => {
	beforeEach(() => {
		queryCalls.length = 0;
		rawTableCounts = new Map([
			["rudel.claude_sessions", "70"],
			["rudel.codex_sessions", "5"],
		]);
		sessionAnalyticsCount = "96";
		querySessionCount.mockClear();
	});

	test("counts wrapped user progress from session analytics", async () => {
		const count = await getOrgSessionCount("org-1", "user-1", {
			querySessionCount,
		});

		expect(count).toBe(96);
		expect(queryCalls).toHaveLength(1);
		expect(queryCalls[0]?.query).toContain(
			"FROM rudel.session_analytics FINAL",
		);
		expect(queryCalls[0]?.query).toContain("user_id = {userId:String}");
		expect(queryCalls[0]?.query_params).toEqual({
			orgId: "org-1",
			userId: "user-1",
		});
	});

	test("keeps organization-level setup counts on raw adapter tables", async () => {
		const count = await getOrgSessionCount("org-1", undefined, {
			querySessionCount,
			rawTableNames: ["rudel.claude_sessions", "rudel.codex_sessions"],
		});

		expect(count).toBe(75);
		expect(queryCalls).toHaveLength(2);
		expect(queryCalls[0]?.query).toContain("FROM rudel.claude_sessions");
		expect(queryCalls[1]?.query).toContain("FROM rudel.codex_sessions");
		expect(queryCalls[0]?.query).not.toContain("user_id = {userId:String}");
		expect(queryCalls[1]?.query).not.toContain("user_id = {userId:String}");
	});
});

describe("createOrgSessionCountCache", () => {
	test("coalesces simultaneous reads for the same count", async () => {
		const load = mock(() => Promise.resolve(96));
		const getCachedCount = createOrgSessionCountCache({
			load,
			ttlMs: 2_000,
		});

		const counts = await Promise.all([
			getCachedCount("org-1", "user-1"),
			getCachedCount("org-1", "user-1"),
			getCachedCount("org-1", "user-1"),
		]);

		expect(counts).toEqual([96, 96, 96]);
		expect(load).toHaveBeenCalledTimes(1);
	});

	test("refreshes the count after the short cache window", async () => {
		let now = 1_000;
		let currentCount = 40;
		const load = mock(() => Promise.resolve(currentCount));
		const getCachedCount = createOrgSessionCountCache({
			load,
			now: () => now,
			ttlMs: 2_000,
		});

		expect(await getCachedCount("org-1")).toBe(40);
		currentCount = 41;
		now += 1_999;
		expect(await getCachedCount("org-1")).toBe(40);
		now += 2;
		expect(await getCachedCount("org-1")).toBe(41);
		expect(load).toHaveBeenCalledTimes(2);
	});

	test("keeps organization-wide and user-specific counts separate", async () => {
		let nextCount = 1;
		const load = mock(() => Promise.resolve(nextCount++));
		const getCachedCount = createOrgSessionCountCache({
			load,
			ttlMs: 2_000,
		});

		expect(await getCachedCount("org-1")).toBe(1);
		expect(await getCachedCount("org-1", "user-1")).toBe(2);
		expect(await getCachedCount("org-2")).toBe(3);
		expect(load).toHaveBeenCalledTimes(3);
	});

	test("retries after a count read fails", async () => {
		let shouldFail = true;
		const load = mock(() => {
			if (shouldFail) {
				return Promise.reject(new Error("Temporary count failure"));
			}
			return Promise.resolve(12);
		});
		const getCachedCount = createOrgSessionCountCache({
			load,
			ttlMs: 2_000,
		});

		await expect(getCachedCount("org-1")).rejects.toThrow(
			"Temporary count failure",
		);
		shouldFail = false;
		await expect(getCachedCount("org-1")).resolves.toBe(12);
		expect(load).toHaveBeenCalledTimes(2);
	});
});
