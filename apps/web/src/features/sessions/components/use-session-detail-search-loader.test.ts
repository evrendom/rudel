import {
	SessionDetailWindowSchema,
	type SessionDetailWindowTurn,
} from "@rudel/api-routes";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { loadSearchIndexFromWindows } from "./use-session-detail-search-loader";

const revision = "2026-08-16T08:30:00.123Z";

function turn(index: number): SessionDetailWindowTurn {
	return {
		activityResolution: "exact",
		body: {
			responseItems: [
				{
					events: [
						{
							content: `Search needle ${index}`,
							id: `message-${index}`,
							kind: "message",
							text: `Search needle ${index}`,
							timestamp: revision,
						},
					],
					executionMode: "default",
					id: `agent-${index}`,
					kind: "agent",
					timestamp: revision,
				},
			],
			userItems: [],
		},
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

function window(index: number, newerCursor: string | null) {
	return SessionDetailWindowSchema.parse({
		newerCursor,
		olderCursor: index === 0 ? null : `older-${index}`,
		revision,
		total: 3,
		turns: [turn(index)],
	});
}

describe("session detail window search indexing", () => {
	it("walks windows sequentially and retains only searchable strings", async () => {
		const requests: string[] = [];
		const progress: number[] = [];
		const index = new Map<string, readonly string[]>();
		const failures = await loadSearchIndexFromWindows({
			controller: new AbortController(),
			debugModeKey: "skeletons:off",
			loadWindow: async (request) => {
				requests.push(
					request.mode === "newer" || request.mode === "older"
						? `${request.mode}:${request.cursor}`
						: request.mode,
				);
				if (request.mode === "initial") {
					return window(0, "cursor-1");
				}
				if (request.mode !== "newer") {
					throw new Error(`Unexpected ${request.mode} window request`);
				}
				return request.cursor === "cursor-1"
					? window(1, "cursor-2")
					: window(2, null);
			},
			onProgress: (completed) => progress.push(completed),
			queryClient: new QueryClient(),
			revision,
			searchIndex: index,
			searchableTurnIds: new Set(["turn-0", "turn-1", "turn-2"]),
			sessionId: "session-1",
		});

		expect(requests).toEqual(["initial", "newer:cursor-1", "newer:cursor-2"]);
		expect(progress).toEqual([1, 2, 3]);
		expect(failures).toEqual([]);
		expect(index).toHaveLength(3);
		expect(index.get("turn-2")).toContain("Search needle 2");
	});

	it("rejects a repeated directional cursor", async () => {
		await expect(
			loadSearchIndexFromWindows({
				controller: new AbortController(),
				debugModeKey: "skeletons:off",
				loadWindow: async (request) =>
					window(request.mode === "initial" ? 0 : 1, "same-cursor"),
				onProgress: () => undefined,
				queryClient: new QueryClient(),
				revision,
				searchIndex: new Map(),
				searchableTurnIds: new Set(["turn-0", "turn-1"]),
				sessionId: "session-1",
			}),
		).rejects.toThrow("repeated window cursor");
	});
});
