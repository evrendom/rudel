import type {
	RepositoryDailyTrendData,
	UserDailyTrendData,
} from "@rudel/api-routes";
import { useMemo } from "react";
import { DashboardDailySnapshotSection } from "@/features/dashboard/components/DashboardDailySnapshotSection";
import { DashboardDeveloperPanel } from "@/features/dashboard/components/DashboardDeveloperPanel";
import { DashboardRepositoryPanel } from "@/features/dashboard/components/DashboardRepositoryPanel";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";
import {
	buildDashboardRepositorySummaryRows,
	type DashboardRepositorySummaryRow,
} from "@/features/dashboard/data/dashboard-repository-trend";
import type { DashboardRankedOutputRow } from "@/features/dashboard/data/dashboard-static-data";
import {
	buildDashboardDailyPatternFromRepositoryTrend,
	buildDashboardRepositoryTabMetrics,
} from "@/features/dashboard/data/dashboard-tab-adapters";

type DashboardRepositoryStoryItem = {
	detail: string;
	label: string;
	value: string;
};

function buildRepositoryStoryItems(
	rows: DashboardRepositorySummaryRow[],
): DashboardRepositoryStoryItem[] {
	const leadingRepository = rows[0];
	const longestRunRepository =
		rows.reduce<DashboardRepositorySummaryRow | null>((currentBest, row) => {
			if (!currentBest) {
				return row;
			}

			return (row.activeDays ?? 0) > (currentBest.activeDays ?? 0)
				? row
				: currentBest;
		}, null);
	const strongestCommitRateRepository =
		rows.reduce<DashboardRepositorySummaryRow | null>((currentBest, row) => {
			if (row.sessions === 0) {
				return currentBest;
			}

			if (!currentBest) {
				return row;
			}

			if (row.commitRate !== currentBest.commitRate) {
				return row.commitRate > currentBest.commitRate ? row : currentBest;
			}

			if (row.commits !== currentBest.commits) {
				return row.commits > currentBest.commits ? row : currentBest;
			}

			return row.sessions > currentBest.sessions ? row : currentBest;
		}, null);

	return [
		{
			label: "Lead repo",
			value: leadingRepository?.label ?? "-",
			detail: leadingRepository
				? `${leadingRepository.commits} commits across ${leadingRepository.sessions} sessions`
				: "No repository activity yet",
		},
		{
			label: "Longest run",
			value:
				longestRunRepository?.activeDays != null
					? `${longestRunRepository.activeDays} days`
					: "-",
			detail: longestRunRepository?.label ?? "Waiting for daily trend data",
		},
		{
			label: "Best ship rate",
			value: strongestCommitRateRepository
				? `${strongestCommitRateRepository.commitRate}%`
				: "-",
			detail:
				strongestCommitRateRepository?.label ?? "No committed sessions yet",
		},
	];
}

function getRepositoryLoadNote(
	performanceUsers: DashboardPerformanceUserComparison[],
) {
	if (performanceUsers.length === 0) {
		return "No developer activity in the selected range.";
	}

	const widestOwner = performanceUsers.reduce((currentBest, user) => {
		const currentRepositoryCount = currentBest.repositoriesTouched.length;
		const nextRepositoryCount = user.repositoriesTouched.length;

		if (nextRepositoryCount !== currentRepositoryCount) {
			return nextRepositoryCount > currentRepositoryCount ? user : currentBest;
		}

		if (user.commits !== currentBest.commits) {
			return user.commits > currentBest.commits ? user : currentBest;
		}

		return user.sessions > currentBest.sessions ? user : currentBest;
	}, performanceUsers[0]);
	const repositoryCount = widestOwner.repositoriesTouched.length;

	if (repositoryCount === 0) {
		return `${widestOwner.label} is active, but no repository touches are attributed in the selected range yet.`;
	}

	return `${widestOwner.label} is carrying the widest spread across ${repositoryCount} repos, with ${widestOwner.commits} commits in flight.`;
}

function DashboardRepositoryStoryStrip({
	items,
}: {
	items: DashboardRepositoryStoryItem[];
}) {
	return (
		<div className="@container/repository-story-strip grid gap-3 sm:grid-cols-3">
			{items.map((item) => (
				<div
					key={item.label}
					className="rounded-[1.2rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)]/78 px-4 py-3"
				>
					<p className="dashboardy-label truncate">{item.label}</p>
					<p className="mt-2 text-xl font-semibold tracking-tight text-[color:var(--dashboardy-heading)]">
						{item.value}
					</p>
					<p className="mt-1 text-sm/6 text-[color:var(--dashboardy-muted)]">
						{item.detail}
					</p>
				</div>
			))}
		</div>
	);
}

