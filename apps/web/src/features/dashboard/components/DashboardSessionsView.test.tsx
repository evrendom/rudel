import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatIsoDate } from "@/lib/format";
import { DashboardSessionsView } from "./DashboardSessionsView";

const { mockQueryOptions, mockUseAnalyticsQuery, mockUseDateRange } =
	vi.hoisted(() => ({
		mockQueryOptions: vi.fn(() => ({
			queryKey: ["sessions", "list"],
			queryFn: vi.fn(),
		})),
		mockUseAnalyticsQuery: vi.fn(() => ({
			data: [],
			isPending: false,
		})),
		mockUseDateRange: vi.fn(() => ({
			state: {
				startDate: "2026-04-04",
				endDate: "2026-04-17",
			},
			meta: {
				dayCount: 14,
			},
		})),
	}));

vi.mock("@/features/analytics/date-range/useDateRange", () => ({
	useDateRange: mockUseDateRange,
}));

vi.mock("@/features/analytics/queries/useAnalyticsQuery", () => ({
	useAnalyticsQuery: mockUseAnalyticsQuery,
}));

vi.mock("@/lib/orpc", () => ({
	orpc: {
		analytics: {
			sessions: {
				list: {
					queryOptions: mockQueryOptions,
				},
			},
		},
	},
}));

vi.mock(
	"@/features/dashboard/components/DashboardSessionsSnapshotSection",
	() => ({
		DashboardSessionsSnapshotSection: ({
			totalSessionCount,
		}: {
			totalSessionCount: number;
		}) => <div>Snapshot total: {totalSessionCount}</div>,
	}),
);

vi.mock("@/features/dashboard/components/DashboardRepositoryPanel", () => ({
	DashboardRepositoryPanel: () => <div>Repository panel</div>,
}));

function renderSessionsView() {
	render(
		<MemoryRouter>
			<DashboardSessionsView
				isRepositoryChartPending={false}
				repositories={[]}
				repositoryDailyTrend={[]}
				sessionSummaryComparison={undefined}
			/>
		</MemoryRouter>,
	);
}

describe("DashboardSessionsView", () => {
	beforeEach(() => {
		mockQueryOptions.mockClear();
		mockUseDateRange.mockReturnValue({
			state: { startDate: "2026-04-04", endDate: "2026-04-17" },
			meta: { dayCount: 14 },
		});
	});

	it("queries recent sessions for the picked window and shows the deep link", () => {
		renderSessionsView();

		// The picked window is sent as absolute dates. Sending only `days` would
		// return the last 14 days from now rather than April 4-17.
		expect(mockQueryOptions).toHaveBeenCalledWith({
			input: {
				days: 14,
				startDate: "2026-04-04",
				endDate: "2026-04-17",
				limit: 1000,
				sortBy: "session_date",
				sortOrder: "desc",
			},
		});
		expect(screen.getByRole("link", { name: "Open sessions" })).toHaveAttribute(
			"href",
			"/session",
		);
	});

	it("over-fetches without a window for the rolling 24-hour range", () => {
		// today-to-today means "the last 24 hours", which straddles two calendar
		// days, so the view filters a two-day fetch down to the rolling window.
		const today = formatIsoDate(new Date());
		mockUseDateRange.mockReturnValue({
			state: { startDate: today, endDate: today },
			meta: { dayCount: 1 },
		});

		renderSessionsView();

		expect(mockQueryOptions).toHaveBeenCalledWith({
			input: {
				days: 2,
				limit: 1000,
				sortBy: "session_date",
				sortOrder: "desc",
			},
		});
	});
});
