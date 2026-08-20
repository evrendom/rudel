import type { SessionAnalytics } from "@rudel/api-routes";
import {
	addDays,
	eachDayOfInterval,
	eachHourOfInterval,
	eachMonthOfInterval,
	eachWeekOfInterval,
	endOfDay,
	format,
	isAfter,
	parseISO,
	startOfDay,
	startOfHour,
	startOfMonth,
	startOfWeek,
	subHours,
} from "date-fns";
import type { Ref } from "react";
import { Skeleton } from "@/app/ui/skeleton";
import {
	DashboardSessionTrendChart,
	type DashboardSessionTrendChartDatum,
	type DashboardSessionTrendGranularity,
} from "@/features/dashboard/components/DashboardSessionTrendChart";
import { DashboardTokenRecentSessionsTable } from "@/features/dashboard/components/DashboardTokenRecentSessionsTable";
import { DashboardTopChartSection } from "@/features/dashboard/components/DashboardTopChartSection";
import type { DashboardHeadlineMetric } from "@/features/dashboard/data/dashboard-static-data";
import { SessionsOverviewTable } from "@/features/sessions/components/sessions-overview-table";
import {
	getSessionTimestamp,
	orderSessionsForDisplay,
} from "@/features/sessions/session-ordering";

const dashboardSessionChartSkeletonHeights = [
	"h-[8rem]",
	"h-[10rem]",
	"h-[6.75rem]",
	"h-[11rem]",
	"h-[8.5rem]",
	"h-[9.5rem]",
] as const;

function getGranularity(
	dateRangeDays: number,
): DashboardSessionTrendGranularity {
	if (dateRangeDays <= 1) {
		return "hour";
	}

	if (dateRangeDays <= 31) {
		return "day";
	}

	if (dateRangeDays <= 120) {
		return "week";
	}

	return "month";
}

function getBucketDate(
	date: Date,
	granularity: DashboardSessionTrendGranularity,
) {
	switch (granularity) {
		case "hour":
			return startOfHour(date);
		case "day":
			return startOfDay(date);
		case "week":
			return startOfWeek(date, { weekStartsOn: 1 });
		case "month":
			return startOfMonth(date);
	}
}

function formatBucketShortLabel(
	date: Date,
	granularity: DashboardSessionTrendGranularity,
) {
	switch (granularity) {
		case "hour":
			return format(date, "ha");
		case "day":
			return format(date, "MMM d");
		case "week":
			return format(date, "MMM d");
		case "month":
			return format(date, "MMM yy");
	}
}

function formatBucketFullLabel(
	date: Date,
	granularity: DashboardSessionTrendGranularity,
) {
	switch (granularity) {
		case "hour":
			return format(date, "EEEE, MMM d • ha");
		case "day":
			return format(date, "EEEE, MMM d");
		case "week":
			return `${format(date, "MMM d")} – ${format(addDays(date, 6), "MMM d")}`;
		case "month":
			return format(date, "MMMM yyyy");
	}
}

function buildBucketSeeds(
	startDate: string,
	endDate: string,
	granularity: DashboardSessionTrendGranularity,
	useRolling24Hours: boolean,
) {
	if (useRolling24Hours) {
		const now = new Date();

		return Array.from({ length: 24 }, (_, index) =>
			startOfHour(subHours(now, 23 - index)),
		);
	}

	const intervalStart = parseISO(startDate);
	const intervalEnd = parseISO(endDate);

	switch (granularity) {
		case "hour":
			return eachHourOfInterval({
				start: startOfDay(intervalStart),
				end: endOfDay(intervalEnd),
			}).map((date) => startOfHour(date));
		case "day":
			return eachDayOfInterval({
				start: intervalStart,
				end: intervalEnd,
			}).map((date) => startOfDay(date));
		case "week":
			return eachWeekOfInterval(
				{
					start: intervalStart,
					end: intervalEnd,
				},
				{ weekStartsOn: 1 },
			).map((date) => startOfWeek(date, { weekStartsOn: 1 }));
		case "month":
			return eachMonthOfInterval({
				start: intervalStart,
				end: intervalEnd,
			}).map((date) => startOfMonth(date));
	}
}

