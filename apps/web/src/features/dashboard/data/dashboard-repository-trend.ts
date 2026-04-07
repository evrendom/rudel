import type { RepositoryDailyTrendData } from "@rudel/api-routes";
import type { DashboardRankedOutputRow } from "@/features/dashboard/data/dashboard-static-data";

export const DASHBOARD_REPOSITORY_TREND_COLORS: string[] = [
	"#3b82f6",
	"#10b981",
	"#f59e0b",
	"#8b5cf6",
	"#ef4444",
	"#14b8a6",
	"#f97316",
	"#6366f1",
	"#84cc16",
	"#ec4899",
	"#06b6d4",
	"#a855f7",
] as const;

export type DashboardRepositoryTrendMetric = "sessions" | "commits";

export type DashboardRepositorySummaryRow = {
	activeDays: number | null;
	commitRate: number;
	commits: number;
	id: string;
	label: string;
	sessions: number;
};

export type DashboardRepositoryTrendSeries = {
	color: string;
	label: string;
	repositoryId: string;
};

function getCommitRate(commits: number, sessions: number) {
	if (sessions <= 0) {
		return 0;
	}

	return Math.round((commits / sessions) * 100);
}

export function getDashboardRepositoryTrendValue(
	row: RepositoryDailyTrendData | undefined,
	metric: DashboardRepositoryTrendMetric,
) {
	if (!row) {
		return 0;
	}

	return metric === "sessions" ? row.sessions : row.total_commits;
}

export function buildDashboardRepositorySummaryRows(
	fallbackRows: DashboardRankedOutputRow[],
	trendData: RepositoryDailyTrendData[] | undefined,
): DashboardRepositorySummaryRow[] {
	const rows = trendData ?? [];

	if (rows.length === 0) {
		return fallbackRows.map((row) => ({
			activeDays: null,
			commitRate: row.commitRate,
			commits: row.commits,
			id: row.label,
			label: row.label,
			sessions: row.sessions,
		}));
	}

	const repositoryMap = new Map<
		string,
		{
			activeDays: Set<string>;
			commits: number;
			label: string;
			sessions: number;
		}
	>();

	for (const row of rows) {
		const existingRow = repositoryMap.get(row.repository);

		if (existingRow) {
			existingRow.sessions += row.sessions;
			existingRow.commits += row.total_commits;
			existingRow.activeDays.add(row.date);
			continue;
		}

		repositoryMap.set(row.repository, {
			activeDays: new Set([row.date]),
			commits: row.total_commits,
			label: row.repository,
			sessions: row.sessions,
		});
	}

	return Array.from(repositoryMap.entries())
		.map(([repositoryId, row]) => ({
			activeDays: row.activeDays.size,
			commitRate: getCommitRate(row.commits, row.sessions),
			commits: row.commits,
			id: repositoryId,
			label: row.label,
			sessions: row.sessions,
		}))
		.sort(
			(left, right) =>
				right.commits - left.commits ||
				right.sessions - left.sessions ||
				left.label.localeCompare(right.label),
		);
}

export function buildDashboardRepositoryTrendSeries(
	summaryRows: DashboardRepositorySummaryRow[],
	trendData: RepositoryDailyTrendData[] | undefined,
	metric: DashboardRepositoryTrendMetric,
): DashboardRepositoryTrendSeries[] {
	const rows = trendData ?? [];

	return summaryRows
		.filter((summaryRow) =>
			rows.some(
				(row) =>
					row.repository === summaryRow.id &&
					getDashboardRepositoryTrendValue(row, metric) > 0,
			),
		)
		.map((summaryRow, index) => ({
			color:
				DASHBOARD_REPOSITORY_TREND_COLORS[
					index % DASHBOARD_REPOSITORY_TREND_COLORS.length
				],
			label: summaryRow.label,
			repositoryId: summaryRow.id,
		}));
}
