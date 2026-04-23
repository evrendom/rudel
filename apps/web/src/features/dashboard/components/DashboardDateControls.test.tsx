import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { DateRangeProvider } from "@/features/analytics/date-range/DateRangeProvider";
import { DashboardDateControls } from "./DashboardDateControls";

vi.mock(
	"@/features/analytics/date-range/components/AnalyticsDateRangePicker",
	() => ({
		AnalyticsDateRangePicker: ({
			endDate,
			onDateRangeApply,
			startDate,
		}: {
			endDate: string;
			onDateRangeApply: (startDate: string, endDate: string) => void;
			startDate: string;
		}) => (
			<div>
				<p data-testid="picker-range">
					{startDate}|{endDate}
				</p>
				<button
					type="button"
					onClick={() => onDateRangeApply("2026-04-01", "2026-04-08")}
				>
					Apply mocked range
				</button>
			</div>
		),
	}),
);

describe("DashboardDateControls", () => {
	it("reads the current date range and applies updates through the provider", async () => {
		const user = userEvent.setup();

		render(
			<MemoryRouter
				initialEntries={["/dashboard?from=2026-03-01&to=2026-03-05"]}
			>
				<DateRangeProvider>
					<DashboardDateControls />
				</DateRangeProvider>
			</MemoryRouter>,
		);

		expect(screen.getByTestId("picker-range")).toHaveTextContent(
			"2026-03-01|2026-03-05",
		);

		await user.click(
			screen.getByRole("button", { name: /Apply mocked range/i }),
		);

		expect(screen.getByTestId("picker-range")).toHaveTextContent(
			"2026-04-01|2026-04-08",
		);
	});
});
