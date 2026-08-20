import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type NormalizedSessionDetailOverview,
	parseSessionDetailOverviewResponse,
} from "./session-detail-fast-response";
import { loadRemainingSessionDetailOverviewPages } from "./session-detail-full-transcript";

const revision = "2026-08-16T08:30:00.123Z";

function overview(nextCursor: string | null): NormalizedSessionDetailOverview {
	return {
		activityTotals: {
			edit: 0,
			error: 0,
			read: 0,
			signal: 0,
			signalScanVersion: 1,
			skill: 0,
			subagent: 0,
			write: 0,
		},
		activityTotalsScope: "session",
		context: { errors: [], files: [] },
		revision,
		session: {
			durationMinutes: null,
			estimatedCost: null,
			gitBranch: null,
			gitSha: null,
			inputTokens: 0,
			lastInteractionDate: revision,
			modelUsed: null,
			outputTokens: 0,
			projectPath: "",
			repository: null,
			sessionDate: revision,
			sessionId: "session-1",
			skills: [],
			slashCommands: [],
			source: "claude_code",
			totalTokens: 0,
			userId: "owner-1",
		},
		subagents: [],
		turnPage: { items: [], nextCursor, total: 0 },
	};
}

function pageLocalOverview(
	nextCursor: string | null,
	errorCount: number,
): NormalizedSessionDetailOverview {
	const page = overview(nextCursor);
	const {
		activityTotals: _activityTotals,
		activityTotalsScope: _activityTotalsScope,
		...legacyPage
	} = page;
	return parseSessionDetailOverviewResponse(
		{
			...legacyPage,
			turnPage: {
				...legacyPage.turnPage,
				items: [
					{
						errorCount,
						index: errorCount,
						turnId: `legacy-turn-${errorCount}`,
					},
				],
			},
		},
		"session-1",
	).overview;
}

describe("session detail overview pagination", () => {
	afterEach(() => vi.restoreAllMocks());

	it("completes older-API whale pagination with page-local synthesized totals", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => undefined);
		const pages = await loadRemainingSessionDetailOverviewPages({
			first: pageLocalOverview("page-2", 0),
			loadPage: async () => pageLocalOverview(null, 1),
			signal: new AbortController().signal,
		});

		expect(pages).toHaveLength(1);
		expect(pages[0]?.activityTotals.error).toBe(1);
	});

	it("loads every remaining overview page without user interaction", async () => {
		const requestedCursors: string[] = [];

		const pages = await loadRemainingSessionDetailOverviewPages({
			first: overview("page-2"),
			loadPage: async (cursor) => {
				requestedCursors.push(cursor);
				return overview(cursor === "page-2" ? "page-3" : null);
			},
			signal: new AbortController().signal,
		});

		expect(requestedCursors).toEqual(["page-2", "page-3"]);
		expect(pages).toHaveLength(2);
		expect(pages.at(-1)?.turnPage.nextCursor).toBeNull();
	});

	it("fails loudly when pagination repeats a revision-bound cursor", async () => {
		await expect(
			loadRemainingSessionDetailOverviewPages({
				first: overview("same-cursor"),
				loadPage: async () => overview("same-cursor"),
				signal: new AbortController().signal,
			}),
		).rejects.toThrow("repeated cursor");
	});

	it("rejects totals from another derivation even when a page repeats the revision", async () => {
		await expect(
			loadRemainingSessionDetailOverviewPages({
				first: overview("page-2"),
				loadPage: async () => {
					const page = overview(null);
					return {
						...page,
						activityTotals: { ...page.activityTotals, error: 1 },
					};
				},
				signal: new AbortController().signal,
			}),
		).rejects.toThrow("mixed activity totals");
	});
});
