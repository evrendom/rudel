import { describe, expect, test } from "bun:test";
import { resolveSessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import {
	getLivelineCallInputUtilization,
	getLivelineCallNearX,
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
	test("does not attach an isolated activity circle to a distant call", () => {
		expect(getLivelineCallNearX(series, config, 500, 0)).toBeUndefined();
		expect(getLivelineCallNearX(series, config, 104, 0)?.call.model).toBe(
			"first",
		);
	});

	test("reports the same context utilization used to position a call", () => {
		const call = series.turns[0]?.calls[0];
		if (!call) {
			throw new Error("Expected a model call");
		}

		expect(
			getLivelineCallInputUtilization(series, {
				...call,
				inputTotal: 100,
				modelContextWindow: 400,
			}),
		).toEqual({ maximum: 400, percentage: 25 });
	});
});
