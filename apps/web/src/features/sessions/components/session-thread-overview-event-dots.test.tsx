import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG } from "./session-thread-overview-config";
import { SessionThreadOverviewEventDots } from "./session-thread-overview-event-dots";

const CALL = {
	cacheCreation: 0,
	cacheRead: 400_000,
	fresh: 100_000,
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

const EVENTS = [
	{
		count: 2,
		key: "error-event",
		kind: "error" as const,
		label: "2 errors",
		timestamp: CALL.timestampMs,
		xRatio: 0.25,
	},
	{
		count: 1,
		key: "skill-event",
		kind: "skill" as const,
		label: "Skill: design",
		timestamp: CALL.timestampMs,
		xRatio: 0.25,
	},
];

describe("SessionThreadOverviewEventDots", () => {
	test("renders clustered circular event markers on the plotted call height", () => {
		const markup = renderToStaticMarkup(
			<SessionThreadOverviewEventDots
				config={DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG}
				events={EVENTS}
				series={SERIES}
			/>,
		);

		expect(markup).toContain("data-session-overview-event-dots");
		expect(markup.match(/data-session-overview-event-cluster/g)).toHaveLength(
			1,
		);
		expect(markup).toContain('data-session-overview-event="error"');
		expect(markup).toContain('data-session-overview-event="skill"');
		expect(markup).toContain('data-count="2"');
		expect(markup).toContain("rounded-full");
		expect(markup).toContain("--session-event-x:25.5%");
		expect(markup).toContain("--session-event-y:36.184");
		expect(markup).toContain("2 errors and 1 skill uses on the chart");
	});

	test("omits events outside the visible zoom domain", () => {
		const markup = renderToStaticMarkup(
			<SessionThreadOverviewEventDots
				config={{
					...DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
					xDomainEndRatio: 1,
					xDomainStartRatio: 0.5,
				}}
				events={EVENTS}
				series={SERIES}
			/>,
		);

		expect(markup).not.toContain("data-session-overview-event-cluster");
		expect(markup).toContain("0 errors and 0 skill uses on the chart");
	});
});
