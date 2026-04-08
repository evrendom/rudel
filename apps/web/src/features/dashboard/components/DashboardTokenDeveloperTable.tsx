import type { UserDailyTrendData } from "@rudel/api-routes";
import {
	DashboardCellStack,
	DashboardGridTable,
} from "@/features/dashboard/components/DashboardGridTable";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import { DashboardTokenCostCell } from "@/features/dashboard/components/DashboardTokenCostCell";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";

type DashboardTokenDeveloperTableRow = {
	avgTokensPerSession: number;
	cost: number;
	id: string;
	imageUrl?: string | null;
	inputTokens: number;
	modelsUsed: string[];
	outputTokens: number;
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

function formatTokenMix(inputTokens: number, outputTokens: number) {
	const totalTokens = inputTokens + outputTokens;

	if (totalTokens <= 0) {
		return "—";
	}

	const inputPercent = Math.round((inputTokens / totalTokens) * 100);

	return `${inputPercent} IN / ${100 - inputPercent} OUT`;
}

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

	return performanceUsers
		.map((user) => {
			const highlightedRow =
				highlightedDate != null
					? rowMap.get(`${user.userId}:${highlightedDate}`)
					: undefined;
			const sessions =
				highlightedDate != null
					? (highlightedRow?.sessions ?? 0)
					: user.sessions;
			const totalTokens =
				highlightedDate != null
					? (highlightedRow?.total_tokens ?? 0)
					: user.totalTokens;

			return {
				avgTokensPerSession:
					sessions > 0 ? Math.round(totalTokens / sessions) : 0,
				cost: user.cost,
				id: user.userId,
				imageUrl: user.imageUrl,
				inputTokens: user.inputTokens,
				modelsUsed: user.modelsUsed,
				outputTokens: user.outputTokens,
				sessions,
				totalTokens,
				userLabel: user.label,
			};
		})
		.sort(
			(left, right) =>
				right.totalTokens - left.totalTokens ||
				right.sessions - left.sessions ||
				left.userLabel.localeCompare(right.userLabel),
		);
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
						<DashboardCellStack
							primary={row.sessions}
							secondary={
								row.sessions > 0
									? `${formatCompactNumber(row.avgTokensPerSession)} / session`
									: "—"
							}
							primaryClassName="font-medium tabular-nums"
							secondaryClassName="font-medium tabular-nums"
						/>
					),
				},
				{
					id: "tokens",
					header: "Tokens",
					renderCell: (row) => (
						<DashboardCellStack
							primary={formatCompactNumber(row.totalTokens)}
							secondary={formatTokenMix(row.inputTokens, row.outputTokens)}
							primaryClassName="font-medium tabular-nums"
							secondaryClassName="font-medium tabular-nums uppercase tracking-[0.02em]"
						/>
					),
				},
				{
					id: "cost",
					header: "Cost",
					renderCell: (row) => (
						<DashboardTokenCostCell
							cost={row.cost}
							inputTokens={row.inputTokens}
							outputTokens={row.outputTokens}
						/>
					),
				},
			]}
			rows={rows}
			rowKey={(row) => row.id}
			gridTemplateColumns="minmax(180px,12fr) minmax(180px,8fr) 120px 140px minmax(180px,0.95fr)"
			minWidthClassName="min-w-[58rem]"
			onRowHoverChange={onHighlightUserChange}
			getHoverRowId={(row) => row.id}
		/>
	);
}
