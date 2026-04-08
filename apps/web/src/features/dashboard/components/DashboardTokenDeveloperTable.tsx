import type { UserDailyTrendData } from "@rudel/api-routes";
import { DashboardGridTable } from "@/features/dashboard/components/DashboardGridTable";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";

type DashboardTokenDeveloperTableRow = {
	avgTokensPerSession: number;
	id: string;
	modelsUsed: string[];
	sessions: number;
	totalTokens: number;
	userLabel: string;
};

function formatCompactNumber(value: number) {
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}

	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(1)}K`;
	}

	return value.toLocaleString();
}

function buildRows(
	performanceUsers: DashboardPerformanceUserComparison[],
	highlightedDate: string | null,
	trendData: UserDailyTrendData[] | undefined,
): DashboardTokenDeveloperTableRow[] {
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
		const totalTokens =
			highlightedDate != null
				? (highlightedRow?.total_tokens ?? 0)
				: user.totalTokens;

		return {
			avgTokensPerSession:
				sessions > 0 ? Math.round(totalTokens / sessions) : 0,
			id: user.userId,
			modelsUsed: user.modelsUsed,
			sessions,
			totalTokens,
			userLabel: user.label,
		};
	});
}

export function DashboardTokenDeveloperTable({
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
	const rows = buildRows(performanceUsers, highlightedDate, trendData);

	return (
		<DashboardGridTable
			columns={[
				{
					id: "user",
					header: "User",
					renderCell: (row) => (
						<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
							{row.userLabel}
						</p>
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
					id: "tokens",
					header: "Tokens",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{formatCompactNumber(row.totalTokens)}
						</p>
					),
				},
				{
					id: "avg",
					header: "Avg / session",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{row.sessions > 0
								? formatCompactNumber(row.avgTokensPerSession)
								: "—"}
						</p>
					),
				},
			]}
			rows={rows}
			rowKey={(row) => row.id}
			gridTemplateColumns="minmax(180px,11fr) minmax(180px,9fr) 90px 120px 120px"
			minWidthClassName="min-w-[54rem]"
			onRowHoverChange={onHighlightUserChange}
			getHoverRowId={(row) => row.id}
		/>
	);
}
