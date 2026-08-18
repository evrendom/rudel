import { SessionDetailOverviewSchema } from "@rudel/api-routes";
import { describe, expect, it } from "vitest";
import {
	buildSessionDetailOverviewTurnOptions,
	buildSessionDetailOverviewViewModel,
} from "./session-detail-overview-model";

describe("session detail overview client model", () => {
	it("maps a Codex overview into the existing ledger without pricing again", () => {
		const overview = SessionDetailOverviewSchema.parse({
			revision: "2026-08-16T08:30:00.123Z",
			session: {
				durationMinutes: 90,
				estimatedCost: 470.945,
				gitBranch: "main",
				gitSha: "abc",
				inputTokens: 1_000,
				lastInteractionDate: "2026-08-16T09:30:00.123Z",
				modelUsed: "gpt-5.6-sol",
				outputTokens: 200,
				projectPath: "/src/rudel",
				repository: "rudel/rudel",
				sessionDate: "2026-08-16T08:00:00.123Z",
				sessionId: "codex-session",
				skills: [],
				slashCommands: [],
				source: "codex",
				totalTokens: 1_200,
				userId: "owner-1",
			},
			subagents: [],
			turnPage: {
				items: [
					{
						activityResolution: "exact",
						durationSeconds: 60,
						editedFiles: ["src/index.ts"],
						endedAt: "2026-08-16T08:01:00.123Z",
						errorCount: 1,
						errorEvents: [{ at: "2026-08-16T08:00:40.123Z" }],
						estimatedCost: 11.6278,
						hasBody: true,
						index: 0,
						inputTokens: 900,
						outputTokens: 50,
						responsePreview: "Done",
						skills: ["testing-bun"],
						skillEvents: [
							{ at: "2026-08-16T08:00:30.123Z", skill: "testing-bun" },
						],
						slashCommands: ["review"],
						startedAt: "2026-08-16T08:00:00.123Z",
						toolCallCount: 2,
						turnId: "codex-stable-turn",
						usageCalls: [
							{
								at: "2026-08-16T08:00:20.123Z",
								cacheCreationInputTokens: 0,
								cacheReadInputTokens: 100,
								contextWindow: 300_000,
								freshInputTokens: 900,
								model: "gpt-5.6-sol",
								outputTokens: 50,
							},
						],
						userPreview: "Do the work",
					},
				],
				nextCursor: null,
				total: 1,
			},
		});
		const viewModel = buildSessionDetailOverviewViewModel(overview, {
			"owner-1": "Owner",
		});
		const options = buildSessionDetailOverviewTurnOptions(
			overview.turnPage.items,
		);

		expect(viewModel.costLabel).toBe("$471");
		expect(viewModel.safeSource).toBe("codex");
		expect(options[0]?.metrics.estimatedCost).toBe(11.6278);
		expect(options[0]?.metrics.usageEvents[0]).toEqual({
			at: "2026-08-16T08:00:20.123Z",
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 100,
			inputTokens: 900,
			model: "gpt-5.6-sol",
			modelContextWindow: 300_000,
			outputTokens: 50,
		});
		expect(options[0]?.turn).toBeUndefined();
		expect(options[0]?.turnId).toBe("codex-stable-turn");
	});
});
