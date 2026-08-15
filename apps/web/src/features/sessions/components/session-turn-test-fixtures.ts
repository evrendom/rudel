import type { SessionTurnEpisodeInput } from "./session-turn-episodes";

export function createSessionTurnTestOption(
	overrides: Partial<SessionTurnEpisodeInput> = {},
): SessionTurnEpisodeInput {
	return {
		compactionsBefore: [],
		key: "turn-1",
		memberText: "Continue with the current task",
		metrics: {
			editedFiles: [],
			errorCount: 0,
			errorEvents: [],
			estimatedCost: 0.1,
			inputTokens: 1_000,
			outputTokens: 200,
			skills: [],
			skillEvents: [],
			usageEvents: [],
		},
		slashCommands: [],
		timing: {
			durationLabel: "1 min",
			durationSeconds: 60,
			endTime: "10:01",
			endTimestamp: "2026-08-11T10:01:00.000Z",
			startTime: "10:00",
			startTimestamp: "2026-08-11T10:00:00.000Z",
		},
		toolCallCount: 1,
		turnNumber: 1,
		...overrides,
	};
}
