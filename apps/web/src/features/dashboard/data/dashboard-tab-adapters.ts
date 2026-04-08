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
	activeModels: number;
	avgTokensPerSession: number | null;
	axisLabel: string;
	date: string;
	dominantModel: string | null;
	dominantModelTokens: number;
	fullLabel: string;
	inputTokens: number;
	modelTokens: Record<string, number>;
	outputTokens: number;
	sessions: number;
	totalTokens: number;
};

export type DashboardRepositoryDailyOverviewRow = {
	activeRepositories: number;
	date: string;
	leadRepositoryLabel: string | null;
	leadRepositorySessions: number;
	leadRepositoryShare: number | null;
	sessions: number;
};

export type DashboardSessionHourlyOverviewRow = {
	bandLabel: string;
	bandTone: "danger" | "muted" | "success" | "warning";
	hour: number;
	label: string;
	sharePct: number | null;
	sessions: number;
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

function normalizeDateKey(value: string) {
	if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
		return value;
	}

	const parsedDate = parseISO(value);

	if (Number.isNaN(parsedDate.getTime())) {
		return value;
	}

	return format(parsedDate, "yyyy-MM-dd");
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
		const dateKey = normalizeDateKey(row.date);
		const currentRow = rowsByDate.get(dateKey) ?? {
			commits: 0,
			sessions: 0,
		};
		currentRow.commits += row.total_commits;
		currentRow.sessions += row.sessions;
		rowsByDate.set(dateKey, currentRow);
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
		const dateKey = normalizeDateKey(row.date);
		const currentRow = rowsByDate.get(dateKey) ?? {
			commits: 0,
			sessions: 0,
		};
		currentRow.commits += row.total_commits;
		currentRow.sessions += row.sessions;
		rowsByDate.set(dateKey, currentRow);
	}

	return buildDailyPattern(startDate, endDate, rowsByDate);
}

export function buildDashboardRepositoryDailyOverviewRows(
	startDate: string,
	endDate: string,
	rows: RepositoryDailyTrendData[] | undefined,
): DashboardRepositoryDailyOverviewRow[] {
	const rowsByDate = new Map<
		string,
		{
			activeRepositories: number;
			leadRepositoryLabel: string | null;
			leadRepositorySessions: number;
			sessions: number;
		}
	>();

	for (const row of rows ?? []) {
		const dateKey = normalizeDateKey(row.date);
		const currentRow = rowsByDate.get(dateKey) ?? {
			activeRepositories: 0,
			leadRepositoryLabel: null,
			leadRepositorySessions: 0,
			sessions: 0,
		};

		currentRow.sessions += row.sessions;

		if (row.sessions > 0) {
			currentRow.activeRepositories += 1;
		}

		if (
			row.sessions > currentRow.leadRepositorySessions ||
			(row.sessions === currentRow.leadRepositorySessions &&
				row.sessions > 0 &&
				row.repository.localeCompare(currentRow.leadRepositoryLabel ?? "") < 0)
		) {
			currentRow.leadRepositoryLabel = row.repository;
			currentRow.leadRepositorySessions = row.sessions;
		}

		rowsByDate.set(dateKey, currentRow);
	}

	return buildDateRange(startDate, endDate).map((date) => {
		const isoDate = format(date, "yyyy-MM-dd");
		const row = rowsByDate.get(isoDate);
		const sessions = row?.sessions ?? 0;
		const leadRepositorySessions = row?.leadRepositorySessions ?? 0;

		return {
			activeRepositories: row?.activeRepositories ?? 0,
			date: isoDate,
			leadRepositoryLabel: row?.leadRepositoryLabel ?? null,
			leadRepositorySessions,
			leadRepositoryShare:
				sessions > 0
					? Math.round((leadRepositorySessions / sessions) * 100)
					: null,
			sessions,
		};
	});
}

function getHourlyActivityBand(
	sessions: number,
	maxSessions: number,
): Pick<DashboardSessionHourlyOverviewRow, "bandLabel" | "bandTone"> {
	if (sessions <= 0 || maxSessions <= 0) {
		return {
			bandLabel: "No activity",
			bandTone: "muted",
		};
	}

	const relativeLoad = sessions / maxSessions;

	if (relativeLoad >= 0.9) {
		return {
			bandLabel: "Peak hour",
			bandTone: "success",
		};
	}

	if (relativeLoad >= 0.6) {
		return {
			bandLabel: "High activity",
			bandTone: "warning",
		};
	}

	if (relativeLoad >= 0.3) {
		return {
			bandLabel: "Steady",
			bandTone: "warning",
		};
	}

	return {
		bandLabel: "Light activity",
		bandTone: "danger",
	};
}

