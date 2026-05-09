import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
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

describe("DashboardSessionsView", () => {
	it("queries recent sessions with the shared day-count range and shows the deep link", () => {
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

		expect(mockQueryOptions).toHaveBeenCalledWith({
			input: {
				days: 14,
				limit: 1000,
				sortBy: "session_date",
				sortOrder: "desc",
			},
		});
		expect(
			screen.getByRole("link", { name: "Open full sessions view" }),
		).toHaveAttribute("href", "/dashboard/sessions");
	});
});