export function DashboardRepositoriesView({
	endDate,
	isDeveloperChartPending,
	isMetricsPending = false,
	isRepositoryChartPending,
	performanceUserDailyTrend,
	performanceUsers,
	repositories,
	repositoryDailyTrend,
	startDate,
}: {
	endDate: string;
	isDeveloperChartPending: boolean;
	isMetricsPending?: boolean;
	isRepositoryChartPending: boolean;
	performanceUserDailyTrend: UserDailyTrendData[] | undefined;
	performanceUsers: DashboardPerformanceUserComparison[];
	repositories: DashboardRankedOutputRow[];
	repositoryDailyTrend: RepositoryDailyTrendData[] | undefined;
	startDate: string;
}) {
	const repositoryRows = useMemo(
		() =>
			buildDashboardRepositorySummaryRows(repositories, repositoryDailyTrend),
		[repositories, repositoryDailyTrend],
	);
	const headlineMetrics = useMemo(
		() => buildDashboardRepositoryTabMetrics(repositoryRows),
		[repositoryRows],
	);
	const repositoryStoryItems = useMemo(
		() => buildRepositoryStoryItems(repositoryRows),
		[repositoryRows],
	);
	const dailyPattern = useMemo(
		() =>
			buildDashboardDailyPatternFromRepositoryTrend(
				startDate,
				endDate,
				repositoryDailyTrend,
			),
		[endDate, repositoryDailyTrend, startDate],
	);
	const repositoryLoadNote = useMemo(
		() => getRepositoryLoadNote(performanceUsers),
		[performanceUsers],
	);

	return (
		<section className="@container/repositories-view flex flex-col gap-8">
			<DashboardDailySnapshotSection
				chartMode="repository-stack"
				dailyPattern={dailyPattern}
				isMetricsLoading={isMetricsPending}
				metrics={headlineMetrics}
				repositoryDailyTrend={repositoryDailyTrend}
			/>
			<div className="grid gap-5">
				<div className="grid gap-3 border-b border-[color:var(--dashboardy-divider)] pb-5">
					<div className="grid gap-2">
						<p className="dashboardy-label">Repository focus</p>
						<div className="grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)] lg:items-end">
							<div className="grid gap-2">
								<h2 className="dashboardy-section-title text-[1.7rem]/[1.05] tracking-tight sm:text-[2.15rem]/[1.02]">
									Repository footprint
								</h2>
								<p className="max-w-[62ch] text-sm/6 text-[color:var(--dashboardy-muted)] sm:text-[15px]/6">
									Follow which codebases are absorbing sessions, where commits
									are landing, and which repositories need a tighter path from
									activity to shipped work.
								</p>
							</div>
							<p className="max-w-[42ch] text-sm/6 text-[color:var(--dashboardy-muted)] lg:justify-self-end lg:text-right">
								The repository view mirrors the commit dashboard's structure,
								but re-centers the story around codebase spread and shipping
								health.
							</p>
						</div>
					</div>
					<DashboardRepositoryStoryStrip items={repositoryStoryItems} />
				</div>
				<DashboardRepositoryPanel
					isChartPending={isRepositoryChartPending}
					repositories={repositories}
					repositoryDailyTrend={repositoryDailyTrend}
				/>
			</div>
			<div className="grid gap-4 border-t border-[color:var(--dashboardy-divider)] pt-8">
				<div className="flex flex-col gap-2 px-1 lg:flex-row lg:items-end lg:justify-between">
					<div className="grid gap-1.5">
						<p className="dashboardy-label">Supporting view</p>
						<h2 className="dashboardy-section-title text-xl/7">
							Who is carrying the repository load
						</h2>
					</div>
					<p className="max-w-[48ch] text-sm/6 text-[color:var(--dashboardy-muted)] lg:text-right">
						{repositoryLoadNote}
					</p>
				</div>
				<DashboardDeveloperPanel
					isChartPending={isDeveloperChartPending}
					performanceUserDailyTrend={performanceUserDailyTrend}
					performanceUsers={performanceUsers}
				/>
			</div>
		</section>
	);
}
