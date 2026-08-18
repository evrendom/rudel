import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSessionThreadOverviewChart } from "./session-thread-overview-chart";
import { DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG } from "./session-thread-overview-config";
import { SessionThreadOverviewHoverCard } from "./session-thread-overview-hover-card";
import { SessionOverviewZoomSelectionBand } from "./session-thread-overview-zoom-selection";
import { createSessionTurnTestOption } from "./session-turn-test-fixtures";

function buildTimeRangeChart() {
	const first = {
		...createSessionTurnTestOption({
			timing: {
				durationLabel: "1 min",
				durationSeconds: 60,
				endTime: "12:31",
				endTimestamp: "2026-08-18T12:31:00.000Z",
				startTime: "12:30",
				startTimestamp: "2026-08-18T12:30:00.000Z",
			},
		}),
		reasoningCount: 0,
		subagentCount: 0,
	};
	const second = {
		...createSessionTurnTestOption({
			key: "turn-2",
			timing: {
				durationLabel: "1 min",
				durationSeconds: 60,
				endTime: "13:45",
				endTimestamp: "2026-08-18T13:45:00.000Z",
				startTime: "13:44",
				startTimestamp: "2026-08-18T13:44:00.000Z",
			},
			turnNumber: 2,
		}),
		reasoningCount: 0,
		subagentCount: 0,
	};
	return buildSessionThreadOverviewChart([first, second]);
}

describe("session overview drag zoom selection", () => {
	test("draws the requested neutral reference area without a stroke", () => {
		const markup = renderToStaticMarkup(
			<SessionOverviewZoomSelectionBand
				config={DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG}
				selection={{ xEndRatio: 0.75, xStartRatio: 0.25 }}
			/>,
		);

		expect(markup).toContain("data-session-overview-zoom-selection");
		expect(markup).toContain('fill-opacity="0.5"');
		expect(markup).toContain('stroke="none"');
		expect(markup).toContain('x="255"');
		expect(markup).toContain('width="490"');
	});

	test("summarizes the selected range before confirming the zoom", () => {
		const markup = renderToStaticMarkup(
			<SessionThreadOverviewHoverCard
				chart={buildTimeRangeChart()}
				config={DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG}
				events={[
					{
						count: 3,
						key: "selected-edits",
						kind: "file-edit",
						label: "File edits",
						timestamp: Date.parse("2026-08-18T13:00:00.000Z"),
						turnIndex: 0,
						xRatio: 0.5,
					},
				]}
				hit={undefined}
				onZoomSelectionConfirm={() => undefined}
				readout={undefined}
				readoutId="zoom-readout"
				series={{
					aggregates: {
						largestCallInputTotal: 1_000,
						largestTurnInputTotal: 1_000,
						modelContextLimits: [],
					},
					turns: [
						{
							calls: [
								{
									cacheCreation: 0,
									cacheRead: 0,
									fresh: 1_000,
									inputTotal: 1_000,
									model: "model-a",
									timestampMs: Date.parse("2026-08-18T12:31:00.000Z"),
									xRatio: 0.1,
								},
							],
							index: 0,
							inputTotal: 1_000,
							xEndRatio: 0.1,
							xStartRatio: 0,
						},
						{
							calls: [
								{
									cacheCreation: 0,
									cacheRead: 0,
									fresh: 1_000,
									inputTotal: 1_000,
									model: "model-a",
									timestampMs: Date.parse("2026-08-18T13:45:00.000Z"),
									xRatio: 1,
								},
							],
							index: 1,
							inputTotal: 1_000,
							xEndRatio: 1,
							xStartRatio: 0.9,
						},
					],
				}}
				timestamp={undefined}
				zoomSelection={{ xEndRatio: 1, xStartRatio: 0 }}
			/>,
		);

		expect(markup).toContain('role="dialog"');
		expect(markup).toContain("data-session-overview-hover-card");
		expect(markup).toContain('data-session-overview-hover-card-mode="zoom"');
		expect(markup).not.toContain("UTC");
		expect(markup).not.toContain("about 1 hour");
		expect(markup).toContain("2 turns");
		expect(markup).toContain("2 calls");
		expect(markup).toContain("2K input");
		expect(markup).toContain("$0.20");
		expect(markup).toContain('data-session-overview-activity-tag="file-edit"');
		expect(markup).toContain("bg-amber-600");
		expect(markup).toContain('aria-label="3 file edits"');
		expect(markup).toContain('title="3 file edits"');
		expect(markup).toContain("Edits 3");
		expect(markup).toContain("rounded-(--activity-tag-radius)");
		expect(markup).toContain(
			"rounded-[calc(var(--activity-tag-radius)-var(--activity-tag-inset))]",
		);
		expect(markup).toContain("Zoom In");
		expect(markup).toContain("items-center");
		expect(markup).toContain("self-center");
		expect(markup).toContain("h-14");
		expect(markup).toContain("w-80");
		expect(markup).toContain("font-sans");
		expect(markup).toContain('data-slot="button"');
		expect(markup).toContain('data-variant="default"');
		expect(markup).toContain('data-size="xs"');
		expect(markup).toContain("h-6");
	});

	test("keeps action-only turns visible on the normal hover card", () => {
		const markup = renderToStaticMarkup(
			<SessionThreadOverviewHoverCard
				config={DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG}
				events={[
					{
						count: 1,
						key: "action-only-error",
						kind: "error",
						label: "Error",
						timestamp: undefined,
						turnIndex: 0,
						xRatio: 0.5,
					},
				]}
				hit={undefined}
				readout={{
					activityXRatio: 0.5,
					index: 0,
					kind: "activity",
					xRatio: 0.5,
				}}
				readoutId="normal-readout"
				series={{
					aggregates: {
						largestCallInputTotal: 0,
						largestTurnInputTotal: 0,
						modelContextLimits: [],
					},
					turns: [],
				}}
				timestamp={undefined}
			/>,
		);

		expect(markup).toContain("h-14");
		expect(markup).toContain("w-80");
		expect(markup).toContain("font-sans");
		expect(markup).not.toContain("font-mono");
		expect(markup).toContain("Time unavailable");
		expect(markup).toContain("Errors 1");
		expect(markup).not.toContain("IN-TOK");
		expect(markup).not.toContain("No model call");
	});
});
