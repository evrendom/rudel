import type { UserDailyTrendData } from "@rudel/api-routes";
import {
	DashboardGridTable,
	DashboardInlineOverflowList,
} from "@/features/dashboard/components/DashboardGridTable";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";

type DashboardPerformanceRosterRow = {
	commitRate: number;
	commits: number;
	id: string;
	imageUrl?: string | null;
	modelsUsed: string[];
	repositoriesTouched: string[];
	sessions: number;
	userLabel: string;
};

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
): DashboardPerformanceRosterRow[] {
	const rowMap = new Map(
		(trendData ?? []).map(
			(row) => [`${row.user_id}:${row.date}`, row] as const,
		),
	);

	return performanceUsers.map((user) => {
		const highlightedRow =
			highlightedDate != null
				? rowMap.get(`${user.userId}:${highlightedDate}`)
				: undefined;
		const sessions =
			highlightedDate != null ? (highlightedRow?.sessions ?? 0) : user.sessions;
		const commits =
			highlightedDate != null
				? (highlightedRow?.total_commits ?? 0)
				: user.commits;
		const commitRate =
			sessions > 0 ? Math.round((commits / sessions) * 100) : 0;

		return {
			commitRate,
			commits,
			id: user.userId,
			imageUrl: user.imageUrl,
			modelsUsed: user.modelsUsed,
			repositoriesTouched: user.repositoriesTouched,
			sessions,
			userLabel: user.label,
		};
	});
}

export function DashboardPerformanceRosterTable({
	highlightedDate,
	onHighlightUserChange,
	performanceUsers,
	trendData,
}: {
	highlightedDate: string | null;
	onHighlightUserChange?: (userId: string | null) => void;
	performanceUsers: DashboardPerformanceUserComparison[];
	trendData: UserDailyTrendData[] | undefined;
}) {
	const rows = buildRosterRows(performanceUsers, highlightedDate, trendData);

	return (
		<DashboardGridTable
			columns={[
				{
					id: "user",
					header: "User",
					renderCell: (row) => (
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
					header: "Repository",
					renderCell: (row) =>
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
					renderCell: (row) => (
						<div className="flex min-w-0 flex-wrap items-center gap-1.5">
							<DashboardModelBadges models={row.modelsUsed} />
						</div>
					),
				},
				{
					id: "sessions",
					header: "Sessions",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{row.sessions}
						</p>
					),
				},
				{
					id: "commits",
					header: "Commits",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{row.commits}
						</p>
					),
				},
				{
					id: "rate",
					header: "Rate",
					renderCell: (row) => {
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
			]}
			rows={rows}
			rowKey={(row) => row.id}
			gridTemplateColumns="minmax(180px,12fr) minmax(168px,8fr) minmax(180px,8fr) 80px 80px 112px"
			minWidthClassName="min-w-[60rem]"
			onRowHoverChange={onHighlightUserChange}
			getHoverRowId={(row) => row.id}
		/>
	);
}
