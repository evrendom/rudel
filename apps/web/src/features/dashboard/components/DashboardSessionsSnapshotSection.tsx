import type { SessionAnalytics } from "@rudel/api-routes";
import { format } from "date-fns";
import { Skeleton } from "@/app/ui/skeleton";
import { DashboardRecentSessionsTable } from "@/features/dashboard/components/DashboardRecentSessionsTable";
import {
	DashboardSessionChart,
	type DashboardSessionChartDatum,
} from "@/features/dashboard/components/DashboardSessionChart";
import { DashboardInteractiveTopChartSection } from "@/features/dashboard/components/DashboardTopChartSection";
import type { DashboardHeadlineMetric } from "@/features/dashboard/data/dashboard-static-data";

function getRepositoryLabel(session: SessionAnalytics) {
	const primaryPath = session.repository || session.project_path;
	const segments = primaryPath.split("/").filter(Boolean);

	if (segments.length === 0) {
		return "—";
	}

	return segments.slice(-2).join("/");
}

function formatSessionAxisLabel(value: string) {
	const normalizedValue = value.endsWith("Z") ? value : `${value}Z`;
	const date = new Date(normalizedValue);

	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return format(date, "ha");
}

function buildSessionChartData(
	sessions: SessionAnalytics[] | undefined,
): DashboardSessionChartDatum[] {
	return (sessions ?? []).map((session) => {
		const repositoryLabel = getRepositoryLabel(session);

		return {
			developerLabel: session.user_id,
			durationLabel: `${Math.round(session.duration_min)}m`,
			id: session.session_id,
			inputTokens: session.input_tokens,
			label: `${session.user_id} • ${repositoryLabel}`,
			modelLabel: session.model_used || "—",
			outputTokens: session.output_tokens,
			repositoryLabel,
			sessionDate: session.session_date,
			shortLabel: formatSessionAxisLabel(session.session_date),
			skillCount: session.skills.length,
			totalTokens: session.total_tokens,
		};
	});
}

function DashboardSessionChartFallback() {
	const skeletonHeights = [
		"h-[8rem]",
		"h-[10rem]",
		"h-[6.75rem]",
		"h-[11rem]",
		"h-[8.5rem]",
		"h-[9.5rem]",
	] as const;

	return (
		<div className="flex h-[12.875rem] items-end gap-3 px-4 pb-8 pt-4">
			{skeletonHeights.map((heightClassName) => (
				<div
					key={heightClassName}
					className="flex min-w-0 flex-1 flex-col items-center gap-3"
				>
					<Skeleton
						className={`w-full max-w-[44px] rounded-xl bg-muted/70 ${heightClassName}`}
					/>
					<Skeleton className="h-3 w-16 rounded-full bg-muted/60" />
				</div>
			))}
		</div>
	);
}

export function DashboardSessionsSnapshotSection({
	isMetricsPending = false,
	isSessionsPending,
	metrics,
	recentSessions,
	showDelta = false,
	totalSessionCount,
}: {
	isMetricsPending?: boolean;
	isSessionsPending: boolean;
	metrics: DashboardHeadlineMetric[];
	recentSessions: SessionAnalytics[] | undefined;
	showDelta?: boolean;
	totalSessionCount: number;
}) {
	const chartData = buildSessionChartData(recentSessions);

	return (
		<DashboardInteractiveTopChartSection
			isMetricsLoading={isMetricsPending}
			metrics={metrics}
			showDelta={showDelta}
			renderChart={({
				highlightedItemId,
				highlightSource,
				onHighlightItemChange,
			}) =>
				isSessionsPending ? (
					<DashboardSessionChartFallback />
				) : chartData.length > 0 ? (
					<DashboardSessionChart
						activeId={highlightedItemId}
						className="min-w-0"
						data={chartData}
						highlightSource={highlightSource}
						onHighlightSessionChange={onHighlightItemChange}
					/>
				) : (
					<div className="flex h-[12.875rem] w-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
						No recent sessions in the selected range.
					</div>
				)
			}
			renderDetail={({
				highlightedItemId,
				highlightSource,
				onHighlightItemChange,
			}) => (
				<DashboardRecentSessionsTable
					highlightSource={highlightSource}
					highlightedSessionId={highlightedItemId}
					isLoading={isSessionsPending}
					onHighlightSessionChange={onHighlightItemChange}
					sessions={recentSessions}
					showHeader={false}
					totalSessionCount={totalSessionCount}
				/>
			)}
		/>
	);
}
