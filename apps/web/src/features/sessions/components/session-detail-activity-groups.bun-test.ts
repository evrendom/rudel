import { describe, expect, test } from "bun:test";
import type { SessionDetailOverview } from "@rudel/api-routes";
import {
	buildSessionDetailActivityGroups,
	type SessionDetailActivityKind,
} from "./session-detail-activity-groups";
import type { SessionDetailOverviewTurnOption } from "./session-detail-overview-model";

const option: SessionDetailOverviewTurnOption = {
	compactionsBefore: [],
	fileEvents: [],
	hasBody: true,
	key: "turn-1",
	memberPreview: "Great, that worked",
	memberText: "x".repeat(140),
	metrics: {
		editedFiles: [],
		errorCount: 1,
		errorEvents: [
			{
				at: "2026-08-19T10:00:02.000Z",
				content: "Error: command failed with exit code 2",
			},
		],
		estimatedCost: 0.5,
		inputTokens: 1_234,
		outputTokens: 56,
		skillEvents: [],
		skills: [],
		usageEvents: [],
	},
	modelSignalCount: 0,
	preview: "Done",
	signalCount: 1,
	signalOccurrences: [{ category: "positive", matchedText: "Great" }],
	signalOccurrencesOmittedCount: 0,
	signalOccurrencesTruncated: false,
	slashCommands: [],
	subagentEvents: [
		{
			at: "2026-08-19T10:00:03.000Z",
			count: 1,
			eventId: "delegation-event",
			subagentId: "agent-reviewer",
		},
	],
	timing: {
		durationLabel: "4 sec",
		durationSeconds: 4,
		endTime: "12:00:04",
		endTimestamp: "2026-08-19T10:00:04.000Z",
		startTime: "12:00:00",
		startTimestamp: "2026-08-19T10:00:00.000Z",
	},
	toolCallCount: 1,
	turn: {
		responseItems: [],
		userItems: [
			{
				content: `${"x".repeat(140)} Great <system_instruction>Sorry</system_instruction>`,
				id: "late-signal",
				kind: "user",
				timestamp: "2026-08-19T10:00:00.000Z",
			},
		],
	},
	turnId: "turn-1",
	turnNumber: 1,
};

const subagents: SessionDetailOverview["subagents"] = [
	{
		estimatedCost: 0.42,
		hasTranscript: true,
		inputTokens: 1_234,
		model: "claude-fable-5",
		outputTokens: 56,
		subagentId: "agent-reviewer",
		totalTokens: 1_290,
	},
];

const activityTotals: SessionDetailOverview["activityTotals"] = {
	edit: 0,
	error: 1,
	read: 0,
	signal: 1,
	signalScanVersion: 1,
	skill: 0,
	subagent: 1,
	write: 0,
};

function getGroup(kind: SessionDetailActivityKind) {
	const group = buildSessionDetailActivityGroups({
		activityTotals,
		options: [option],
		subagents,
	}).find((candidate) => candidate.kind === kind);
	if (!group) {
		throw new Error(`Expected ${kind} activity group`);
	}
	return group;
}

describe("session detail activity groups", () => {
	test("uses only authoritative overview occurrences for the signal popup", () => {
		expect(getGroup("signal").occurrences).toHaveLength(1);
		expect(getGroup("signal").occurrences[0]?.detail).toBe("Positive · Great");
		expect(getGroup("error").occurrences[0]?.detail).toBe(
			"Error: command failed with exit code 2",
		);
	});

	test("lists exactly the server badge count across overview fixtures", () => {
		const fixtures: SessionDetailOverviewTurnOption[] = [
			{
				...option,
				key: "turn-beyond-preview",
				memberPreview: "x".repeat(140),
				memberText: "x".repeat(140),
				signalCount: 2,
				signalOccurrences: [
					{ category: "positive", matchedText: "Great" },
					{ category: "negative", matchedText: "fishy" },
				],
				turn: undefined,
				turnId: "turn-beyond-preview",
				turnNumber: 1,
			},
			{
				...option,
				key: "turn-page-two",
				signalCount: 1,
				signalOccurrences: [{ category: "apology", matchedText: "Sorry" }],
				signalOccurrencesOmittedCount: 0,
				signalOccurrencesTruncated: false,
				turn: undefined,
				turnId: "turn-page-two",
				turnNumber: 101,
			},
			{
				...option,
				key: "turn-neutral",
				signalCount: 0,
				signalOccurrences: [],
				signalOccurrencesOmittedCount: 0,
				signalOccurrencesTruncated: false,
				turn: undefined,
				turnId: "turn-neutral",
				turnNumber: 102,
			},
		];

		for (const fixture of fixtures) {
			const signalGroup = buildSessionDetailActivityGroups({
				activityTotals: { ...activityTotals, signal: fixture.signalCount },
				options: [fixture],
				subagents: [],
			}).find((group) => group.kind === "signal");
			if (!signalGroup) {
				throw new Error("Expected signal activity group");
			}
			expect(signalGroup.occurrences).toHaveLength(fixture.signalCount);
		}

		const combined = buildSessionDetailActivityGroups({
			activityTotals: { ...activityTotals, signal: 3 },
			options: fixtures,
			subagents: [],
		}).find((group) => group.kind === "signal");
		if (!combined) {
			throw new Error("Expected combined signal activity group");
		}
		expect(combined.occurrences).toHaveLength(3);
		expect(combined.occurrences[2]?.turnLabel).toBe("Turn 101");
	});

	test("shows linked subagent model, cost, and input/output tokens", () => {
		const occurrence = getGroup("subagent").occurrences[0];
		expect(occurrence).toMatchObject({
			detail: "Fable 5",
			eventId: "delegation-event",
			supportingDetail: "Cost $0.42 · IN-TOK 1.2k · OUT-TOK 56",
		});
	});
});
