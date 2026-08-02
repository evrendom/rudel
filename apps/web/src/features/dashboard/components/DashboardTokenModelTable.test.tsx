import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DashboardTokenModelTable } from "./DashboardTokenModelTable";

describe("DashboardTokenModelTable", () => {
	it("renders the backend estimate for the cache-heavy anchor", () => {
		render(
			<DashboardTokenModelTable
				rows={[
					{
						estimatedCost: 2.502135,
						id: "gpt-5.6-sol",
						inputTokens: 2_853_471,
						label: "gpt-5.6-sol",
						outputTokens: 18_130,
						totalTokens: 2_871_601,
					},
				]}
			/>,
		);

		expect(screen.getByText("$2.50")).toBeInTheDocument();
	});

	it("renders unresolved estimates as unavailable", () => {
		render(
			<DashboardTokenModelTable
				rows={[
					{
						estimatedCost: null,
						id: "unknown-model",
						inputTokens: 100,
						label: "unknown-model",
						outputTokens: 20,
						totalTokens: 120,
					},
				]}
			/>,
		);

		expect(screen.getByText("—")).toBeInTheDocument();
	});
});
