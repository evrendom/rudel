import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SessionContinuousTurnSkeleton } from "./session-continuous-turn-skeleton";
import type { SessionDetailOverviewTurnOption } from "./session-detail-overview-model";

describe("SessionContinuousTurnSkeleton language signals", () => {
	test("highlights the member preview while its window body loads", () => {
		const option: SessionDetailOverviewTurnOption = {
			compactionsBefore: [],
			hasBody: true,
			key: "turn-signal-skeleton",
			memberPreview: "Great work.",
			memberText: "Great work.",
			metrics: {
				editedFiles: [],
				errorCount: 0,
				errorEvents: [],
				estimatedCost: 0,
				inputTokens: 0,
				outputTokens: 0,
				skillEvents: [],
				skills: [],
				usageEvents: [],
			},
			modelSignalCount: 0,
			preview: "Assistant preview",
			signalCount: 1,
			signalOccurrences: [{ category: "positive", matchedText: "Great work" }],
			signalOccurrencesOmittedCount: 0,
			signalOccurrencesTruncated: false,
			slashCommands: [],
			timing: {
				durationLabel: "1 sec",
				durationSeconds: 1,
				endTime: "12:00",
				startTime: "12:00",
			},
			toolCallCount: 0,
			turnId: "turn-signal-skeleton",
			turnNumber: 1,
		};
		const markup = renderToStaticMarkup(
			<SessionContinuousTurnSkeleton
				continuesThread
				option={option}
				userLabel="Member"
			/>,
		);

		expect(markup.match(/data-signal="positive"/gu)).toHaveLength(2);
	});
});
