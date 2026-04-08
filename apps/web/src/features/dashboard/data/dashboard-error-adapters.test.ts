import { describe, expect, test } from "bun:test";
import type { ErrorsDashboard, ErrorTrendDataPoint } from "@rudel/api-routes";
import {
	buildErrorDailyPoints,
	buildErrorHeadlineMetrics,
} from "./dashboard-error-adapters";

describe("dashboard-error-adapters", () => {
	test("builds headline metrics from the errors dashboard summary", () => {
		const errorDashboard: ErrorsDashboard = {
			end_date: "2026-03-15",
			recurring: [],
			start_date: "2026-03-01",
			summary: {
				distinct_patterns: 12,
				high_severity_patterns: 3,
				max_affected_users: 9,
				top_error_pattern: "Timeout",
				total_errors: 48,
			},
		};

		expect(buildErrorHeadlineMetrics(errorDashboard)).toEqual([
			{
				description: "All error occurrences in the selected range.",
				deltaLabel: "0",
				deltaTone: "neutral",
				id: "sessions",
				label: "Total errors",
				valueLabel: "48",
			},
			{
				description: "Unique recurring error signatures.",
				deltaLabel: "0",
				deltaTone: "neutral",
				id: "uncommitted",
				label: "Distinct patterns",
				valueLabel: "12",
			},
			{
				description: "Patterns crossing the high-severity threshold.",
				deltaLabel: "0",
				deltaTone: "neutral",
				id: "commitRate",
				label: "High severity",
				valueLabel: "3",
			},
		]);
	});

	test("aggregates daily error points and sorts error types by volume", () => {
		const rows: ErrorTrendDataPoint[] = [
			{
				avg_errors_per_interaction: 1.5,
				avg_errors_per_session: 3,
				date: "2026-03-10",
				dimension: "repo-a",
				error_type_occurrences: [3, 1],
				error_types: ["Timeout", "NotFound"],
				total_errors: 3,
			},
			{
				avg_errors_per_interaction: 2,
				avg_errors_per_session: 2,
				date: "2026-03-10",
				dimension: "repo-b",
				error_type_occurrences: [4],
				error_types: ["Timeout"],
				total_errors: 4,
			},
		];

		expect(buildErrorDailyPoints("2026-03-10", "2026-03-11", rows)).toEqual([
			{
				activeDimensions: 2,
				avgErrorsPerInteraction: 1.75,
				avgErrorsPerSession: 2.33,
				axisLabel: "Tue",
				date: "2026-03-10",
				errorTypes: ["Timeout", "NotFound"],
				fullLabel: "Tuesday, Mar 10",
				totalErrors: 7,
			},
			{
				activeDimensions: 0,
				avgErrorsPerInteraction: null,
				avgErrorsPerSession: null,
				axisLabel: "Wed",
				date: "2026-03-11",
				errorTypes: [],
				fullLabel: "Wednesday, Mar 11",
				totalErrors: null,
			},
		]);
	});
});
