import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG } from "./session-thread-overview-config";
import { SessionThreadOverviewHoverCard } from "./session-thread-overview-hover-card";

const CALL = {
	cacheCreation: 12_000,
	cacheRead: 480_000,
	fresh: 8_000,
	inputTotal: 500_000,
	model: "claude-fable-5",
	modelContextWindow: 1_000_000,
	timestampMs: Date.parse("2026-08-02T14:32:07.000Z"),
	xRatio: 0.25,
};

const SERIES = {
	aggregates: {
		largestCallInputTotal: 500_000,
		largestTurnInputTotal: 500_000,
		modelContextLimits: [],
	},
	turns: [
		{
			calls: [CALL],
			index: 0,
			inputTotal: 500_000,
			xEndRatio: 0.4,
			xStartRatio: 0.1,
		},
	],
};

describe("SessionThreadOverviewHoverCard", () => {
	test("uses a fixed intermediate height and describes the plotted call", () => {
		const markup = renderToStaticMarkup(
			<SessionThreadOverviewHoverCard
				config={DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG}
				elapsedMs={7_327_000}
				hit={{ call: CALL, callIndex: 0, turnIndex: 0 }}
				options={[]}
				readout={{ index: 0, xRatio: 0.25 }}
				readoutId="hover-readout"
				series={SERIES}
				timestamp={CALL.timestampMs}
			/>,
		);

		expect(markup).toContain("data-session-overview-hover-card");
		expect(markup).toContain("top-0");
		expect(markup).toContain("h-14");
		expect(markup).toContain(
			'data-session-overview-hover-card-placement="right"',
		);
		expect(markup).toContain("Session activity · claude-fable-5");
		expect(markup).toContain("Input context");
		expect(markup).toContain("500K / 1M");
		expect(markup).toContain("50.0%");
		expect(markup).toContain("Fresh 8K");
		expect(markup).toContain("Read 480K");
		expect(markup).toContain("Write 12K");
	});

	test("places the card to the left of a right-side hover", () => {
		const markup = renderToStaticMarkup(
			<SessionThreadOverviewHoverCard
				config={DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG}
				elapsedMs={undefined}
				hit={{ call: CALL, callIndex: 0, turnIndex: 0 }}
				options={[]}
				readout={{ index: 0, xRatio: 0.8 }}
				readoutId="hover-readout"
				series={SERIES}
				timestamp={CALL.timestampMs}
			/>,
		);

		expect(markup).toContain(
			'data-session-overview-hover-card-placement="left"',
		);
		expect(markup).toContain("-translate-x-3");
	});
});
