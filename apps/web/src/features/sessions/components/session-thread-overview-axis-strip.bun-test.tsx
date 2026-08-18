import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSessionThreadOverviewChart } from "./session-thread-overview-chart";
import { DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG } from "./session-thread-overview-config";
import {
	SessionOverviewCallMarker,
	SessionOverviewTimelineFooter,
	SessionOverviewTurnHitTargets,
} from "./session-thread-overview-strip-layers";
import { SessionThreadOverviewTokenLayer } from "./session-thread-overview-token-layer";
import { createSessionTurnTestOption } from "./session-turn-test-fixtures";

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
	test("renders session-time labels without ruler lines", () => {
		const startTimestamp = new Date(2026, 7, 14, 10, 0).getTime();
		const ticks = Array.from({ length: 6 }, (_, index) => ({
			timestamp: startTimestamp + index * 12 * 60 * 1_000,
			xRatio: index / 5,
		}));
		const markup = renderToStaticMarkup(
			<SessionOverviewTimelineFooter ticks={ticks} />,
		);

		expect(markup).toContain("data-session-overview-axis-strip");
		expect(markup).not.toContain("data-session-overview-ruler-tick");
		expect(markup).toContain("Aug 14 10:00");
		expect(markup).not.toContain("10:12");
		expect(markup).not.toContain("10:24");
		expect(markup).not.toContain("10:36");
		expect(markup).not.toContain("10:48");
		expect(markup).toContain("data-session-overview-axis-end");
		expect(markup).toContain(">Aug 14 11:00<");
		expect(markup).not.toContain(">Now<");
		expect(markup).not.toContain("data-session-overview-event");
	});

	test("offers a reset action only while the timeline is zoomed", () => {
		const ticks = [
			{ timestamp: Date.parse("2026-08-14T10:00:00.000Z"), xRatio: 0.25 },
			{ timestamp: Date.parse("2026-08-14T11:00:00.000Z"), xRatio: 0.75 },
		];
		const zoomedMarkup = renderToStaticMarkup(
			<SessionOverviewTimelineFooter
				onResetZoom={() => undefined}
				ticks={ticks}
			/>,
		);
		const fullRangeMarkup = renderToStaticMarkup(
			<SessionOverviewTimelineFooter ticks={ticks} />,
		);

		expect(zoomedMarkup).toContain("Reset zoom");
		expect(zoomedMarkup).toContain('aria-label="Reset timeline zoom"');
		expect(fullRangeMarkup).not.toContain("Reset zoom");
	});

	test("keeps the compressed interval bridge without a cutoff tag", () => {
		const series = {
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
		};
		function renderTokenLayer(config: typeof INTERFERE_CHART_CONFIG) {
			return renderToStaticMarkup(
				<svg aria-hidden="true">
					<SessionThreadOverviewTokenLayer
						breaks={[IDLE_BREAK]}
						config={config}
						gradientId="fixture-gradient"
						plotLeft={0}
						plotRight={615}
						series={series}
					/>
				</svg>,
			);
		}
		const chartMarkup = renderTokenLayer(INTERFERE_CHART_CONFIG);
		const zoomedMarkup = renderTokenLayer({
			...INTERFERE_CHART_CONFIG,
			xDomainEndRatio: 0.6,
			xDomainStartRatio: 0.4,
		});
		const offscreenMarkup = renderTokenLayer({
			...INTERFERE_CHART_CONFIG,
			xDomainEndRatio: 0.8,
			xDomainStartRatio: 0.6,
		});

		expect(chartMarkup).toContain("data-liveline-break-bridge");
		expect(chartMarkup).toContain('stroke-dasharray="2 3"');
		expect(zoomedMarkup).toContain('d="M 276.75 154 H 338.25"');
		expect(offscreenMarkup).not.toContain("data-liveline-break-bridge");
	});

	test("renders the selected time above the chart", () => {
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
		expect(markup).toContain("M3.55 6 .52.75h6.06L3.55 6Z");
		expect(markup).toContain('fill="currentColor"');
	});

	test("keeps the crosshair cursor over interactive turn targets", () => {
		const option = createSessionTurnTestOption();
		const options = [
			{
				...option,
				memberPreview: option.memberText,
				preview: "Completed the requested change",
				reasoningCount: 0,
				subagentCount: 0,
			},
		];
		const chart = buildSessionThreadOverviewChart(options);
		const markup = renderToStaticMarkup(
			<SessionOverviewTurnHitTargets
				config={DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG}
				onFocusIndexChange={() => undefined}
				onSelect={() => undefined}
				options={options}
				readoutId="session-overview-readout"
				readoutIndex={undefined}
				rows={chart.rows}
				selectedIndex={0}
			/>,
		);

		expect(markup).toContain("cursor-crosshair");
		expect(markup).toContain("data-session-overview-turn-hit-target");
		const hitTarget =
			[...markup.matchAll(/<button[^>]*>/g)]
				.map(([tag]) => tag)
				.find((tag) => tag.includes("data-session-overview-turn-hit-target")) ??
			"";
		expect(hitTarget).toContain("cursor-crosshair");
	});
});
