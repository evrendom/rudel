import type {
	SessionDetailOverview,
	SessionDetailTurn,
} from "@rudel/api-routes";
import { describe, expect, it } from "vitest";
import {
	loadRemainingSessionDetailOverviewPages,
	loadSessionDetailTurnBodies,
} from "./session-detail-full-transcript";

const revision = "2026-08-16T08:30:00.123Z";

function turnSummary(index: number) {
	return {
		activityResolution: "exact" as const,
		durationSeconds: null,
		editedFiles: [],
		endedAt: null,
		errorCount: 0,
		errorEvents: [],
		estimatedCost: null,
		hasBody: true,
		index,
		inputTokens: null,
		outputTokens: null,
		responsePreview: null,
		skills: [],
		skillEvents: [],
		slashCommands: [],
		startedAt: null,
		toolCallCount: 0,
		turnId: `turn-${index}`,
		usageCalls: [],
		userPreview: null,
	};
}

function body(turnId: string): SessionDetailTurn {
	return { responseItems: [], revision, turnId, userItems: [] };
}

function overview(nextCursor: string | null): SessionDetailOverview {
	return {
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
			totalInteractions: null,
			totalTokens: 0,
			userId: "owner-1",
		},
		subagents: [],
		turnPage: { items: [], nextCursor, total: 0 },
	};
}

describe("full session transcript loading", () => {
	it("bounds concurrency and retains successes beside per-turn failures", async () => {
		let active = 0;
		let maximumActive = 0;
		const progress: string[] = [];
		const result = await loadSessionDetailTurnBodies({
			concurrency: 3,
			loadTurn: async (turn) => {
				active += 1;
				maximumActive = Math.max(maximumActive, active);
				await Promise.resolve();
				active -= 1;
				if (turn.turnId === "turn-4") {
					throw new Error("turn failed");
				}
				return body(turn.turnId);
			},
			onProgress: ({ completed, total }) => {
				progress.push(`${completed}/${total}`);
			},
			signal: new AbortController().signal,
			turns: Array.from({ length: 8 }, (_, index) => turnSummary(index)),
		});

		expect(maximumActive).toBe(3);
		expect(result.bodies).toHaveLength(7);
		expect(result.failures.has("turn-4")).toBe(true);
		expect(progress.at(-1)).toBe("8/8");
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

	it("honors cancellation before scheduling transcript bodies", async () => {
		const controller = new AbortController();
		controller.abort(new DOMException("cancelled", "AbortError"));
		await expect(
			loadSessionDetailTurnBodies({
				loadTurn: async (turn) => body(turn.turnId),
				onProgress: () => undefined,
				signal: controller.signal,
				turns: [turnSummary(0)],
			}),
		).rejects.toThrow("cancelled");
	});
});
