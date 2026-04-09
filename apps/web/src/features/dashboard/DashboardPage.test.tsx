import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";

const { mockUseDashboardPageData } = vi.hoisted(() => ({
	mockUseDashboardPageData: vi.fn(),
}));

vi.mock("@/features/dashboard/use-dashboard-page-data", () => ({
	useDashboardPageData: mockUseDashboardPageData,
}));

vi.mock("@/components/analytics/CliSetupHint", () => ({
	CliSetupHint: () => <div>No sessions yet</div>,
}));

describe("DashboardPage", () => {
	it("shows the setup hint when the workspace has never uploaded sessions", () => {
		mockUseDashboardPageData.mockReturnValue({
			endDate: "2026-04-08",
			errorDashboard: undefined,
			errorDeveloperTrend: undefined,
			errorProjectTrend: undefined,
			isDashboardSnapshotPending: false,
			isErrorDashboardPending: false,
			isOverviewKpisPending: false,
			isPerformanceChartPending: false,
			isRepositoryChartPending: false,
			isSessionSnapshotPending: false,
			isTokenChartPending: false,
			modelTokensTrend: [],
			performanceUserDailyTrend: [],
			performanceUsers: [],
			repositoryDailyTrend: [],
			sessionSummaryComparison: undefined,
			snapshot: {
				branchActivity: [],
				commitCostMetrics: [],
				dailyPattern: [],
				headlineMetrics: [],
				impactMetrics: [],
				periodLabel: "",
				recentSessions: [],
				repositories: [],
			},
			startDate: "2026-04-01",
			totalSessionCount: 0,
			userLabelById: new Map(),
			usersTokenUsage: [],
		});

		render(<DashboardPage />);

		expect(screen.getByText("No sessions yet")).toBeInTheDocument();
		expect(
			screen.queryByRole("tab", { name: "Tokens" }),
		).not.toBeInTheDocument();
	});
});
