import type { ModelTokensTrendData } from "@rudel/api-routes";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildDashboardTokenDailyPattern } from "@/features/dashboard/data/dashboard-tab-adapters";
import { DashboardTokenDailyOverviewTable } from "./DashboardTokenDailyOverviewTable";

describe("DashboardTokenDailyOverviewTable", () => {
	it("renders the summed dated per-model cost for each day", () => {
		const modelRows: ModelTokensTrendData[] = [
			{
				cache_creation_input_tokens: 0,
				cache_creation_5m_input_tokens: 0,
				cache_creation_1h_input_tokens: 0,
				cache_read_input_tokens: 2_735_360,
				date: "2026-08-01",
				estimated_cost: 2.502135,
				input_tokens: 2_853_471,
				model: "gpt-5.6-sol",
				output_tokens: 18_130,
				total_tokens: 2_871_601,
				unpriced_session_count: 0,
				unpriced_token_count: 0,
			},
		];
		const dailyPattern = buildDashboardTokenDailyPattern(
			"2026-08-01",
			"2026-08-01",
			undefined,
			modelRows,
		);

		render(<DashboardTokenDailyOverviewTable data={dailyPattern} />);

		expect(screen.getByText("$2.50")).toBeInTheDocument();
		expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
	});
});
