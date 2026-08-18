import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG } from "./session-thread-overview-config";
import { SessionThreadOverviewHoverCard } from "./session-thread-overview-hover-card";

const CALL = {
	cacheCreation: 12_000,
	cacheRead: 92_000,
	fresh: 8_000,
	inputTotal: 112_000,
	model: "claude-fable-5",
	modelContextWindow: 1_000_000,
	timestampMs: Date.parse("2026-08-02T14:32:07.000Z"),
	xRatio: 0.25,
};

const PREVIOUS_CALL = {
	...CALL,
	cacheRead: 80_000,
	inputTotal: 100_000,
	timestampMs: Date.parse("2026-08-02T14:31:07.000Z"),
	xRatio: 0.15,
};

const SERIES = {
	aggregates: {
		largestCallInputTotal: 112_000,
		largestTurnInputTotal: 112_000,
		modelContextLimits: [],
	},
	turns: [
		{
			calls: [PREVIOUS_CALL],
			index: 0,
			inputTotal: 100_000,
			xEndRatio: 0.2,
			xStartRatio: 0.1,
		},
		{
			calls: [CALL],
			index: 1,
			inputTotal: 112_000,
			xEndRatio: 0.4,
			xStartRatio: 0.2,
		},
	],
};

const EVENTS = [
	{
		count: 1,
		key: "error-event",
		kind: "error" as const,
		label: "Error",
		timestamp: CALL.timestampMs,
		turnIndex: 1,
		xRatio: 0.25,
	},
	{
		count: 1,
		key: "skill-event",
		kind: "skill" as const,
		label: "Skill: design",
		timestamp: CALL.timestampMs,
		turnIndex: 1,
		xRatio: 0.25,
	},
	{
		count: 2,
		key: "read-event",
		kind: "file-read" as const,
		label: "Read: src/a.ts",
		timestamp: CALL.timestampMs,
		turnIndex: 1,
		xRatio: 0.25,
	},
	{
		count: 1,
		key: "write-event",
		kind: "file-write" as const,
		label: "Write: src/b.ts",
		timestamp: CALL.timestampMs,
		turnIndex: 1,
		xRatio: 0.25,
	},
	{
		count: 3,
		key: "edit-event",
		kind: "file-edit" as const,
		label: "Edit: src/c.ts",
		timestamp: CALL.timestampMs,
		turnIndex: 1,
		xRatio: 0.25,
	},
	{
		count: 1,
		key: "subagent-event",
		kind: "subagent" as const,
		label: "Subagent: review",
		timestamp: CALL.timestampMs,
		// A long turn's exact launch time can be nearer another turn's end marker.
		turnIndex: 7,
		xRatio: 0.25,
	},
];

describe("SessionThreadOverviewHoverCard", () => {
	test("uses a fixed intermediate height and describes the plotted call", () => {
		const markup = renderToStaticMarkup(
			<SessionThreadOverviewHoverCard
				config={DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG}
				events={EVENTS}
				hit={{ call: CALL, callIndex: 0, turnIndex: 1 }}
				readout={{ index: 1, kind: "timeline", xRatio: 0.25 }}
				readoutId="hover-readout"
				series={SERIES}
				timestamp={CALL.timestampMs}
			/>,
		);

		expect(markup).toContain("data-session-overview-hover-card");
		expect(markup).toContain("top-0");
		expect(markup).toContain("h-14");
		expect(markup).toContain("rounded-md");
		expect(markup).toContain("shadow-md");
		expect(markup).toContain("ring-black/10");
		expect(markup).toContain(
			'data-session-overview-hover-card-placement="right"',
		);
		expect(markup).toContain("text-xs");
		expect(markup).not.toContain("Session activity");
		expect(markup).not.toContain("claude-fable-5");
		expect(markup).toContain("data-session-overview-input-tokens");
		expect(markup).toContain("IN-TOK");
		expect(markup).not.toContain("Input Tokens:");
		expect(markup).toContain("112K +12K");
		expect(markup).toContain("data-session-overview-context-utilization");
		expect(markup).toContain('aria-valuenow="11"');
		expect(markup).toContain('title="11% of 1M input context"');
		expect(markup).toContain('stroke-dasharray="11.2 88.8"');
		expect(markup.indexOf("IN-TOK")).toBeLessThan(
			markup.indexOf("data-session-overview-context-utilization"),
		);
		expect(markup).not.toContain("+2h");
		expect(markup).not.toContain("Fresh");
		expect(markup).toContain("Errors 1");
		expect(markup).toContain("Skills 1");
		expect(markup).toContain("Reads 2");
		expect(markup).toContain("Writes 1");
		expect(markup).toContain("Edits 3");
		expect(markup).not.toContain("Subagents 1");
		expect(markup).toContain("rounded-(--activity-tag-radius)");
		expect(markup).toContain("w-full");
		expect(markup).toContain("justify-start");
		expect(markup).toContain(
			"1 errors, 1 skill uses, 2 file reads, 1 file writes, 3 file edits",
		);
	});

	test("places the card to the left of a right-side hover", () => {
		const markup = renderToStaticMarkup(
			<SessionThreadOverviewHoverCard
				config={DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG}
				events={EVENTS}
				hit={{ call: CALL, callIndex: 0, turnIndex: 1 }}
				readout={{ index: 0, kind: "timeline", xRatio: 0.8 }}
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
