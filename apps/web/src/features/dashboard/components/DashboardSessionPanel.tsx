import type { SessionAnalytics } from "@rudel/api-routes";
import { isToday } from "date-fns";
import { Clock3Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { Skeleton } from "@/app/ui/skeleton";
import { DashboardAnalysisPanel } from "@/features/dashboard/components/DashboardAnalysisPanel";
import {
	DashboardSessionChart,
	type DashboardSessionChartDatum,
} from "@/features/dashboard/components/DashboardSessionChart";
import { DashboardTokenRecentSessionsTable } from "@/features/dashboard/components/DashboardTokenRecentSessionsTable";
import { useUserMap } from "@/hooks/useUserMap";
import { formatMinutes, formatUsername } from "@/lib/format";

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

	if (isToday(date)) {
		return date.toLocaleTimeString(undefined, {
			hour: "numeric",
			minute: "2-digit",
		});
	}

	return date.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

function buildSessionChartData(
	sessions: SessionAnalytics[],
	userMap: Record<string, string | undefined>,
): DashboardSessionChartDatum[] {
	return sessions.map((session) => {
		const developerLabel = formatUsername(session.user_id, userMap);
		const repositoryLabel = getRepositoryLabel(session);

		return {
			developerLabel,
			durationLabel: formatMinutes(session.duration_min),
			id: session.session_id,
			label: `${developerLabel} • ${repositoryLabel}`,
			modelLabel: session.model_used || "—",
			repositoryLabel,
			shortLabel: formatSessionAxisLabel(session.session_date),
			skillCount: session.skills.length,
			value: session.total_tokens,
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
		<div className="flex h-full items-end gap-3 px-4 pb-8 pt-4">
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

export function DashboardSessionPanel({
	isLoading = false,
	sessions,
	totalSessionCount,
}: {
	isLoading?: boolean;
	sessions: SessionAnalytics[] | undefined;
	totalSessionCount: number;
}) {
	const [highlightedSessionId, setHighlightedSessionId] = useState<
		string | null
	>(null);
	const { userMap } = useUserMap();
	const resolvedSessions = sessions ?? [];
	const chartData = useMemo(
		() => buildSessionChartData(resolvedSessions, userMap),
		[resolvedSessions, userMap],
	);
	const hasSessionData = resolvedSessions.length > 0;

	return (
		<DashboardAnalysisPanel
			title="Latest sessions"
			icon={
				<Clock3Icon className="size-5 text-[color:var(--dashboardy-heading)]" />
			}
			controls={
				!isLoading && hasSessionData ? (
					<p className="text-[13px] font-medium text-[color:var(--dashboardy-muted)]">
						Last {resolvedSessions.length} sessions
					</p>
				) : null
			}
			chartShellDataSlot="dashboard-session-chart-shell"
			showTableDivider={!isLoading && hasSessionData}
			chartContent={
				isLoading ? (
					<DashboardSessionChartFallback />
				) : hasSessionData ? (
					<DashboardSessionChart
						activeId={highlightedSessionId}
						data={chartData}
					/>
				) : (
					<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
						No recent sessions in the selected range.
					</div>
				)
			}
			tableContent={
				isLoading || hasSessionData ? (
					<DashboardTokenRecentSessionsTable
						isLoading={isLoading}
						onHighlightSessionChange={setHighlightedSessionId}
						sessions={resolvedSessions}
						showHeader={false}
						totalSessionCount={totalSessionCount}
					/>
				) : null
			}
		/>
	);
}
