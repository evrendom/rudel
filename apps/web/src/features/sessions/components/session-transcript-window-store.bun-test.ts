import { describe, expect, test } from "bun:test";
import {
	SessionDetailWindowSchema,
	type SessionDetailWindowTurn,
} from "@rudel/api-routes";
import { createSessionTranscriptWindowStore } from "./session-transcript-window-store";

const revision = "2026-08-16T08:30:00.123Z";

function turn(index: number): SessionDetailWindowTurn {
	return {
		activityResolution: "exact",
		body: { responseItems: [], userItems: [] },
		bodyOmitted: null,
		durationSeconds: 1,
		editedFiles: [],
		endedAt: revision,
		errorCount: 0,
		errorEvents: [],
		estimatedCost: 0,
		hasBody: true,
		index,
		inputTokens: 1,
		outputTokens: 1,
		responsePreview: "Done",
		skills: [],
		skillEvents: [],
		slashCommands: [],
		startedAt: revision,
		toolCallCount: 0,
		turnId: `turn-${index}`,
		usageCalls: [],
		userPreview: "Prompt",
	};
}

function window(input: {
	newerCursor: string | null;
	olderCursor: string | null;
	revision?: string;
	turns: SessionDetailWindowTurn[];
}) {
	return SessionDetailWindowSchema.parse({
		...input,
		revision: input.revision ?? revision,
		total: 5,
	});
}

describe("session transcript window store", () => {
	test("merges directions chronologically, dedupes, and gates stale epochs", async () => {
		const requests: string[] = [];
		const store = createSessionTranscriptWindowStore({
			fetchWindow: async (request) => {
				requests.push(request.mode);
				return request.mode === "older"
					? window({
							newerCursor: "ignored-newer",
							olderCursor: null,
							turns: [turn(0), turn(1), turn(2)],
						})
					: window({
							newerCursor: null,
							olderCursor: "ignored-older",
							turns: [turn(2), turn(3), turn(4)],
						});
			},
			initialWindow: window({
				newerCursor: "newer",
				olderCursor: "older",
				turns: [turn(2)],
			}),
			sessionId: "session-1",
		});

		await Promise.all([
			store.loadDirection("older"),
			store.loadDirection("older"),
		]);
		await store.loadDirection("newer");
		expect(requests).toEqual(["older", "newer"]);
		expect(store.getSnapshot().turns.map((item) => item.index)).toEqual([
			0, 1, 2, 3, 4,
		]);
		expect(store.getSnapshot()).toMatchObject({
			newerCursor: null,
			olderCursor: null,
			pending: 0,
			windowsLoaded: 3,
		});

		expect(
			store.mergeWindow(
				window({
					newerCursor: null,
					olderCursor: null,
					revision: "2026-08-16T08:31:00.456Z",
					turns: [turn(5)],
				}),
				"newer",
			),
		).toBe(false);
		expect(store.getSnapshot().turns).toHaveLength(5);
	});

	test("surfaces directional errors and supports a revision-bound anchor load", async () => {
		let fails = true;
		const store = createSessionTranscriptWindowStore({
			fetchWindow: async (request) => {
				if (request.mode === "newer" && fails) {
					fails = false;
					throw new Error("network");
				}
				return window({
					newerCursor: null,
					olderCursor: null,
					turns: [turn(request.mode === "anchor" ? 4 : 2)],
				});
			},
			initialWindow: window({
				newerCursor: "newer",
				olderCursor: null,
				turns: [turn(0)],
			}),
			sessionId: "session-1",
		});

		await expect(store.loadDirection("newer")).rejects.toThrow("network");
		expect(store.getSnapshot().newerState).toBe("error");
		await store.loadDirection("newer");
		expect(store.getSnapshot().newerState).toBe("idle");
		await store.loadAnchor("turn-4");
		expect(store.getSnapshot().turns.map((item) => item.turnId)).toContain(
			"turn-4",
		);
	});
});
