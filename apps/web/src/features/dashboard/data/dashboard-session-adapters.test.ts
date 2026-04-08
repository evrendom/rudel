import { describe, expect, test } from "bun:test";
import type { SessionAnalyticsSummaryComparison } from "@rudel/api-routes";
import { buildDashboardSessionTabMetrics } from "./dashboard-session-adapters";

describe("dashboard-session-adapters", () => {
	test("builds session headline metrics from summary comparison", () => {
		const summaryComparison: SessionAnalyticsSummaryComparison = {
			changes: {
				avg_response_time_sec: -5.4,
				avg_session_duration_min: 10.5,
				total_sessions: 18,
			},
			current: {
				avg_response_time_sec: 24.3,
				avg_session_duration_min: 38.2,
				skills_adoption_rate: 42,
				slash_commands_adoption_rate: 35,
				subagents_adoption_rate: 12,
				total_sessions: 67,
			},
			previous: {
				avg_response_time_sec: 29.7,
				avg_session_duration_min: 27.7,
				skills_adoption_rate: 38,
				slash_commands_adoption_rate: 31,
				subagents_adoption_rate: 9,
				total_sessions: 49,
			},
		};

		expect(buildDashboardSessionTabMetrics(summaryComparison)).toEqual([
			{
				description: "Total AI sessions in the selected range.",
				deltaLabel: "+18%",
				deltaTone: "positive",
				id: "sessions",
				label: "Sessions run",
				valueLabel: "67",
			},
			{
				description: "Average session duration.",
				deltaLabel: "+11%",
				deltaTone: "negative",
				id: "uncommitted",
				label: "Avg duration",
				valueLabel: "38.2m",
			},
			{
				description: "Average time between session interactions.",
				deltaLabel: "-5.4%",
				deltaTone: "positive",
				id: "commitRate",
				label: "Avg response",
				valueLabel: "24.3s",
			},
		]);
	});
});