function buildSessionTrendData({
	endDate,
	sessions,
	startDate,
	dateRangeDays,
	useRolling24Hours,
}: {
	endDate: string;
	sessions: SessionAnalytics[] | undefined;
	startDate: string;
	dateRangeDays: number;
	useRolling24Hours: boolean;
}): DashboardSessionTrendChartDatum[] {
	const granularity = getGranularity(dateRangeDays);
	const bucketSeeds = buildBucketSeeds(
		startDate,
		endDate,
		granularity,
		useRolling24Hours,
	);
	const rollingWindowStart = subHours(new Date(), 24);
	const bucketMap = new Map(
		bucketSeeds.map((date) => [
			date.toISOString(),
			{
				activeUsers: new Set<string>(),
				date,
				sessionCount: 0,
				totalDurationMin: 0,
				totalTokens: 0,
			},
		]),
	);

	for (const session of sessions ?? []) {
		const sessionDate = getSessionTimestamp(session.session_date);

		if (Number.isNaN(sessionDate.getTime())) {
			continue;
		}

		if (useRolling24Hours && !isAfter(sessionDate, rollingWindowStart)) {
			continue;
		}

		const bucketDate = getBucketDate(sessionDate, granularity);
		const bucketKey = bucketDate.toISOString();
		const bucket = bucketMap.get(bucketKey);

		if (!bucket) {
			continue;
		}

		bucket.sessionCount += 1;
		bucket.totalTokens += session.total_tokens;
		bucket.totalDurationMin += session.duration_min;
		bucket.activeUsers.add(session.user_id);
	}

	return bucketSeeds.map((date) => {
		const bucket = bucketMap.get(date.toISOString());

		return {
			activeUsers: bucket?.activeUsers.size ?? 0,
			fullLabel: formatBucketFullLabel(date, granularity),
			granularity,
			id: date.toISOString(),
			sessionCount: bucket?.sessionCount ?? 0,
			shortLabel: formatBucketShortLabel(date, granularity),
			totalDurationMin: bucket?.totalDurationMin ?? 0,
			totalTokens: bucket?.totalTokens ?? 0,
		};
	});
}

function DashboardSessionChartFallback() {
	return (
		<div className="flex h-[12.875rem] items-end gap-3 px-4 pb-8 pt-4">
			{dashboardSessionChartSkeletonHeights.map((heightClassName) => (
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
	activeSessionId,
	canOpenSession,
	endDate,
	dateRangeDays,
	isMetricsPending = false,
	isSessionsPending,
	metrics,
	getSessionHref,
	getSessionLinkState,
	onSessionClick,
	overviewSessionCount,
	sessions,
	sessionDetailDisabledNote,
	showChart = true,
	startDate,
	tableScrollContainerRef,
	totalSessionCount,
	useRolling24Hours = false,
	variant,
}: {
	activeSessionId?: string | null;
	canOpenSession?: (session: SessionAnalytics) => boolean;
	endDate: string;
	dateRangeDays: number;
	isMetricsPending?: boolean;
	isSessionsPending: boolean;
	metrics: DashboardHeadlineMetric[];
	getSessionHref?: (session: SessionAnalytics) => string;
	getSessionLinkState?: (session: SessionAnalytics) => unknown;
	onSessionClick?: (session: SessionAnalytics) => void;
	overviewSessionCount?: number;
	sessions: SessionAnalytics[] | undefined;
	sessionDetailDisabledNote?: string;
	showChart?: boolean;
	startDate: string;
	tableScrollContainerRef?: Ref<HTMLDivElement>;
	totalSessionCount: number;
	useRolling24Hours?: boolean;
	variant: "dashboard" | "sessions";
}) {
	const chartData = buildSessionTrendData({
		endDate,
		sessions,
		startDate,
		dateRangeDays,
		useRolling24Hours,
	});
	const latestSessions = orderSessionsForDisplay({
		sessions,
		useRolling24Hours,
	});
	const sessionsTableKey = `${latestSessions.length}:${latestSessions[0]?.session_id ?? ""}:${latestSessions.at(-1)?.session_id ?? ""}`;
	const resolvedTotalSessionCount = useRolling24Hours
		? latestSessions.length
		: totalSessionCount;
	const sessionsTable =
		variant === "sessions" ? (
			<SessionsOverviewTable
				key={sessionsTableKey}
				activeSessionId={activeSessionId}
				canOpenSession={canOpenSession}
				getSessionHref={getSessionHref}
				getSessionLinkState={getSessionLinkState}
				isLoading={isSessionsPending}
				onSessionClick={onSessionClick}
				scrollContainerRef={tableScrollContainerRef}
				sessionCountLabel={overviewSessionCount ?? resolvedTotalSessionCount}
				sessions={latestSessions}
				sessionDetailDisabledNote={sessionDetailDisabledNote}
				totalSessionCount={resolvedTotalSessionCount}
			/>
		) : (
			<DashboardTokenRecentSessionsTable
				key={sessionsTableKey}
				activeSessionId={activeSessionId}
				canOpenSession={canOpenSession}
				isLoading={isSessionsPending}
				onSessionClick={onSessionClick}
				sessions={latestSessions}
				sessionDetailDisabledNote={sessionDetailDisabledNote}
				showHeader={false}
				totalSessionCount={resolvedTotalSessionCount}
			/>
		);

	if (!showChart) {
		return sessionsTable;
	}

	return (
		<DashboardTopChartSection
			hideMetrics={variant === "sessions"}
			chart={
				isSessionsPending ? (
					<DashboardSessionChartFallback />
				) : (
					<DashboardSessionTrendChart className="min-w-0" data={chartData} />
				)
			}
			detail={sessionsTable}
			isMetricsLoading={isMetricsPending}
			metrics={metrics}
			showDelta
		/>
	);
}
