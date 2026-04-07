import type { ROIDashboard } from "@rudel/api-routes";
import {
	addMonths,
	addWeeks,
	eachDayOfInterval,
	format,
	parseISO,
	startOfMonth,
	startOfWeek,
} from "date-fns";
import type {
	DashboardDailyPatternPoint,
	DashboardHeadlineMetric,
	DashboardOutputSnapshot,
} from "@/features/dashboard/data/dashboard-static-data";

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
	const startDate = parseISO(roiDashboard.start_date);
	const endDate = parseISO(roiDashboard.end_date);

	if (
		Number.isNaN(startDate.getTime()) ||
		Number.isNaN(endDate.getTime()) ||
		startDate.getTime() > endDate.getTime()
	) {
		return [];
	}

	if (roiDashboard.trend_interval === "day") {
		return eachDayOfInterval({ start: startDate, end: endDate });
	}

	if (roiDashboard.trend_interval === "week") {
		const buckets: Date[] = [];
		let cursor = startOfWeek(startDate, { weekStartsOn: 1 });
		const lastBucket = startOfWeek(endDate, { weekStartsOn: 1 });

		while (cursor.getTime() <= lastBucket.getTime()) {
			buckets.push(cursor);
			cursor = addWeeks(cursor, 1);
		}

		return buckets;
	}

	const buckets: Date[] = [];
	let cursor = startOfMonth(startDate);
	const lastBucket = startOfMonth(endDate);

	while (cursor.getTime() <= lastBucket.getTime()) {
		buckets.push(cursor);
		cursor = addMonths(cursor, 1);
	}

	return buckets;
}

function formatBucketAxisLabel(
	date: Date,
	interval: ROIDashboard["trend_interval"],
) {
	if (interval === "day") {
		return format(date, "EEE");
	}

	if (interval === "week") {
		return format(date, "MMM d");
	}

	return format(date, "MMM");
}

function formatBucketFullLabel(
	date: Date,
	interval: ROIDashboard["trend_interval"],
) {
	if (interval === "day") {
		return format(date, "EEEE, MMM d");
	}

	if (interval === "week") {
		return `Week of ${format(date, "MMM d")}`;
	}

	return format(date, "MMMM yyyy");
}

function buildDailyPattern(
	roiDashboard: ROIDashboard,
): DashboardDailyPatternPoint[] {
	const trendByBucket = new Map(
		roiDashboard.trend.map((row) => [row.bucket_start, row] as const),
	);

	return buildBucketDates(roiDashboard).map((bucketDate) => {
		const bucketKey = format(bucketDate, "yyyy-MM-dd");
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
