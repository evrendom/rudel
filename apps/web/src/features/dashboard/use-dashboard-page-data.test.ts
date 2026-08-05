import { describe, expect, it } from "vitest";
import {
	type DashboardView,
	getDashboardQueryRequirements,
} from "./use-dashboard-page-data";

describe("dashboard query requirements", () => {
	it.each([
		[
			"tokens",
			{
				errors: false,
				modelTokens: true,
				performance: true,
				repositoryTrend: false,
				roi: false,
				sessionSummary: false,
			},
		],
		[
			"commits",
			{
				errors: false,
				modelTokens: false,
				performance: true,
				repositoryTrend: true,
				roi: true,
				sessionSummary: false,
			},
		],
		[
			"errors",
			{
				errors: true,
				modelTokens: false,
				performance: false,
				repositoryTrend: false,
				roi: false,
				sessionSummary: false,
			},
		],
		[
			"repos",
			{
				errors: false,
				modelTokens: false,
				performance: true,
				repositoryTrend: true,
				roi: true,
				sessionSummary: false,
			},
		],
		[
			"sessions",
			{
				errors: false,
				modelTokens: false,
				performance: false,
				repositoryTrend: true,
				roi: true,
				sessionSummary: true,
			},
		],
	] satisfies readonly [
		DashboardView,
		ReturnType<typeof getDashboardQueryRequirements>,
	][])("loads only the %s tab's query families", (view, expected) => {
		expect(getDashboardQueryRequirements(view)).toEqual(expected);
	});
});