export function buildDashboardSessionHourlyOverviewRows(
	rows: { hour: number; label: string; sessions: number }[] | undefined,
): DashboardSessionHourlyOverviewRow[] {
	const resolvedRows = rows ?? [];
	const totalSessions = resolvedRows.reduce(
		(sum, row) => sum + row.sessions,
		0,
	);
	const maxSessions = Math.max(0, ...resolvedRows.map((row) => row.sessions));

	return [...resolvedRows]
		.map((row) => ({
			...getHourlyActivityBand(row.sessions, maxSessions),
			hour: row.hour,
			label: row.label,
			sharePct:
				totalSessions > 0
					? Math.round((row.sessions / totalSessions) * 100)
					: null,
			sessions: row.sessions,
		}))
		.sort(
			(leftRow, rightRow) =>
				rightRow.sessions - leftRow.sessions || leftRow.hour - rightRow.hour,
		);
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
	const modelTokensByDate = new Map<string, Record<string, number>>();
	let hasUserTokenBreakdown = false;
	let hasModelTokenBreakdown = false;

	for (const row of userRows ?? []) {
		const dateKey = normalizeDateKey(row.date);
		sessionsByDate.set(
			dateKey,
			(sessionsByDate.get(dateKey) ?? 0) + row.sessions,
		);

		const currentRow = tokensByDate.get(dateKey) ?? {
			inputTokens: 0,
			outputTokens: 0,
		};
		currentRow.inputTokens += row.input_tokens;
		currentRow.outputTokens += row.output_tokens;
		tokensByDate.set(dateKey, currentRow);

		if (row.input_tokens > 0 || row.output_tokens > 0) {
			hasUserTokenBreakdown = true;
		}
	}

	if (!hasUserTokenBreakdown) {
		for (const row of modelRows ?? []) {
			const dateKey = normalizeDateKey(row.date);
			const currentRow = tokensByDate.get(dateKey) ?? {
				inputTokens: 0,
				outputTokens: 0,
			};
			currentRow.inputTokens += row.input_tokens;
			currentRow.outputTokens += row.output_tokens;
			tokensByDate.set(dateKey, currentRow);
		}
	}

	for (const row of modelRows ?? []) {
		const dateKey = normalizeDateKey(row.date);
		const currentBreakdown = modelTokensByDate.get(dateKey) ?? {};
		currentBreakdown[row.model] =
			(currentBreakdown[row.model] ?? 0) + row.total_tokens;
		modelTokensByDate.set(dateKey, currentBreakdown);

		if (row.total_tokens > 0) {
			hasModelTokenBreakdown = true;
		}
	}

	return buildDateRange(startDate, endDate).map((date) => {
		const isoDate = format(date, "yyyy-MM-dd");
		const sessions = sessionsByDate.get(isoDate) ?? 0;
		const tokensRow = tokensByDate.get(isoDate) ?? {
			inputTokens: 0,
			outputTokens: 0,
		};
		const modelTokens = modelTokensByDate.get(isoDate) ?? {};
		const totalTokens = tokensRow.inputTokens + tokensRow.outputTokens;
		const sortedModels = Object.entries(modelTokens)
			.filter(([, value]) => value > 0)
			.sort(
				(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
			);
		const [dominantModel, dominantModelTokens] = sortedModels[0] ?? [null, 0];

		return {
			activeModels: hasModelTokenBreakdown ? sortedModels.length : 0,
			avgTokensPerSession:
				sessions > 0 ? Math.round(totalTokens / sessions) : null,
			axisLabel: format(date, "EEE"),
			date: isoDate,
			dominantModel,
			dominantModelTokens,
			fullLabel: format(date, "EEEE, MMM d"),
			inputTokens: tokensRow.inputTokens,
			modelTokens,
			outputTokens: tokensRow.outputTokens,
			sessions,
			totalTokens,
		};
	});
}

export function buildDashboardTokenTabMetrics(
	usersTokenUsage: UserTokenUsageData[] | undefined,
	dailyPattern: DashboardTokenDailyPoint[],
	modelRows?: ModelTokensTrendData[] | undefined,
	userTrendRows?: UserDailyTrendData[] | undefined,
): DashboardHeadlineMetric[] {
	const totalTokensFromUsage = (usersTokenUsage ?? []).reduce(
		(sum, row) => sum + row.total_tokens,
		0,
	);
	const totalTokensFromPattern = dailyPattern.reduce(
		(sum, point) => sum + point.totalTokens,
		0,
	);
	const totalTokens =
		totalTokensFromUsage > 0 ? totalTokensFromUsage : totalTokensFromPattern;
	const totalCostFromUsage = (usersTokenUsage ?? []).reduce(
		(sum, row) => sum + row.cost,
		0,
	);
	const totalCostFromModels = (modelRows ?? []).reduce(
		(sum, row) =>
			sum + calculateCost(row.input_tokens, row.output_tokens, row.model),
		0,
	);
	const totalCost =
		totalCostFromUsage > 0 ? totalCostFromUsage : totalCostFromModels;
	const activeDevelopersFromUsage = (usersTokenUsage ?? []).filter(
		(row) => row.total_tokens > 0 || row.total_sessions > 0,
	).length;
	const activeDevelopersFromTrend = new Set(
		(userTrendRows ?? [])
			.filter((row) => row.total_tokens > 0 || row.sessions > 0)
			.map((row) => row.user_id),
	).size;
	const activeDevelopers =
		activeDevelopersFromUsage > 0
			? activeDevelopersFromUsage
			: activeDevelopersFromTrend;
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
				"Estimated token cost using the current model pricing catalog.",
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
