import type { UserDailyTrendData } from "@rudel/api-routes";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";

export const DASHBOARD_PERFORMANCE_TREND_COLORS: string[] = [
	"#3b82f6",
	"#10b981",
	"#f59e0b",
	"#8b5cf6",
	"#ef4444",
	"#14b8a6",
	"#f97316",
	"#6366f1",
	"#84cc16",
	"#ec4899",
	"#06b6d4",
	"#a855f7",
] as const;

export type DashboardPerformanceTrendMetric = "sessions" | "commits" | "tokens";

export type DashboardPerformanceTrendSeries = {
	color: string;
	label: string;
	userId: string;
};

export function getDashboardPerformanceTrendValue(
	row: UserDailyTrendData | undefined,
	metric: DashboardPerformanceTrendMetric,
) {
	if (!row) {
		return 0;
	}

	if (metric === "sessions") {
		return row.sessions;
	}

	if (metric === "tokens") {
		return row.total_tokens;
	}

	return row.total_commits;
}

export function buildDashboardPerformanceTrendSeries(
	performanceUsers: DashboardPerformanceUserComparison[],
	trendData: UserDailyTrendData[] | undefined,
	metric: DashboardPerformanceTrendMetric,
): DashboardPerformanceTrendSeries[] {
	const rows = trendData ?? [];

	return performanceUsers
		.filter((user) => rows.some((row) => row.user_id === user.userId))
		.map((user, index) => {
			const hasMetricActivity = rows.some(
				(row) =>
					row.user_id === user.userId &&
					getDashboardPerformanceTrendValue(row, metric) > 0,
			);

			if (!hasMetricActivity) {
				return null;
			}

			return {
				color:
					DASHBOARD_PERFORMANCE_TREND_COLORS[
						index % DASHBOARD_PERFORMANCE_TREND_COLORS.length
					],
				label: user.label,
				userId: user.userId,
			} satisfies DashboardPerformanceTrendSeries;
		})
		.filter(
			(series): series is DashboardPerformanceTrendSeries => series != null,
		);
}
