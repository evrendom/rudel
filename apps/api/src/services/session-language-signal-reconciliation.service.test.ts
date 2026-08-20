import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import type { RudelSessionLanguageSignalsRow } from "@rudel/ch-schema/generated";
import type { LanguageSignalCounts } from "@rudel/language-signals";
import {
	buildSessionLanguageSignalLagCountQuery,
	buildStaleSessionLanguageSignalQuery,
	reconcileSessionLanguageSignalsOnce,
	reconcileSessionLanguageSignalsUntilCaughtUp,
	type StaleSessionLanguageSignalRow,
} from "./session-language-signal-reconciliation.service.js";

const ZERO_COUNTS: LanguageSignalCounts = {
	member_apologies: 0,
	member_positive: 0,
	member_swears: 0,
	model_apologies: 0,
	model_positive: 0,
	model_swears: 0,
};

function staleRow(
	sessionId: string,
	rawIngestedAt: string,
): StaleSessionLanguageSignalRow {
	return {
		organization_id: "org-1",
		raw_ingested_at: rawIngestedAt,
		session_date: "2026-08-19T12:00:00.000Z",
		session_id: sessionId,
		source: "codex",
		user_id: "user-1",
	};
}

function latestRawContent(row: StaleSessionLanguageSignalRow) {
	return { content: row.session_id, revision: row.raw_ingested_at };
}

function readProcessOutput(
	stream: ReadableStream<Uint8Array> | number | null,
): Promise<string> {
	if (!(stream instanceof ReadableStream)) {
		throw new Error("Expected piped process output");
	}
	return new Response(stream).text();
}

