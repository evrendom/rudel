import type { RepositoryDailyTrendData } from "@rudel/api-routes";
import { eachDayOfInterval, format, parseISO } from "date-fns";
import type { DashboardRepositorySummaryRow } from "@/features/dashboard/data/dashboard-repository-trend";
import type {
	DashboardDailyPatternPoint,
	DashboardHeadlineMetric,
} from "@/features/dashboard/data/dashboard-static-data";

export type DashboardRepositoryDailyOverviewRow = {
	activeRepositories: number;
	date: string;
	leadRepositoryLabel: string | null;
	leadRepositorySessions: number;
	leadRepositoryShare: number | null;
	sessions: number;
};

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

export function buildDashboardRepositoryTabMetrics(
	rows: DashboardRepositorySummaryRow[],
): DashboardHeadlineMetric[] {
	const totalSessions = rows.reduce((sum, row) => sum + row.sessions, 0);
	const totalCommits = rows.reduce((sum, row) => sum + row.commits, 0);
	const repositoryCount = rows.length;
	const averageSessionsPerRepository =
		repositoryCount > 0 ? totalSessions / repositoryCount : 0;
	const commitRate =
		totalSessions > 0 ? Math.round((totalCommits / totalSessions) * 100) : 0;

	return [
		{
			description: "Unique repositories active in the selected range.",
			deltaLabel: "0",
			deltaTone: "neutral",
			id: "sessions",
			label: "Repos touched",
			valueLabel: repositoryCount.toString(),
		},
		{
			description: "Average session volume across active repositories.",
			deltaLabel: "0",
			deltaTone: "neutral",
			id: "uncommitted",
			label: "Avg sessions / repo",
			valueLabel:
				repositoryCount > 0 ? averageSessionsPerRepository.toFixed(1) : "0.0",
		},
		{
			description: "Committed sessions divided by all repository sessions.",
			deltaLabel: "0",
			deltaTone: "neutral",
			id: "commitRate",
			label: "Repo commit rate",
			valueLabel: `${commitRate}%`,
		},
	];
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
			axisLabel: format(date, "EEE"),
			commitRate:
				sessions != null && commits != null && sessions > 0
					? Math.round((commits / sessions) * 100)
					: null,
			commits,
			date: isoDate,
			fullLabel: format(date, "EEEE, MMM d"),
			sessions,
		};
	});
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
		end:
			parsedStartDate.getTime() <= parsedEndDate.getTime()
				? parsedEndDate
				: parsedStartDate,
		start:
			parsedStartDate.getTime() <= parsedEndDate.getTime()
				? parsedStartDate
				: parsedEndDate,
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
