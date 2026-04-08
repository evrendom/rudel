import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsDateRangePicker } from "./AnalyticsDateRangePicker";

const { mockTrackFilterChange } = vi.hoisted(() => ({
	mockTrackFilterChange: vi.fn(),
}));

vi.mock("@/features/analytics/tracking/useAnalyticsTracking", () => ({
	useAnalyticsTracking: () => ({
		trackFilterChange: mockTrackFilterChange,
	}),
}));

vi.mock("@/app/ui/calendar", () => ({
	Calendar: ({
		onSelect,
		selected,
	}: {
		onSelect?: (value: { from?: Date; to?: Date }) => void;
		selected?: { from?: Date; to?: Date };
	}) => {
		function formatDate(value?: Date) {
			if (!value) {
				return "none";
			}

			return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
		}

		return (
			<div>
				<p data-testid="calendar-selection">
					{formatDate(selected?.from)}|{formatDate(selected?.to)}
				</p>
				<button
					type="button"
					onClick={() =>
						onSelect?.({
							from: new Date(2026, 3, 1),
							to: new Date(2026, 3, 8),
						})
					}
				>
					Select mocked range
				</button>
				<button
					type="button"
					onClick={() =>
						onSelect?.({
							from: new Date(2026, 3, 1),
						})
					}
				>
					Select partial range
				</button>
			</div>
		);
	},
}));

describe("AnalyticsDateRangePicker", () => {
	it("renders the formatted trigger label", () => {
		render(
			<AnalyticsDateRangePicker
				startDate="2026-04-01"
				endDate="2026-04-08"
				onDateRangeApply={vi.fn()}
			/>,
		);

		expect(
			screen.getByRole("button", { name: /Apr 1 - Apr 8, 2026/i }),
		).toBeInTheDocument();
	});

	it("applies a preset immediately and tracks it", async () => {
		const user = userEvent.setup();
		const onDateRangeApply = vi.fn();

		render(
			<AnalyticsDateRangePicker
				startDate="2026-03-01"
				endDate="2026-03-05"
				onDateRangeApply={onDateRangeApply}
				sourceComponent="dashboard_date_picker"
			/>,
		);

		await user.click(
			screen.getByRole("button", { name: /Mar 1 - Mar 5, 2026/i }),
		);
		await user.click(screen.getByRole("button", { name: /Last 7 days/i }));

		expect(onDateRangeApply).toHaveBeenCalledWith("2026-04-01", "2026-04-08");
		expect(mockTrackFilterChange).toHaveBeenCalledWith(
			expect.objectContaining({
				changeAction: "preset",
				valueKey: "last-7-days",
				sourceComponent: "dashboard_date_picker",
			}),
		);
		await waitFor(() => {
			expect(screen.queryByText("Presets")).not.toBeInTheDocument();
		});
	});

	it("waits for Apply before committing a custom calendar selection", async () => {
		const user = userEvent.setup();
		const onDateRangeApply = vi.fn();

		render(
			<AnalyticsDateRangePicker
				startDate="2026-03-01"
				endDate="2026-03-05"
				onDateRangeApply={onDateRangeApply}
			/>,
		);

		await user.click(
			screen.getByRole("button", { name: /Mar 1 - Mar 5, 2026/i }),
		);
		await user.click(
			screen.getByRole("button", { name: /Select mocked range/i }),
		);

		expect(onDateRangeApply).not.toHaveBeenCalled();

		await user.click(screen.getByRole("button", { name: /Apply/i }));

		expect(onDateRangeApply).toHaveBeenCalledWith("2026-04-01", "2026-04-08");
		expect(mockTrackFilterChange).toHaveBeenCalledWith(
			expect.objectContaining({
				changeAction: "set",
				valueKey: "custom",
			}),
		);
	});

	it("resets draft selection after cancel", async () => {
		const user = userEvent.setup();

		render(
			<AnalyticsDateRangePicker
				startDate="2026-03-01"
				endDate="2026-03-05"
				onDateRangeApply={vi.fn()}
			/>,
		);

		await user.click(
			screen.getByRole("button", { name: /Mar 1 - Mar 5, 2026/i }),
		);
		expect(screen.getByTestId("calendar-selection")).toHaveTextContent(
			"2026-03-01|2026-03-05",
		);

		await user.click(
			screen.getByRole("button", { name: /Select mocked range/i }),
		);
		expect(screen.getByTestId("calendar-selection")).toHaveTextContent(
			"2026-04-01|2026-04-08",
		);

		await user.click(screen.getByRole("button", { name: /Cancel/i }));
		await user.click(
			screen.getByRole("button", { name: /Mar 1 - Mar 5, 2026/i }),
		);

		expect(screen.getByTestId("calendar-selection")).toHaveTextContent(
			"2026-03-01|2026-03-05",
		);
	});

	it("resets draft selection when the popover closes without apply", async () => {
		const user = userEvent.setup();

		render(
			<AnalyticsDateRangePicker
				startDate="2026-03-01"
				endDate="2026-03-05"
				onDateRangeApply={vi.fn()}
			/>,
		);

		const trigger = screen.getByRole("button", {
			name: /Mar 1 - Mar 5, 2026/i,
		});

		await user.click(trigger);
		await user.click(
			screen.getByRole("button", { name: /Select mocked range/i }),
		);
		expect(screen.getByTestId("calendar-selection")).toHaveTextContent(
			"2026-04-01|2026-04-08",
		);

		await user.click(trigger);
		await user.click(trigger);

		expect(screen.getByTestId("calendar-selection")).toHaveTextContent(
			"2026-03-01|2026-03-05",
		);
	});

	it("keeps Apply disabled until both endpoints exist", async () => {
		const user = userEvent.setup();

		render(
			<AnalyticsDateRangePicker
				startDate=""
				endDate=""
				onDateRangeApply={vi.fn()}
			/>,
		);

		await user.click(screen.getByRole("button", { name: /Pick a date/i }));

		const applyButton = screen.getByRole("button", { name: /Apply/i });

		expect(applyButton).toBeDisabled();

		await user.click(
			screen.getByRole("button", { name: /Select partial range/i }),
		);
		expect(applyButton).toBeDisabled();
	});

	it("omits timezone and unreleased controls", async () => {
		const user = userEvent.setup();

		render(
			<AnalyticsDateRangePicker
				startDate="2026-03-01"
				endDate="2026-03-05"
				onDateRangeApply={vi.fn()}
			/>,
		);

		await user.click(
			screen.getByRole("button", { name: /Mar 1 - Mar 5, 2026/i }),
		);

		expect(screen.queryByText(/UTC/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/Time zone/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/Save as Preset/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/Exclude/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/Offset/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/^Last$/i)).not.toBeInTheDocument();
	});
});
