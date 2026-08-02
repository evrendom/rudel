import type { ROIDashboard } from "@rudel/api-routes";
import type {
	DashboardDailyPatternPoint,
	DashboardHeadlineMetric,
	DashboardOutputSnapshot,
} from "@/features/dashboard/data/dashboard-static-data";
import {
	addUtcDays,
	addUtcMonths,
	addUtcWeeks,
	formatAnalyticsUtcDate,
	formatAnalyticsUtcDateKey,
	parseAnalyticsUtcDate,
	startOfUtcDay,
	startOfUtcMonth,
	startOfUtcWeek,
} from "@/lib/analytics-utc-date";

function formatMetricValue(value: number) {
	return new Intl.NumberFormat("en-US").format(value);
}

function getCommitRate(commits: number, sessions: number) {
	if (sessions <= 0) {
		return 0;
	}

	return Math.round((commits / sessions) * 100);
}

function buildHeadlineMetrics(
	currentMetrics: DashboardHeadlineMetric[],
	roiDashboard: ROIDashboard,
) {
	const committedSessions = roiDashboard.summary.total_commits;
	const totalSessions = roiDashboard.summary.total_sessions;
	const uncommittedSessions = Math.max(totalSessions - committedSessions, 0);
	const commitRate = getCommitRate(committedSessions, totalSessions);

	return currentMetrics.map((metric) => {
		if (metric.id === "uncommitted") {
			return {
				...metric,
				label: "Uncommitted sessions",
				valueLabel: formatMetricValue(uncommittedSessions),
			};
		}

		if (metric.id === "sessions") {
			return {
				...metric,
				valueLabel: formatMetricValue(totalSessions),
			};
		}

		return {
			...metric,
			valueLabel: `${commitRate}%`,
		};
	});
}

function buildBucketDates(roiDashboard: ROIDashboard) {
	const startDate = parseAnalyticsUtcDate(roiDashboard.start_date);
	const endDate = parseAnalyticsUtcDate(roiDashboard.end_date);

	if (
		Number.isNaN(startDate.getTime()) ||
		Number.isNaN(endDate.getTime()) ||
		startDate.getTime() > endDate.getTime()
	) {
		return [];
	}

	if (roiDashboard.trend_interval === "day") {
		const buckets: Date[] = [];
		let cursor = startOfUtcDay(startDate);
		const lastBucket = startOfUtcDay(endDate);

		while (cursor.getTime() <= lastBucket.getTime()) {
			buckets.push(cursor);
			cursor = addUtcDays(cursor, 1);
		}

		return buckets;
	}

	if (roiDashboard.trend_interval === "week") {
		const buckets: Date[] = [];
		let cursor = startOfUtcWeek(startDate);
		const lastBucket = startOfUtcWeek(endDate);

		while (cursor.getTime() <= lastBucket.getTime()) {
			buckets.push(cursor);
			cursor = addUtcWeeks(cursor, 1);
		}

		return buckets;
	}

	const buckets: Date[] = [];
	let cursor = startOfUtcMonth(startDate);
	const lastBucket = startOfUtcMonth(endDate);

	while (cursor.getTime() <= lastBucket.getTime()) {
		buckets.push(cursor);
		cursor = addUtcMonths(cursor, 1);
	}

	return buckets;
}

function formatBucketAxisLabel(
	date: Date,
	interval: ROIDashboard["trend_interval"],
) {
	if (interval === "day") {
		return formatAnalyticsUtcDate(date, { weekday: "short" });
	}

	if (interval === "week") {
		return formatAnalyticsUtcDate(date, { day: "numeric", month: "short" });
	}

	return formatAnalyticsUtcDate(date, { month: "short" });
}

function formatBucketFullLabel(
	date: Date,
	interval: ROIDashboard["trend_interval"],
) {
	if (interval === "day") {
		return formatAnalyticsUtcDate(date, {
			day: "numeric",
			month: "short",
			weekday: "long",
		});
	}

	if (interval === "week") {
		return `Week of ${formatAnalyticsUtcDate(date, { day: "numeric", month: "short" })}`;
	}

	return formatAnalyticsUtcDate(date, { month: "long", year: "numeric" });
}

function buildDailyPattern(
	roiDashboard: ROIDashboard,
): DashboardDailyPatternPoint[] {
	const trendByBucket = new Map(
		roiDashboard.trend.map((row) => [row.bucket_start, row] as const),
	);

	return buildBucketDates(roiDashboard).map((bucketDate) => {
		const bucketKey = formatAnalyticsUtcDateKey(bucketDate);
		const bucket = trendByBucket.get(bucketKey);
		const sessions = bucket?.total_sessions ?? null;
		const commits = bucket?.total_commits ?? null;

		return {
			date: bucketKey,
			axisLabel: formatBucketAxisLabel(bucketDate, roiDashboard.trend_interval),
			fullLabel: formatBucketFullLabel(bucketDate, roiDashboard.trend_interval),
			commits,
			sessions,
			commitRate:
				sessions != null && commits != null && sessions > 0
					? getCommitRate(commits, sessions)
					: null,
		};
	});
}

export function mergeDashboardSnapshotWithRoi(
	currentSnapshot: DashboardOutputSnapshot,
	roiDashboard: ROIDashboard | undefined,
): DashboardOutputSnapshot {
	if (!roiDashboard) {
		return currentSnapshot;
	}

	return {
		...currentSnapshot,
		headlineMetrics: buildHeadlineMetrics(
			currentSnapshot.headlineMetrics,
			roiDashboard,
		),
		dailyPattern: buildDailyPattern(roiDashboard),
	};
}
