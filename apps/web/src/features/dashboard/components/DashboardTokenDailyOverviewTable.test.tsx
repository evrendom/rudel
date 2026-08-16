import type { ModelTokensTrendData } from "@rudel/api-routes";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildDashboardTokenDailyPattern } from "@/features/dashboard/data/dashboard-tab-adapters";
import { DashboardTokenDailyOverviewTable } from "./DashboardTokenDailyOverviewTable";

describe("DashboardTokenDailyOverviewTable", () => {
	it("renders the summed dated per-model cost for each day", () => {
		// 2026-07-01 sits inside both models' rate-card windows; gpt-5.1-codex
		// has no price after its 2026-07-23 API retirement.
		const modelRows: ModelTokensTrendData[] = [
			{
				date: "2026-07-01",
				input_tokens: 1_000_000,
				model: "gpt-5.1-codex",
				output_tokens: 1_000_000,
				total_tokens: 2_000_000,
			},
			{
				date: "2026-07-01",
				input_tokens: 1_000_000,
				model: "claude-sonnet-4-5",
				output_tokens: 1_000_000,
				total_tokens: 2_000_000,
			},
		];
		const dailyPattern = buildDashboardTokenDailyPattern(
			"2026-07-01",
			"2026-07-01",
			undefined,
			modelRows,
		);

		render(<DashboardTokenDailyOverviewTable data={dailyPattern} />);

		expect(screen.getByText("$29.25")).toBeInTheDocument();
		expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
	});
});