describe("session language-signal reconciliation", () => {
	test("selects missing, version-stale, and raw-stale sessions newest first", () => {
		const query = buildStaleSessionLanguageSignalQuery();
		const lagQuery = buildSessionLanguageSignalLagCountQuery();

		expect(query).toContain("signals.latest_scan_version = 0");
		expect(query).toContain(
			"signals.latest_scan_version < {scanVersion:UInt16}",
		);
		expect(query).toContain(
			"signals.latest_raw_ingested_at < raw.raw_ingested_at",
		);
		expect(query).toContain("raw_ingested_at DESC");
		expect(query).toContain("organization_id ASC");
		expect(query).toContain("LIMIT {batchSize:UInt32}");
		expect(query).toContain("OFFSET {offset:UInt32}");
		expect(query).toContain("%fZ");
		expect(query).not.toContain("%3N");
		expect(query).not.toContain("argMax(content");
		expect(lagQuery).toContain("SELECT count() AS count");
		expect(lagQuery).not.toContain("argMax(content");
	});

	test("drains newest-first batches until the lag reaches zero", async () => {
		const pending = [
			staleRow("newest", "2026-08-19T12:00:03.000Z"),
			staleRow("middle", "2026-08-19T12:00:02.000Z"),
			staleRow("oldest", "2026-08-19T12:00:01.000Z"),
		];
		const inserted: RudelSessionLanguageSignalsRow[] = [];
		const scanOrder: string[] = [];

		const result = await reconcileSessionLanguageSignalsUntilCaughtUp(2, {
			insertRows: async (rows) => {
				inserted.push(...rows);
			},
			now: () => new Date("2026-08-19T12:01:00.000Z"),
			queryLatestRawContent: async (row: StaleSessionLanguageSignalRow) =>
				latestRawContent(row),
			queryLagCount: async () => pending.length,
			queryStaleRows: async (_scanVersion, batchSize) =>
				pending.splice(0, batchSize),
			scan: async (content) => {
				scanOrder.push(content);
				return { ...ZERO_COUNTS, member_swears: 1 };
			},
		});

		expect(result).toEqual({ failed: 0, remainingLag: 0, rescanned: 3 });
		expect(scanOrder).toEqual(["newest", "middle", "oldest"]);
		expect(inserted.map((row) => row.session_id)).toEqual([
			"newest",
			"middle",
			"oldest",
		]);
	});

	test("a completed row is not inserted again on a duplicate pass", async () => {
		const raw = staleRow("session-1", "2026-08-19T12:00:01.000Z");
		const inserted: RudelSessionLanguageSignalsRow[] = [];
		const env = {
			insertRows: async (rows: readonly RudelSessionLanguageSignalsRow[]) => {
				inserted.push(...rows);
			},
			now: () => new Date("2026-08-19T12:01:00.000Z"),
			queryLatestRawContent: async (row: StaleSessionLanguageSignalRow) =>
				latestRawContent(row),
			queryLagCount: async () => 0,
			queryStaleRows: async () => (inserted.length === 0 ? [raw] : []),
			scan: async () => ZERO_COUNTS,
		};

		expect(await reconcileSessionLanguageSignalsOnce(25, env)).toMatchObject({
			rescanned: 1,
		});
		expect(await reconcileSessionLanguageSignalsOnce(25, env)).toEqual({
			failed: 0,
			remainingLag: 0,
			rescanned: 0,
		});
		expect(inserted).toHaveLength(1);
	});

	test("round-trips an explicit UTC revision under a non-UTC timezone", async () => {
		const fixturePath = resolve(
			import.meta.dir,
			"..",
			"__tests__",
			"fixtures",
			"session-language-signal-revision-timezone.ts",
		);
		const subprocess = Bun.spawn(["bun", fixturePath], {
			env: { ...process.env, TZ: "America/New_York" },
			stderr: "pipe",
			stdout: "pipe",
		});
		const [exitCode, stderr, stdout] = await Promise.all([
			subprocess.exited,
			readProcessOutput(subprocess.stderr),
			readProcessOutput(subprocess.stdout),
		]);

		expect(exitCode).toBe(0);
		expect(stderr).toBe("");
		expect(stdout).toBe("2026-08-19 12:00:01.123");
	});

	test("stops when a stale batch repeats without forward progress", async () => {
		const raw = staleRow("sticky", "2026-08-19T12:00:01.000Z");
		let discoveryCalls = 0;
		let scanCalls = 0;

		const result = await reconcileSessionLanguageSignalsUntilCaughtUp(25, {
			insertRows: async () => {},
			now: () => new Date("2026-08-19T12:01:00.000Z"),
			queryLatestRawContent: async (row) => latestRawContent(row),
			queryLagCount: async () => 1,
			queryStaleRows: async () => {
				discoveryCalls += 1;
				return [raw];
			},
			scan: async () => {
				scanCalls += 1;
				return ZERO_COUNTS;
			},
		});

		expect(result).toEqual({ failed: 0, remainingLag: 1, rescanned: 1 });
		expect(discoveryCalls).toBe(2);
		expect(scanCalls).toBe(1);
	});

	test("continues past a permanently failing newest batch", async () => {
		let pending: StaleSessionLanguageSignalRow[] = [
			staleRow("failed-newest", "2026-08-19T12:00:04.000Z"),
			staleRow("failed-next", "2026-08-19T12:00:03.000Z"),
			staleRow("older-one", "2026-08-19T12:00:02.000Z"),
			staleRow("older-two", "2026-08-19T12:00:01.000Z"),
		];
		const scanOrder: string[] = [];

		const result = await reconcileSessionLanguageSignalsUntilCaughtUp(2, {
			insertRows: async (rows) => {
				const insertedIds = new Set(rows.map((row) => row.session_id));
				pending = pending.filter((row) => !insertedIds.has(row.session_id));
			},
			now: () => new Date("2026-08-19T12:01:00.000Z"),
			queryLatestRawContent: async (row) => latestRawContent(row),
			queryLagCount: async () => pending.length,
			queryStaleRows: async (_scanVersion, batchSize, offset) =>
				pending.slice(offset, offset + batchSize),
			scan: async (content) => {
				scanOrder.push(content);
				if (content.startsWith("failed")) {
					throw new Error("permanent scan failure");
				}
				return ZERO_COUNTS;
			},
		});

		expect(result).toEqual({ failed: 2, remainingLag: 2, rescanned: 2 });
		expect(scanOrder).toEqual([
			"failed-newest",
			"failed-next",
			"older-one",
			"older-two",
		]);
	});
});
