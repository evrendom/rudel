import { describe, expect, test } from "bun:test";
import {
	assignCompactionsBeforeTurns,
	extractSessionCompactionMetadata,
} from "./session-compactions";

describe("session compactions", () => {
	test("deduplicates a Claude boundary and compact summary", () => {
		const content = [
			JSON.stringify({
				compactMetadata: { preTokens: 12_000, trigger: "auto" },
				subtype: "compact_boundary",
				timestamp: "2026-08-10T10:00:00.000Z",
				type: "system",
				uuid: "boundary-1",
			}),
			JSON.stringify({
				isCompactSummary: true,
				timestamp: "2026-08-10T10:00:00.100Z",
				type: "user",
				uuid: "summary-1",
			}),
		].join("\n");

		const metadata = extractSessionCompactionMetadata(content);

		expect(metadata.compactions).toEqual([
			{
				key: "boundary-1",
				timestamp: "2026-08-10T10:00:00.000Z",
			},
		]);
		expect([...metadata.hiddenTraceItemIds]).toEqual([
			"boundary-1",
			"summary-1",
		]);
	});

	test("uses compact summaries as a fallback and detects Codex boundaries", () => {
		const content = [
			JSON.stringify({
				isCompactSummary: true,
				timestamp: "2026-08-10T10:00:00.000Z",
				type: "user",
				uuid: "summary-only",
			}),
			JSON.stringify({
				payload: { type: "context_compacted" },
				timestamp: "2026-08-10T11:00:00.000Z",
				type: "event_msg",
			}),
		].join("\n");

		const metadata = extractSessionCompactionMetadata(content);

		expect(metadata.compactions).toEqual([
			{
				key: "summary-only",
				timestamp: "2026-08-10T10:00:00.000Z",
			},
			{
				key: "compaction-2",
				timestamp: "2026-08-10T11:00:00.000Z",
			},
		]);
		expect([...metadata.hiddenTraceItemIds]).toEqual(["summary-only"]);
	});

	test("places each compaction before the next timestamped turn", () => {
		const compactions = [
			{
				key: "compaction-1",
				timestamp: "2026-08-10T10:05:00.000Z",
			},
			{
				key: "compaction-2",
				timestamp: "2026-08-10T10:25:00.000Z",
			},
		];

		const assigned = assignCompactionsBeforeTurns(compactions, [
			"2026-08-10T10:00:00.000Z",
			"2026-08-10T10:10:00.000Z",
			undefined,
			"2026-08-10T10:30:00.000Z",
		]);

		expect(assigned.map((items) => items.map((item) => item.key))).toEqual([
			[],
			["compaction-1"],
			[],
			["compaction-2"],
		]);
	});
});
