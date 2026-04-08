import type {
	ModelTokensTrendData,
	RepositoryDailyTrendData,
	SessionAnalyticsSummaryComparison,
	UserDailyTrendData,
	UserTokenUsageData,
} from "@rudel/api-routes";
import { eachDayOfInterval, format, parseISO } from "date-fns";
import type { DashboardRepositorySummaryRow } from "@/features/dashboard/data/dashboard-repository-trend";
import type {
	DashboardDailyPatternPoint,
	DashboardDeltaTone,
	DashboardHeadlineMetric,
} from "@/features/dashboard/data/dashboard-static-data";
import { calculateCost, formatCompactWholeCurrency } from "@/lib/format";

export type DashboardTokenDailyPoint = {
	avgTokensPerSession: number | null;
	axisLabel: string;
	date: string;
	fullLabel: string;
	inputTokens: number;
	outputTokens: number;
	sessions: number;
	totalTokens: number;
};

function formatSignedPercentChange(value: number) {
	if (!Number.isFinite(value) || value === 0) {
		return "0%";
	}

	const roundedValue =
		Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
	return `${value > 0 ? "+" : ""}${roundedValue}%`;
}

function formatCompactNumber(value: number) {
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}

	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(1)}K`;
	}

	return value.toLocaleString();
}

function getDeltaTone(
	value: number,
	options?: {
		inverse?: boolean;
	},
): DashboardDeltaTone {
	if (!Number.isFinite(value) || value === 0) {
		return "neutral";
	}

	const isPositive = options?.inverse ? value < 0 : value > 0;
	return isPositive ? "positive" : "negative";
}

function buildDateRange(startDate: string, endDate: string) {
	const parsedStartDate = parseISO(startDate);
	const parsedEndDate = parseISO(endDate);

	if (
		Number.isNaN(parsedStartDate.getTime()) ||
		Number.isNaN(parsedEndDate.getTime())
	) {
		return [];
	}

	return eachDayOfInterval({
		start:
			parsedStartDate.getTime() <= parsedEndDate.getTime()
				? parsedStartDate
				: parsedEndDate,
		end:
			parsedStartDate.getTime() <= parsedEndDate.getTime()
				? parsedEndDate
				: parsedStartDate,
	});
}

function buildDailyPattern(
	startDate: string,
	endDate: string,
	rowsByDate: Map<string, { commits: number; sessions: number }>,
): DashboardDailyPatternPoint[] {
	return buildDateRange(startDate, endDate).map((date) => {
		const isoDate = format(date, "yyyy-MM-dd");
		const row = rowsByDate.get(isoDate);
		const sessions = row?.sessions ?? null;
		const commits = row?.commits ?? null;

		return {
			date: isoDate,
			axisLabel: format(date, "EEE"),
			fullLabel: format(date, "EEEE, MMM d"),
			commits,
			sessions,
			commitRate:
				sessions != null && commits != null && sessions > 0
					? Math.round((commits / sessions) * 100)
					: null,
		};
	});
}

export function buildDashboardDailyPatternFromUserTrend(
	startDate: string,
	endDate: string,
	rows: UserDailyTrendData[] | undefined,
): DashboardDailyPatternPoint[] {
	const rowsByDate = new Map<string, { commits: number; sessions: number }>();

	for (const row of rows ?? []) {
		const currentRow = rowsByDate.get(row.date) ?? {
			commits: 0,
			sessions: 0,
		};
		currentRow.commits += row.total_commits;
		currentRow.sessions += row.sessions;
		rowsByDate.set(row.date, currentRow);
	}

	return buildDailyPattern(startDate, endDate, rowsByDate);
}

export function buildDashboardDailyPatternFromRepositoryTrend(
	startDate: string,
	endDate: string,
	rows: RepositoryDailyTrendData[] | undefined,
): DashboardDailyPatternPoint[] {
	const rowsByDate = new Map<string, { commits: number; sessions: number }>();

	for (const row of rows ?? []) {
		const currentRow = rowsByDate.get(row.date) ?? {
			commits: 0,
			sessions: 0,
		};
		currentRow.commits += row.total_commits;
		currentRow.sessions += row.sessions;
		rowsByDate.set(row.date, currentRow);
	}

	return buildDailyPattern(startDate, endDate, rowsByDate);
}

export function buildDashboardRepositoryTabMetrics(
	rows: DashboardRepositorySummaryRow[],
): DashboardHeadlineMetric[] {
	const totalSessions = rows.reduce((sum, row) => sum + row.sessions, 0);
	const totalCommits = rows.reduce((sum, row) => sum + row.commits, 0);
	const repoCount = rows.length;
	const averageSessionsPerRepo =
		repoCount > 0 ? totalSessions / Math.max(repoCount, 1) : 0;
	const commitRate =
		totalSessions > 0 ? Math.round((totalCommits / totalSessions) * 100) : 0;

	return [
		{
			id: "sessions",
			label: "Repos touched",
			valueLabel: repoCount.toString(),
			deltaLabel: "0",
			deltaTone: "neutral",
			description: "Unique repositories active in the selected range.",
		},
		{
			id: "uncommitted",
			label: "Avg sessions / repo",
			valueLabel: repoCount > 0 ? averageSessionsPerRepo.toFixed(1) : "0.0",
			deltaLabel: "0",
			deltaTone: "neutral",
			description: "Average session volume across active repositories.",
		},
		{
			id: "commitRate",
			label: "Repo commit rate",
			valueLabel: `${commitRate}%`,
			deltaLabel: "0",
			deltaTone: "neutral",
			description: "Committed sessions divided by all repository sessions.",
		},
	];
}

export function buildDashboardSessionTabMetrics(
	summaryComparison: SessionAnalyticsSummaryComparison | undefined,
): DashboardHeadlineMetric[] {
	const current = summaryComparison?.current;
	const changes = summaryComparison?.changes;
	const totalSessions = current?.total_sessions ?? 0;
	const avgDuration = current?.avg_session_duration_min ?? 0;
	const avgResponseTime = current?.avg_response_time_sec ?? 0;
	const totalSessionChange = changes?.total_sessions ?? 0;
	const avgDurationChange = changes?.avg_session_duration_min ?? 0;
	const avgResponseTimeChange = changes?.avg_response_time_sec ?? 0;

	return [
		{
			id: "sessions",
			label: "Sessions run",
			valueLabel: totalSessions.toString(),
			deltaLabel: formatSignedPercentChange(totalSessionChange),
			deltaTone: getDeltaTone(totalSessionChange),
			description: "Total AI sessions in the selected range.",
		},
		{
			id: "uncommitted",
			label: "Avg duration",
			valueLabel: `${avgDuration.toFixed(1)}m`,
			deltaLabel: formatSignedPercentChange(avgDurationChange),
			deltaTone: getDeltaTone(avgDurationChange, { inverse: true }),
			description: "Average session duration.",
		},
		{
			id: "commitRate",
			label: "Avg response",
			valueLabel: `${avgResponseTime.toFixed(1)}s`,
			deltaLabel: formatSignedPercentChange(avgResponseTimeChange),
			deltaTone: getDeltaTone(avgResponseTimeChange, { inverse: true }),
			description: "Average time between session interactions.",
		},
	];
}

export function buildDashboardTokenDailyPattern(
	startDate: string,
	endDate: string,
	userRows: UserDailyTrendData[] | undefined,
	modelRows: ModelTokensTrendData[] | undefined,
): DashboardTokenDailyPoint[] {
	const sessionsByDate = new Map<string, number>();
	const tokensByDate = new Map<
		string,
		{
			inputTokens: number;
			outputTokens: number;
		}
	>();

	for (const row of userRows ?? []) {
		sessionsByDate.set(
			row.date,
			(sessionsByDate.get(row.date) ?? 0) + row.sessions,
		);
	}

	for (const row of modelRows ?? []) {
		const currentRow = tokensByDate.get(row.date) ?? {
			inputTokens: 0,
			outputTokens: 0,
		};
		currentRow.inputTokens += row.input_tokens;
		currentRow.outputTokens += row.output_tokens;
		tokensByDate.set(row.date, currentRow);
	}

	return buildDateRange(startDate, endDate).map((date) => {
		const isoDate = format(date, "yyyy-MM-dd");
		const sessions = sessionsByDate.get(isoDate) ?? 0;
		const tokensRow = tokensByDate.get(isoDate) ?? {
			inputTokens: 0,
			outputTokens: 0,
		};
		const totalTokens = tokensRow.inputTokens + tokensRow.outputTokens;

		return {
			avgTokensPerSession:
				sessions > 0 ? Math.round(totalTokens / sessions) : null,
			axisLabel: format(date, "EEE"),
			date: isoDate,
			fullLabel: format(date, "EEEE, MMM d"),
			inputTokens: tokensRow.inputTokens,
			outputTokens: tokensRow.outputTokens,
			sessions,
			totalTokens,
		};
	});
}

export function buildDashboardTokenTabMetrics(
	usersTokenUsage: UserTokenUsageData[] | undefined,
	dailyPattern: DashboardTokenDailyPoint[],
): DashboardHeadlineMetric[] {
	const totalTokens = (usersTokenUsage ?? []).reduce(
		(sum, row) => sum + row.total_tokens,
		0,
	);
	const totalInputTokens = (usersTokenUsage ?? []).reduce(
		(sum, row) => sum + row.input_tokens,
		0,
	);
	const totalOutputTokens = (usersTokenUsage ?? []).reduce(
		(sum, row) => sum + row.output_tokens,
		0,
	);
	const activeDevelopers = (usersTokenUsage ?? []).filter(
		(row) => row.total_tokens > 0 || row.total_sessions > 0,
	).length;
	const totalCost = calculateCost(totalInputTokens, totalOutputTokens);
	const activeDays = dailyPattern.filter(
		(point) => point.totalTokens > 0,
	).length;
	const averageTokensPerActiveDay =
		activeDays > 0 ? Math.round(totalTokens / activeDays) : 0;

	return [
		{
			id: "sessions",
			label: "Tokens used",
			valueLabel: formatCompactNumber(totalTokens),
			deltaLabel: "0",
			deltaTone: "neutral",
			description: "Total input and output tokens in the selected range.",
		},
		{
			id: "uncommitted",
			label: "Est. spend",
			valueLabel: formatCompactWholeCurrency(totalCost),
			deltaLabel: "0",
			deltaTone: "neutral",
			description:
				"Estimated token cost using the current default input and output pricing.",
		},
		{
			id: "commitRate",
			label: "Active developers",
			valueLabel: activeDevelopers.toString(),
			deltaLabel:
				activeDays > 0 ? formatCompactNumber(averageTokensPerActiveDay) : "0",
			deltaTone: "neutral",
			description:
				"Developers with token activity in the selected range. Delta shows average daily token load.",
		},
	];
}
