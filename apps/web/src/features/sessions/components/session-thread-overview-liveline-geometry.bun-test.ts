import { describe, expect, test } from "bun:test";
import { resolveSessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import {
	getLivelineCallAtX,
	getLivelineCallX,
	getNearestLivelineCallAtX,
} from "./session-thread-overview-liveline-geometry";
import type { SessionOverviewCallSeries } from "./session-thread-overview-model";

const config = resolveSessionThreadOverviewStripConfig({
	chartWidth: 1_000,
	plotPadding: 0,
});

const series: SessionOverviewCallSeries = {
	aggregates: {
		largestCallInputTotal: 200,
		largestTurnInputTotal: 300,
		modelContextLimits: [],
	},
	turns: [
		{
			calls: [
				{
					cacheCreation: 0,
					cacheRead: 0,
					fresh: 100,
					inputTotal: 100,
					model: "first",
					timestampMs: 1_000,
					xRatio: 0.1,
				},
				{
					cacheCreation: 0,
					cacheRead: 0,
					fresh: 200,
					inputTotal: 200,
					model: "second",
					timestampMs: 2_000,
					xRatio: 0.9,
				},
			],
			index: 0,
			inputTotal: 300,
			xEndRatio: 1,
			xStartRatio: 0,
		},
	],
};

describe("nearest Liveline call hover", () => {
	test("switches at the midpoint instead of holding until the next step", () => {
		const firstX = getLivelineCallX(series, config, 0, 0);
		const secondX = getLivelineCallX(series, config, 0, 1);
		expect(firstX).toBeNumber();
		expect(secondX).toBeNumber();
		if (firstX === undefined || secondX === undefined) {
			throw new Error("Expected both model calls to have plotted positions");
		}
		const justAfterMidpoint = (firstX + secondX) / 2 + 0.01;

		expect(
			getLivelineCallAtX(series, config, justAfterMidpoint)?.call.model,
		).toBe("first");
		expect(
			getNearestLivelineCallAtX(series, config, justAfterMidpoint)?.call.model,
		).toBe("second");
	});
});
