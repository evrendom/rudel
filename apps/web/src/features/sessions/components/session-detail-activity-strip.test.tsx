import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SessionDetailActivityStrip } from "./session-detail-activity-strip";
import type { SessionDetailOverviewTurnOption } from "./session-detail-overview-model";

const activityTotals = {
	edit: 0,
	error: 0,
	read: 0,
	signal: 0,
	signalScanVersion: 1,
	skill: 0,
	subagent: 1,
	write: 0,
};

const option: SessionDetailOverviewTurnOption = {
	compactionsBefore: [],
	fileEvents: [],
	hasBody: true,
	key: "turn-1",
	memberPreview: "Delegate this",
	memberText: "Delegate this",
	metrics: {
		editedFiles: [],
		errorCount: 0,
		errorEvents: [],
		estimatedCost: 0.5,
		inputTokens: 1_234,
		outputTokens: 56,
		skillEvents: [],
		skills: [],
		usageEvents: [],
	},
	modelSignalCount: 0,
	preview: "Done",
	signalCount: 0,
	signalOccurrences: [],
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
	turnId: "turn-1",
	turnNumber: 1,
};

describe("SessionDetailActivityStrip", () => {
	afterEach(() => vi.restoreAllMocks());

	test("shows loading while later overview pages can still contain signals", () => {
		render(
			<SessionDetailActivityStrip
				activityTotals={{
					...activityTotals,
					signal: 1,
					subagent: 0,
				}}
				onJump={() => undefined}
				options={[{ ...option, signalCount: 0, subagentEvents: [] }]}
				overviewLoading
				subagents={[]}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Signals 1" }));

		expect(screen.getByText("Loading signal occurrences…")).toBeVisible();
		expect(
			screen.queryByText(
				"No positive, negative, or apologetic signals detected",
			),
		).toBeNull();
	});

	test("reports capped signal occurrences omitted by the server", () => {
		render(
			<SessionDetailActivityStrip
				activityTotals={{ ...activityTotals, signal: 1, subagent: 0 }}
				onJump={vi.fn()}
				options={[
					{
						...option,
						signalCount: 1,
						signalOccurrences: [{ category: "positive", matchedText: "Great" }],
						signalOccurrencesOmittedCount: 27,
						signalOccurrencesTruncated: true,
						subagentEvents: [],
					},
				]}
				subagents={[]}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Signals 1" }));

		expect(screen.getByText("+27 more not shown")).toBeVisible();
	});

	test("shows a category whose first occurrence is beyond the initial page", () => {
		render(
			<SessionDetailActivityStrip
				activityTotals={{
					...activityTotals,
					signal: 1,
					subagent: 0,
				}}
				onJump={vi.fn()}
				options={[
					{
						...option,
						memberPreview: "Neutral first-page prompt",
						memberText: "Neutral first-page prompt",
						signalCount: 1,
						subagentEvents: [],
					},
				]}
				subagents={[]}
			/>,
		);

		expect(screen.getByRole("button", { name: "Signals 1" })).toBeVisible();
		expect(screen.queryByRole("button", { name: /Subagent/u })).toBeNull();
	});

	test("reports the intrinsic activity-tag width to the pane layout", () => {
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
			function getBoundingClientRect(this: HTMLElement) {
				const width = this.hasAttribute("data-session-detail-activity-items")
					? 548
					: 0;
				return {
					bottom: 0,
					height: 0,
					left: 0,
					right: width,
					top: 0,
					width,
					x: 0,
					y: 0,
					toJSON: () => ({}),
				};
			},
		);
		const onMinimumWidthChange = vi.fn();

		render(
			<SessionDetailActivityStrip
				activityTotals={activityTotals}
				onMinimumWidthChange={onMinimumWidthChange}
				onJump={vi.fn()}
				options={[option]}
				subagents={[]}
			/>,
		);

		expect(onMinimumWidthChange).toHaveBeenCalledWith(564);
	});

	test("opens an occurrence detail pane before jumping to the transcript", () => {
		const onJump = vi.fn();
		render(
			<SessionDetailActivityStrip
				activityTotals={activityTotals}
				onJump={onJump}
				options={[option]}
				subagents={[
					{
						estimatedCost: 0.42,
						hasTranscript: true,
						inputTokens: 1_234,
						model: "claude-fable-5",
						outputTokens: 56,
						subagentId: "agent-reviewer",
						totalTokens: 1_290,
					},
				]}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Subagent 1" }));
		fireEvent.click(
			screen.getByRole("button", {
				name: /Fable 5.*Cost \$0\.42.*Turn 1/u,
			}),
		);

		expect(onJump).not.toHaveBeenCalled();
		expect(
			screen.getByRole("button", { name: "Back to Subagent" }),
		).toBeInTheDocument();
		expect(
			screen.getAllByText("Cost $0.42 · IN-TOK 1.2k · OUT-TOK 56"),
		).not.toHaveLength(0);

		fireEvent.click(screen.getByRole("button", { name: "View in transcript" }));
		expect(onJump).toHaveBeenCalledWith({
			eventId: "delegation-event",
			turnIndex: 0,
		});
	});
});
