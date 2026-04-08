import type { UserDailyTrendData } from "@rudel/api-routes";
import {
	DashboardCellStack,
	DashboardGridTable,
	DashboardInlineOverflowList,
} from "@/features/dashboard/components/DashboardGridTable";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import type { DashboardHighlightSource } from "@/features/dashboard/components/dashboard-highlight-state";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";
import { formatCompactNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type DashboardPerformanceRosterRow = {
	activeRepositoryCount: number;
	commitRate: number;
	commits: number;
	id: string;
	imageUrl?: string | null;
	modelsUsed: string[];
	repositoriesTouched: string[];
	sessions: number;
	userLabel: string;
};

type DashboardPerformanceRosterVariant = "commits" | "repositories";

const MAX_VISIBLE_REPOSITORIES = 2;

function getAvatarInitials(fullLabel: string) {
	const fallbackToken = fullLabel.includes("@")
		? (fullLabel.split("@")[0] ?? fullLabel)
		: fullLabel;
	const parts = fallbackToken.split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		return "AI";
	}

	if (parts.length === 1) {
		return parts[0]?.slice(0, 2).toUpperCase() ?? "AI";
	}

	return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function getRateTone(commitRate: number) {
	if (commitRate >= 65) {
		return {
			dotClassName: "bg-[color:var(--dashboardy-success-foreground)]",
			textClassName: "text-[color:var(--dashboardy-success-foreground)]",
		};
	}

	if (commitRate >= 45) {
		return {
			dotClassName: "bg-[color:var(--dashboardy-warning-foreground)]",
			textClassName: "text-[color:var(--dashboardy-warning-foreground)]",
		};
	}

	return {
		dotClassName: "bg-[color:var(--dashboardy-danger-foreground)]",
		textClassName: "text-[color:var(--dashboardy-danger-foreground)]",
	};
}

function buildRosterRows(
	performanceUsers: DashboardPerformanceUserComparison[],
	highlightedDate: string | null,
	trendData: UserDailyTrendData[] | undefined,
	variant: DashboardPerformanceRosterVariant,
): DashboardPerformanceRosterRow[] {
	const rowMap = new Map(
		(trendData ?? []).map(
			(row) => [`${row.user_id}:${row.date}`, row] as const,
		),
	);

	return performanceUsers
		.map((user) => {
			const highlightedRow =
				highlightedDate != null
					? rowMap.get(`${user.userId}:${highlightedDate}`)
					: undefined;
			const repositoriesTouched =
				highlightedDate != null
					? [...(highlightedRow?.repositories_touched ?? [])]
					: user.repositoriesTouched;
			const sessions =
				highlightedDate != null
					? (highlightedRow?.sessions ?? 0)
					: user.sessions;
			const commits =
				highlightedDate != null
					? (highlightedRow?.total_commits ?? 0)
					: user.commits;
			const commitRate =
				sessions > 0 ? Math.round((commits / sessions) * 100) : 0;

			return {
				activeRepositoryCount: repositoriesTouched.length,
				commitRate,
				commits,
				id: user.userId,
				imageUrl: user.imageUrl,
				modelsUsed: user.modelsUsed,
				repositoriesTouched,
				sessions,
				userLabel: user.label,
			};
		})
		.sort((left, right) => {
			if (variant === "repositories") {
				return (
					right.activeRepositoryCount - left.activeRepositoryCount ||
					right.sessions - left.sessions ||
					left.userLabel.localeCompare(right.userLabel)
				);
			}

			return (
				right.commits - left.commits ||
				right.sessions - left.sessions ||
				left.userLabel.localeCompare(right.userLabel)
			);
		});
}

export function DashboardPerformanceRosterTable({
	highlightSource,
	highlightedDate,
	highlightedUserId,
	onHighlightUserChange,
	performanceUsers,
	trendData,
	variant = "commits",
}: {
	highlightSource?: DashboardHighlightSource;
	highlightedDate: string | null;
	highlightedUserId?: string | null;
	onHighlightUserChange?: (userId: string | null) => void;
	performanceUsers: DashboardPerformanceUserComparison[];
	trendData: UserDailyTrendData[] | undefined;
	variant?: DashboardPerformanceRosterVariant;
}) {
	const rows = buildRosterRows(
		performanceUsers,
		highlightedDate,
		trendData,
		variant,
	);
	const hasTableHighlight =
		highlightSource === "table" && highlightedUserId != null;
	const hasChartHighlight =
		highlightSource === "chart" && highlightedUserId != null;
	const columns =
		variant === "repositories"
			? [
					{
						id: "user",
						header: "User",
						renderCell: (row: DashboardPerformanceRosterRow) => (
							<div className="flex min-w-0 items-center gap-3">
								<div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-[color:var(--dashboardy-surface)] shadow-sm">
									{row.imageUrl ? (
										<img
											src={row.imageUrl}
											alt={row.userLabel}
											className="size-full object-cover"
										/>
									) : (
										<span className="text-[10px] font-semibold text-[color:var(--dashboardy-heading)]">
											{getAvatarInitials(row.userLabel)}
										</span>
									)}
								</div>
								<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
									{row.userLabel}
								</p>
							</div>
						),
					},
					{
						id: "repositories",
						header: "Repositories",
						renderCell: (row: DashboardPerformanceRosterRow) =>
							row.repositoriesTouched.length > 0 ? (
								<p className="truncate text-[13px] font-medium text-[color:var(--dashboardy-heading)]">
									<DashboardInlineOverflowList
										visibleItems={row.repositoriesTouched.slice(
											0,
											MAX_VISIBLE_REPOSITORIES,
										)}
										hiddenItems={row.repositoriesTouched.slice(
											MAX_VISIBLE_REPOSITORIES,
										)}
										overflowLabel={`${Math.max(row.repositoriesTouched.length - MAX_VISIBLE_REPOSITORIES, 0)} more`}
									/>
								</p>
							) : (
								<span className="text-[12px] text-[color:var(--dashboardy-muted)]">
									—
								</span>
							),
					},
					{
						id: "models",
						header: "Models used",
						renderCell: (row: DashboardPerformanceRosterRow) => (
							<div className="flex min-w-0 flex-wrap items-center gap-1.5">
								<DashboardModelBadges models={row.modelsUsed} />
							</div>
						),
					},
					{
						id: "sessions",
						header: "Sessions",
						renderCell: (row: DashboardPerformanceRosterRow) => (
							<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
								{row.sessions}
							</p>
						),
					},
					{
						id: "active-repos",
						header: "Active repos",
						renderCell: (row: DashboardPerformanceRosterRow) => (
							<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
								{row.activeRepositoryCount}
							</p>
						),
					},
					{
						id: "avg-per-repo",
						header: "Avg / repo",
						renderCell: (row: DashboardPerformanceRosterRow) => (
							<DashboardCellStack
								primary={
									row.activeRepositoryCount > 0
										? formatCompactNumber(
												Math.round(row.sessions / row.activeRepositoryCount),
											)
										: "—"
								}
								secondary={
									row.repositoriesTouched[0]
										? `Top: ${row.repositoriesTouched[0]}`
										: "—"
								}
								primaryClassName="font-medium tabular-nums"
								secondaryClassName="truncate"
							/>
						),
					},
				]
			: [
					{
						id: "user",
						header: "User",
						renderCell: (row: DashboardPerformanceRosterRow) => (
							<div className="flex min-w-0 items-center gap-3">
								<div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-[color:var(--dashboardy-surface)] shadow-sm">
									{row.imageUrl ? (
										<img
											src={row.imageUrl}
											alt={row.userLabel}
											className="size-full object-cover"
										/>
									) : (
										<span className="text-[10px] font-semibold text-[color:var(--dashboardy-heading)]">
											{getAvatarInitials(row.userLabel)}
										</span>
									)}
								</div>
								<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
									{row.userLabel}
								</p>
							</div>
						),
					},
					{
						id: "repositories",
						header: "Repositories",
						renderCell: (row: DashboardPerformanceRosterRow) =>
							row.repositoriesTouched.length > 0 ? (
								<p className="truncate text-[13px] font-medium text-[color:var(--dashboardy-heading)]">
									<DashboardInlineOverflowList
										visibleItems={row.repositoriesTouched.slice(
											0,
											MAX_VISIBLE_REPOSITORIES,
										)}
										hiddenItems={row.repositoriesTouched.slice(
											MAX_VISIBLE_REPOSITORIES,
										)}
										overflowLabel={`${Math.max(row.repositoriesTouched.length - MAX_VISIBLE_REPOSITORIES, 0)} more`}
									/>
								</p>
							) : (
								<span className="text-[12px] text-[color:var(--dashboardy-muted)]">
									—
								</span>
							),
					},
					{
						id: "models",
						header: "Models used",
						renderCell: (row: DashboardPerformanceRosterRow) => (
							<div className="flex min-w-0 flex-wrap items-center gap-1.5">
								<DashboardModelBadges models={row.modelsUsed} />
							</div>
						),
					},
					{
						id: "sessions",
						header: "Sessions",
						renderCell: (row: DashboardPerformanceRosterRow) => (
							<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
								{row.sessions}
							</p>
						),
					},
					{
						id: "commits",
						header: "Commits",
						renderCell: (row: DashboardPerformanceRosterRow) => (
							<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
								{row.commits}
							</p>
						),
					},
					{
						id: "rate",
						header: "Rate",
						renderCell: (row: DashboardPerformanceRosterRow) => {
							const rateTone = getRateTone(row.commitRate);

							return (
								<div className="flex items-center justify-start gap-2">
									<span
										className={`size-2 rounded-full ${rateTone.dotClassName}`}
									/>
									<p
										className={`font-semibold tabular-nums ${rateTone.textClassName}`}
									>
										{row.commitRate}%
									</p>
								</div>
							);
						},
					},
				];

	return (
		<DashboardGridTable
			columns={columns}
			rows={rows}
			rowKey={(row) => row.id}
			gridTemplateColumns={
				variant === "repositories"
					? "minmax(180px,12fr) minmax(190px,9fr) minmax(180px,8fr) 90px 90px minmax(140px,7fr)"
					: "minmax(180px,12fr) minmax(168px,8fr) minmax(180px,8fr) 80px 80px 112px"
			}
			minWidthClassName={
				variant === "repositories" ? "min-w-[66rem]" : "min-w-[60rem]"
			}
			onRowHoverChange={onHighlightUserChange}
			getHoverRowId={(row) => row.id}
			rowClassName={(row) =>
				cn(
					"w-full text-left transition-[opacity,background-color] duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
					hasTableHighlight &&
						"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
					hasChartHighlight &&
						highlightedUserId === row.id &&
						"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
					hasTableHighlight &&
						highlightedUserId === row.id &&
						"bg-[color:var(--dashboardy-subsurface-strong)] odd:bg-[color:var(--dashboardy-subsurface-strong)]",
					hasTableHighlight && highlightedUserId !== row.id && "opacity-50",
					hasChartHighlight && highlightedUserId !== row.id && "opacity-50",
				)
			}
		/>
	);
}
