import type { SessionDetailOverview } from "@rudel/api-routes";
import { describe, expect, it } from "vitest";
import { loadRemainingSessionDetailOverviewPages } from "./session-detail-full-transcript";

const revision = "2026-08-16T08:30:00.123Z";

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

describe("session detail overview pagination", () => {
	it("fails loudly when pagination repeats a revision-bound cursor", async () => {
		await expect(
			loadRemainingSessionDetailOverviewPages({
				first: overview("same-cursor"),
				loadPage: async () => overview("same-cursor"),
				signal: new AbortController().signal,
			}),
		).rejects.toThrow("repeated cursor");
	});
});
