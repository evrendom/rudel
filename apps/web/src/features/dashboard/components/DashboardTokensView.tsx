import type {
	ModelTokensTrendData,
	UserDailyTrendData,
	UserTokenUsageData,
} from "@rudel/api-routes";
import { useMemo } from "react";
import { DashboardTokenDeveloperPanel } from "@/features/dashboard/components/DashboardTokenDeveloperPanel";
import { DashboardTokenModelsPanel } from "@/features/dashboard/components/DashboardTokenModelsPanel";
import { DashboardTokenSnapshotSection } from "@/features/dashboard/components/DashboardTokenSnapshotSection";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";
import {
	buildDashboardTokenDailyPattern,
	buildDashboardTokenTabMetrics,
} from "@/features/dashboard/data/dashboard-tab-adapters";

export function DashboardTokensView({
	endDate,
	isDeveloperChartPending,
	isSnapshotPending = false,
	modelTokensTrend,
	performanceUserDailyTrend,
	performanceUsers,
	startDate,
	usersTokenUsage,
}: {
	endDate: string;
	isDeveloperChartPending: boolean;
	isSnapshotPending?: boolean;
	modelTokensTrend: ModelTokensTrendData[] | undefined;
	performanceUserDailyTrend: UserDailyTrendData[] | undefined;
	performanceUsers: DashboardPerformanceUserComparison[];
	startDate: string;
	usersTokenUsage: UserTokenUsageData[] | undefined;
}) {
	const dailyPattern = useMemo(
		() =>
			buildDashboardTokenDailyPattern(
				startDate,
				endDate,
				performanceUserDailyTrend,
				modelTokensTrend,
			),
		[endDate, modelTokensTrend, performanceUserDailyTrend, startDate],
	);
	const headlineMetrics = useMemo(
		() =>
			buildDashboardTokenTabMetrics(
				usersTokenUsage,
				dailyPattern,
				modelTokensTrend,
				performanceUserDailyTrend,
			),
		[
			dailyPattern,
			modelTokensTrend,
			performanceUserDailyTrend,
			usersTokenUsage,
		],
	);
	return (
		<section className="@container/tokens-view flex flex-col gap-8">
			<DashboardTokenSnapshotSection
				dailyPattern={dailyPattern}
				isMetricsPending={isSnapshotPending}
				metrics={headlineMetrics}
			/>
			<DashboardTokenDeveloperPanel
				isChartPending={isDeveloperChartPending}
				performanceUserDailyTrend={performanceUserDailyTrend}
				performanceUsers={performanceUsers}
			/>
			<DashboardTokenModelsPanel modelTokensTrend={modelTokensTrend} />
		</section>
	);
}
