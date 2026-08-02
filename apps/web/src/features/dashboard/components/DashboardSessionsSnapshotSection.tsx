import type { SessionAnalytics } from "@rudel/api-routes";
import { Skeleton } from "@/app/ui/skeleton";
import {
	DashboardSessionTrendChart,
	type DashboardSessionTrendChartDatum,
	type DashboardSessionTrendGranularity,
} from "@/features/dashboard/components/DashboardSessionTrendChart";
import { DashboardTokenRecentSessionsTable } from "@/features/dashboard/components/DashboardTokenRecentSessionsTable";
import { DashboardTopChartSection } from "@/features/dashboard/components/DashboardTopChartSection";
import type { DashboardHeadlineMetric } from "@/features/dashboard/data/dashboard-static-data";
import {
	getSessionTimestamp,
	orderSessionsForDisplay,
} from "@/features/sessions/session-ordering";
import {
	addUtcDays,
	addUtcHours,
	addUtcMonths,
	addUtcWeeks,
	formatAnalyticsUtcDate,
	parseAnalyticsUtcDate,
	startOfUtcDay,
	startOfUtcHour,
	startOfUtcMonth,
	startOfUtcWeek,
} from "@/lib/analytics-utc-date";

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
			return startOfUtcHour(date);
		case "day":
			return startOfUtcDay(date);
		case "week":
			return startOfUtcWeek(date);
		case "month":
			return startOfUtcMonth(date);
	}
}

function formatBucketShortLabel(
	date: Date,
	granularity: DashboardSessionTrendGranularity,
) {
	switch (granularity) {
		case "hour":
			return formatAnalyticsUtcDate(date, { hour: "numeric", hour12: true });
		case "day":
			return formatAnalyticsUtcDate(date, { day: "numeric", month: "short" });
		case "week":
			return formatAnalyticsUtcDate(date, { day: "numeric", month: "short" });
		case "month":
			return formatAnalyticsUtcDate(date, {
				month: "short",
				year: "2-digit",
			});
	}
}

function formatBucketFullLabel(
	date: Date,
	granularity: DashboardSessionTrendGranularity,
) {
	switch (granularity) {
		case "hour":
			return formatAnalyticsUtcDate(date, {
				day: "numeric",
				hour: "numeric",
				hour12: true,
				month: "short",
				weekday: "long",
			});
		case "day":
			return formatAnalyticsUtcDate(date, {
				day: "numeric",
				month: "short",
				weekday: "long",
			});
		case "week":
			return `${formatBucketShortLabel(date, "day")} – ${formatBucketShortLabel(addUtcDays(date, 6), "day")}`;
		case "month":
			return formatAnalyticsUtcDate(date, {
				month: "long",
				year: "numeric",
			});
	}
}

function buildBucketSeeds(
	startDate: string,
	endDate: string,
	granularity: DashboardSessionTrendGranularity,
	useRolling24Hours: boolean,
	now: Date,
) {
	if (useRolling24Hours) {
		return Array.from({ length: 24 }, (_, index) =>
			startOfUtcHour(addUtcHours(now, -(23 - index))),
		);
	}

	const intervalStart = parseAnalyticsUtcDate(startDate);
	const intervalEnd = parseAnalyticsUtcDate(endDate);
	const seeds: Date[] = [];
	let cursor: Date;
	let lastBucket: Date;
	let advance: (date: Date) => Date;

	switch (granularity) {
		case "hour":
			cursor = startOfUtcDay(intervalStart);
			lastBucket = addUtcHours(startOfUtcDay(intervalEnd), 23);
			advance = (date) => addUtcHours(date, 1);
			break;
		case "day":
			cursor = startOfUtcDay(intervalStart);
			lastBucket = startOfUtcDay(intervalEnd);
			advance = (date) => addUtcDays(date, 1);
			break;
		case "week":
			cursor = startOfUtcWeek(intervalStart);
			lastBucket = startOfUtcWeek(intervalEnd);
			advance = (date) => addUtcWeeks(date, 1);
			break;
		case "month":
			cursor = startOfUtcMonth(intervalStart);
			lastBucket = startOfUtcMonth(intervalEnd);
			advance = (date) => addUtcMonths(date, 1);
			break;
	}

	while (cursor.getTime() <= lastBucket.getTime()) {
		seeds.push(cursor);
		cursor = advance(cursor);
	}

	return seeds;
}

export function buildSessionTrendData({
	endDate,
	sessions,
	startDate,
	dateRangeDays,
	useRolling24Hours,
	now = new Date(),
}: {
	endDate: string;
	sessions: SessionAnalytics[] | undefined;
	startDate: string;
	dateRangeDays: number;
	useRolling24Hours: boolean;
	now?: Date;
}): DashboardSessionTrendChartDatum[] {
	const granularity = getGranularity(dateRangeDays);
	const bucketSeeds = buildBucketSeeds(
		startDate,
		endDate,
		granularity,
		useRolling24Hours,
		now,
	);
	const rollingWindowStart = addUtcHours(now, -24);
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

		if (
			useRolling24Hours &&
			sessionDate.getTime() <= rollingWindowStart.getTime()
		) {
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

export function getSessionChartTruncationLabel(input: {
	loadedSessionCount: number;
	totalSessionCount: number;
	useRolling24Hours: boolean;
}) {
	if (
		input.useRolling24Hours ||
		input.totalSessionCount <= input.loadedSessionCount
	) {
		return null;
	}

	return `Chart reflects the latest ${input.loadedSessionCount.toLocaleString()} of ${input.totalSessionCount.toLocaleString()} sessions.`;
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
	onSessionClick,
	sessions,
	sessionDetailDisabledNote,
	startDate,
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
	onSessionClick?: (session: SessionAnalytics) => void;
	sessions: SessionAnalytics[] | undefined;
	sessionDetailDisabledNote?: string;
	startDate: string;
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
	const chartTruncationLabel = getSessionChartTruncationLabel({
		loadedSessionCount: sessions?.length ?? 0,
		totalSessionCount,
		useRolling24Hours,
	});

	return (
		<DashboardTopChartSection
			hideMetrics={variant === "sessions"}
			chart={
				isSessionsPending ? (
					<DashboardSessionChartFallback />
				) : (
					<div className="flex min-w-0 flex-col">
						<DashboardSessionTrendChart className="min-w-0" data={chartData} />
						{chartTruncationLabel ? (
							<p className="px-4 pb-2 text-xs text-muted-foreground">
								{chartTruncationLabel}
							</p>
						) : null}
					</div>
				)
			}
			detail={
				<DashboardTokenRecentSessionsTable
					key={sessionsTableKey}
					activeSessionId={activeSessionId}
					canOpenSession={canOpenSession}
					isLoading={isSessionsPending}
					onSessionClick={onSessionClick}
					sessions={latestSessions}
					sessionDetailDisabledNote={sessionDetailDisabledNote}
					showHeader={false}
					totalSessionCount={
						useRolling24Hours ? latestSessions.length : totalSessionCount
					}
				/>
			}
			isMetricsLoading={isMetricsPending}
			metrics={metrics}
			showDelta
		/>
	);
}
