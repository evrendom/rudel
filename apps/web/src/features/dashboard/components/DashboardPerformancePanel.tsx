import { lazy, Suspense, useMemo, useState } from "react";
import { Skeleton } from "@/app/ui/skeleton";
import { DashboardDailyOverviewTable } from "@/features/dashboard/components/DashboardDailyOverviewTable";
import { DashboardDailyPatternChart } from "@/features/dashboard/components/DashboardDailyPatternChart";
import { DashboardHeadlineMetricGrid } from "@/features/dashboard/components/DashboardHeadlineMetricGrid";
import type { DashboardPerformanceDatum } from "@/features/dashboard/components/DashboardPerformanceChart";
import { DashboardPerformanceRosterTable } from "@/features/dashboard/components/DashboardPerformanceRosterTable";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";
import type { DashboardOutputSnapshot } from "@/features/dashboard/data/dashboard-static-data";
import { cn } from "@/lib/utils";

type DailyHighlightSource = "chart" | "table";

const DashboardPerformanceChart = lazy(async () => {
	const module = await import(
		"@/features/dashboard/components/DashboardPerformanceChart"
	);

	return { default: module.DashboardPerformanceChart };
});

function getMemberAxisLabel(fullLabel: string) {
	const emailSafeLabel = fullLabel.includes("@")
		? (fullLabel.split("@")[0] ?? fullLabel)
		: fullLabel;

	return emailSafeLabel.split(" ")[0] ?? emailSafeLabel;
}

function getMemberAxisLabels(memberLabels: string[]) {
	const labelCounts = new Map<string, number>();

	for (const fullLabel of memberLabels) {
		const axisLabel = getMemberAxisLabel(fullLabel);
		labelCounts.set(axisLabel, (labelCounts.get(axisLabel) ?? 0) + 1);
	}

	return memberLabels.map((fullLabel) => {
		const axisLabel = getMemberAxisLabel(fullLabel);

		if ((labelCounts.get(axisLabel) ?? 0) <= 1) {
			return axisLabel;
		}

		const fallbackToken = fullLabel.includes("@")
			? (fullLabel.split("@")[0] ?? fullLabel)
			: fullLabel;
		const [firstName, lastName] = fallbackToken.split(/\s+/);
		const lastInitial = lastName?.[0]?.toUpperCase();

		return lastInitial ? `${firstName} ${lastInitial}.` : fallbackToken;
	});
}

function buildChartData(
	performanceUsers: DashboardPerformanceUserComparison[],
): DashboardPerformanceDatum[] {
	const axisLabels = getMemberAxisLabels(
		performanceUsers.map((user) => user.label),
	);

	return performanceUsers.map((user, index) => ({
		commits: user.commits,
		id:
			user.userId ||
			`${user.label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${index}`,
		axisLabel: axisLabels[index] ?? user.label,
		fullLabel: user.label,
		imageUrl: user.imageUrl ?? undefined,
		sessions: user.sessions,
	}));
}

function DashboardPerformanceChartFallback() {
	const skeletonHeights = [
		"h-[8.25rem]",
		"h-[10rem]",
		"h-[7rem]",
		"h-[12rem]",
		"h-[9rem]",
		"h-[11rem]",
		"h-[8rem]",
	];

	return (
		<div className="flex h-full items-end gap-3 px-4 pb-8 pt-4">
			{skeletonHeights.map((heightClassName) => (
				<div
					key={heightClassName}
					className="flex min-w-0 flex-1 flex-col items-center gap-3"
				>
					<Skeleton
						className={cn(
							"w-full max-w-[34px] rounded-xl bg-muted/70",
							heightClassName,
						)}
					/>
					<Skeleton className="h-3 w-12 rounded-full bg-muted/60" />
				</div>
			))}
		</div>
	);
}

function DashboardDailyPerformanceSnapshot({
	snapshot,
}: {
	snapshot: DashboardOutputSnapshot;
}) {
	const [highlightedDailyDate, setHighlightedDailyDate] = useState<
		string | null
	>(null);
	const [highlightedDailySource, setHighlightedDailySource] =
		useState<DailyHighlightSource | null>(null);

	function handleDailyHighlightChange(
		date: string | null,
		source: DailyHighlightSource,
	) {
		setHighlightedDailyDate(date);
		setHighlightedDailySource(date ? source : null);
	}

	return (
		<div className="flex flex-col gap-8">
			<div className="flex flex-1 flex-col border-b border-[color:var(--dashboardy-divider)] lg:flex-row lg:items-center lg:gap-0">
				<div className="flex flex-1 flex-col justify-center pb-4 pt-0 lg:pb-4">
					<DashboardHeadlineMetricGrid
						metrics={snapshot.headlineMetrics}
						className="pb-0"
						showDelta={false}
					/>
				</div>
				<div className="flex flex-1 items-center pt-0 lg:max-w-[760px] 2xl:max-w-[820px]">
					<DashboardDailyPatternChart
						data={snapshot.dailyPattern}
						className="min-w-0"
						highlightedDate={highlightedDailyDate}
						highlightSource={highlightedDailySource}
						onHighlightDateChange={(date) =>
							handleDailyHighlightChange(date, "chart")
						}
					/>
				</div>
			</div>
			<DashboardDailyOverviewTable
				data={snapshot.dailyPattern}
				highlightedDate={highlightedDailyDate}
				highlightSource={highlightedDailySource}
				onHighlightDateChange={(date) =>
					handleDailyHighlightChange(date, "table")
				}
			/>
		</div>
	);
}

export function DashboardPerformancePanel({
	isChartPending,
	performanceUsers,
	snapshot,
}: {
	isChartPending: boolean;
	performanceUsers: DashboardPerformanceUserComparison[];
	snapshot: DashboardOutputSnapshot;
}) {
	const selectedChartData = useMemo(
		() => buildChartData(performanceUsers),
		[performanceUsers],
	);
	const hasChartData = selectedChartData.length > 0;

	return (
		<section className="@container/performance-panel flex flex-col gap-8">
			<DashboardDailyPerformanceSnapshot snapshot={snapshot} />

			<div className="flex flex-col gap-8">
				<div className="overflow-hidden rounded-[1.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)]">
					<div className="px-3 py-2 sm:px-4 sm:py-3">
						<div
							data-slot="dashboard-performance-chart-shell"
							className="h-[18.5rem] sm:h-[20rem]"
						>
							{isChartPending ? (
								<DashboardPerformanceChartFallback />
							) : hasChartData ? (
								<Suspense fallback={<DashboardPerformanceChartFallback />}>
									<DashboardPerformanceChart data={selectedChartData} />
								</Suspense>
							) : (
								<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
									No developer activity in the selected range.
								</div>
							)}
						</div>
					</div>
				</div>
				<div className="border-t border-[color:var(--dashboardy-divider)] pt-8">
					<DashboardPerformanceRosterTable
						performanceUsers={performanceUsers}
					/>
				</div>
			</div>
		</section>
	);
}
