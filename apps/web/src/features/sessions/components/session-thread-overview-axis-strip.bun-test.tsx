import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG } from "./session-thread-overview-config";
import { transformSessionOverviewRulerScale } from "./session-thread-overview-ruler-scale";
import {
	SessionOverviewCallMarker,
	SessionOverviewTimelineFooter,
} from "./session-thread-overview-strip-layers";
import { formatTimelineFooterTick } from "./session-thread-overview-time-format";
import { SessionThreadOverviewTokenLayer } from "./session-thread-overview-token-layer";

const INTERFERE_CHART_CONFIG = {
	...DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
	axisY: 154,
	chartHeight: 160,
	chartWidth: 615,
	plotPadding: 0,
};

const IDLE_BREAK = {
	durationMs: 60 * 60 * 1_000,
	endTimestamp: Date.parse("2026-08-14T11:05:00.000Z"),
	idleDurationMs: 70 * 60 * 1_000,
	idleEndTimestamp: Date.parse("2026-08-14T11:10:00.000Z"),
	idleStartTimestamp: Date.parse("2026-08-14T10:00:00.000Z"),
	key: "idle-gap",
	startTimestamp: Date.parse("2026-08-14T10:05:00.000Z"),
	xEndRatio: 0.51,
	xStartRatio: 0.49,
};

describe("SessionOverviewTimelineFooter", () => {
	test("matches the Interfere ruler and labels it with session time", () => {
		const startTimestamp = new Date(2026, 7, 14, 10, 0).getTime();
		const ticks = Array.from({ length: 6 }, (_, index) => ({
			timestamp: startTimestamp + index * 12 * 60 * 1_000,
			xRatio: index / 5,
		}));
		const rulerTicks = Array.from({ length: 40 }, (_, index) => ({
			timestamp: startTimestamp + (index * (60 * 60 * 1_000)) / 39,
			xRatio: index / 39,
		}));
		const markup = renderToStaticMarkup(
			<SessionOverviewTimelineFooter
				config={DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG}
				events={[
					{
						count: 1,
						key: "error-event",
						kind: "error",
						label: "Error",
						timestamp: startTimestamp + 15 * 60 * 1_000,
						xRatio: 0.25,
					},
					{
						count: 1,
						key: "skill-event",
						kind: "skill",
						label: "Skill: ui",
						timestamp: startTimestamp + 30 * 60 * 1_000,
						xRatio: 0.5,
					},
				]}
				rulerTicks={rulerTicks}
				ticks={ticks}
			/>,
		);

		expect(markup).toContain("data-session-overview-axis-strip");
		expect(markup.match(/data-session-overview-ruler-tick/g)).toHaveLength(44);
		expect(markup.match(/data-ruler-kind="major"/g)).toHaveLength(6);
		expect(markup).toContain(
			`data-timestamp="${new Date(startTimestamp).toISOString()}"`,
		);
		expect(markup).toContain("10:00 AM");
		expect(markup).toContain("10:12 AM");
		expect(markup).toContain("10:24 AM");
		expect(markup).toContain("10:36 AM");
		expect(markup).toContain("10:48 AM");
		expect(markup).toContain("data-session-overview-axis-end");
		expect(markup).toContain(">11:00 AM<");
		expect(markup).not.toContain(">Now<");
		expect(markup).toContain('data-session-overview-event="error"');
		expect(markup).toContain('data-session-overview-event="skill"');
		expect(markup).toContain("1 errors and 1 skill uses on the timeline");
	});

	test("expresses later calendar days as compact offsets", () => {
		const firstTimestamp = new Date(2026, 7, 14, 10, 0).getTime();
		const nextDayTimestamp = new Date(2026, 7, 15, 10, 0).getTime();

		expect(
			formatTimelineFooterTick(
				nextDayTimestamp,
				firstTimestamp,
				24 * 60 * 60 * 1_000,
			),
		).toBe("10:00 AM (+1d)");
	});

	test("keeps the compressed interval bridge without a cutoff tag", () => {
		const chartMarkup = renderToStaticMarkup(
			<svg aria-hidden="true">
				<SessionThreadOverviewTokenLayer
					breaks={[IDLE_BREAK]}
					config={INTERFERE_CHART_CONFIG}
					gradientId="fixture-gradient"
					plotLeft={0}
					plotRight={615}
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
										model: undefined,
										timestampMs: undefined,
										xRatio: 0.25,
									},
								],
								index: 0,
								inputTotal: 1_000,
								xEndRatio: 0.45,
								xStartRatio: 0,
							},
						],
					}}
				/>
			</svg>,
		);

		expect(chartMarkup).toContain("data-liveline-break-bridge");
		expect(chartMarkup).toContain('stroke-dasharray="2 3"');
	});

	test("scales ruler lines continuously by pointer proximity", () => {
		expect(transformSessionOverviewRulerScale(97, 0.75)).toBe(1);
		expect(transformSessionOverviewRulerScale(96, 0.75)).toBe(1);
		expect(transformSessionOverviewRulerScale(48, 0.75)).toBe(1.1875);
		expect(transformSessionOverviewRulerScale(0, 0.75)).toBe(1.75);
		expect(transformSessionOverviewRulerScale(-48, 0.75)).toBe(1.1875);
	});

	test("renders the selected time above the chart through the ruler", () => {
		const markup = renderToStaticMarkup(
			<div className="relative">
				<SessionOverviewCallMarker
					config={DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG}
					selectedXRatio={0.5}
				/>
			</div>,
		);

		expect(markup).toContain("data-session-overview-selection-marker");
		expect(markup).toContain("z-40");
		expect(markup).toContain("-top-8");
		expect(markup).toContain("bottom-[1.625rem]");
		expect(markup).toContain("w-px");
		expect(markup).toContain("-translate-y-3");
		expect(markup).toContain("text-orange-500");
		expect(markup).toContain('fill="none"');
		expect(markup).toContain(
			"M3.54688 6L0.515786 0.75L6.57796 0.75L3.54688 6Z",
		);
		expect(markup).toContain('fill="currentColor"');
	});
});
