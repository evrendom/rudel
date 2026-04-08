import type { RepositoryDailyTrendData } from "@rudel/api-routes";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/ui/popover";
import {
	DashboardCellStack,
	DashboardGridTable,
	DashboardTableFooterNote,
} from "@/features/dashboard/components/DashboardGridTable";
import type { DashboardHighlightSource } from "@/features/dashboard/components/dashboard-highlight-state";
import type { DashboardRepositorySummaryRow } from "@/features/dashboard/data/dashboard-repository-trend";
import { formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type DashboardRepositoryTableRow = DashboardRepositorySummaryRow;
const MAX_VISIBLE_REPOSITORIES = 7;
type DashboardRepositoryTableVariant = "commits" | "sessions";

function buildRepositoryRows(
	rows: DashboardRepositorySummaryRow[],
	highlightedDate: string | null,
	trendData: RepositoryDailyTrendData[] | undefined,
): DashboardRepositoryTableRow[] {
	const rowMap = new Map(
		(trendData ?? []).map(
			(row) => [`${row.repository}:${row.date}`, row] as const,
		),
	);

	return rows.map((row) => {
		const highlightedRow =
			highlightedDate != null
				? rowMap.get(`${row.id}:${highlightedDate}`)
				: undefined;
		const sessions =
			highlightedDate != null ? (highlightedRow?.sessions ?? 0) : row.sessions;
		const commits =
			highlightedDate != null
				? (highlightedRow?.total_commits ?? 0)
				: row.commits;

		return {
			...row,
			commitRate: sessions > 0 ? Math.round((commits / sessions) * 100) : 0,
			commits,
			sessions,
		};
	});
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

function DashboardRepositoryOverflowPopover({
	rows,
}: {
	rows: DashboardRepositorySummaryRow[];
}) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger
				className="rounded-sm transition-colors hover:text-[color:var(--dashboardy-heading)]"
				onMouseEnter={() => setIsOpen(true)}
				onMouseLeave={() => setIsOpen(false)}
			>
				({rows.length} more)
			</PopoverTrigger>
			<PopoverContent
				side="bottom"
				align="end"
				sideOffset={6}
				className="max-h-56 min-w-40 max-w-[18rem] gap-1 overflow-y-auto rounded-lg px-2.5 py-2 text-[11px] shadow-md"
				onMouseEnter={() => setIsOpen(true)}
				onMouseLeave={() => setIsOpen(false)}
			>
				<div className="grid gap-0.5 text-muted-foreground">
					{rows.map((row) => (
						<p key={row.id} className="truncate">
							{row.label}
						</p>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function DashboardRepositoryTable({
	highlightSource,
	highlightedDate,
	highlightedRepositoryId,
	onHighlightRepositoryChange,
	rows,
	trendData,
	variant = "commits",
}: {
	highlightSource?: DashboardHighlightSource;
	highlightedDate: string | null;
	highlightedRepositoryId?: string | null;
	onHighlightRepositoryChange?: (repositoryId: string | null) => void;
	rows: DashboardRepositorySummaryRow[];
	trendData: RepositoryDailyTrendData[] | undefined;
	variant?: DashboardRepositoryTableVariant;
}) {
	const displayRows = buildRepositoryRows(rows, highlightedDate, trendData);
	const visibleRows = displayRows.slice(0, MAX_VISIBLE_REPOSITORIES);
	const hiddenRows = displayRows.slice(MAX_VISIBLE_REPOSITORIES);
	const hiddenRowCount = Math.max(0, displayRows.length - visibleRows.length);
	const totalSessions = displayRows.reduce((sum, row) => sum + row.sessions, 0);
	const hasTableHighlight =
		highlightSource === "table" && highlightedRepositoryId != null;
	const hasChartHighlight =
		highlightSource === "chart" && highlightedRepositoryId != null;
	const columns =
		variant === "sessions"
			? [
					{
						id: "repository",
						header: "Repository",
						renderCell: (row: DashboardRepositoryTableRow) => (
							<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
								{row.label}
							</p>
						),
					},
					{
						id: "active-days",
						header: "Active days",
						renderCell: (row: DashboardRepositoryTableRow) => (
							<p className="font-medium tabular-nums text-[color:var(--dashboardy-muted)]">
								{row.activeDays ?? "—"}
							</p>
						),
					},
					{
						id: "sessions",
						header: "Sessions",
						renderCell: (row: DashboardRepositoryTableRow) => (
							<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
								{row.sessions}
							</p>
						),
					},
					{
						id: "avg-day",
						header: "Avg / day",
						renderCell: (row: DashboardRepositoryTableRow) => (
							<DashboardCellStack
								primary={
									row.activeDays && row.activeDays > 0
										? Math.round(row.sessions / row.activeDays).toLocaleString()
										: "—"
								}
								secondary={
									row.activeDays && row.activeDays > 0
										? `${row.activeDays} active days`
										: "No trend data"
								}
								primaryClassName="font-medium tabular-nums"
							/>
						),
					},
					{
						id: "share",
						header: "Share",
						renderCell: (row: DashboardRepositoryTableRow) => (
							<p className="font-semibold tabular-nums text-[color:var(--dashboardy-heading)]">
								{totalSessions > 0
									? formatPercent((row.sessions / totalSessions) * 100)
									: "0%"}
							</p>
						),
					},
				]
			: [
					{
						id: "repository",
						header: "Repository",
						renderCell: (row: DashboardRepositoryTableRow) => (
							<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
								{row.label}
							</p>
						),
					},
					{
						id: "active-days",
						header: "Active days",
						renderCell: (row: DashboardRepositoryTableRow) => (
							<p className="font-medium tabular-nums text-[color:var(--dashboardy-muted)]">
								{row.activeDays ?? "—"}
							</p>
						),
					},
					{
						id: "sessions",
						header: "Sessions",
						renderCell: (row: DashboardRepositoryTableRow) => (
							<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
								{row.sessions}
							</p>
						),
					},
					{
						id: "commits",
						header: "Commits",
						renderCell: (row: DashboardRepositoryTableRow) => (
							<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
								{row.commits}
							</p>
						),
					},
					{
						id: "rate",
						header: "Rate",
						renderCell: (row: DashboardRepositoryTableRow) => {
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
			rows={visibleRows}
			rowKey={(row) => row.id}
			gridTemplateColumns={
				variant === "sessions"
					? "minmax(200px,14fr) 100px 90px minmax(128px,8fr) 100px"
					: "minmax(200px,14fr) 100px 90px 90px 112px"
			}
			minWidthClassName={
				variant === "sessions" ? "min-w-[46rem]" : "min-w-[44rem]"
			}
			onRowHoverChange={onHighlightRepositoryChange}
			getHoverRowId={(row) => row.id}
			rowClassName={(row) =>
				cn(
					"w-full text-left transition-[opacity,background-color] duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
					hasTableHighlight &&
						"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
					hasChartHighlight &&
						highlightedRepositoryId === row.id &&
						"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
					hasTableHighlight &&
						highlightedRepositoryId === row.id &&
						"bg-[color:var(--dashboardy-subsurface-strong)] odd:bg-[color:var(--dashboardy-subsurface-strong)]",
					hasTableHighlight &&
						highlightedRepositoryId !== row.id &&
						"opacity-50",
					hasChartHighlight &&
						highlightedRepositoryId !== row.id &&
						"opacity-50",
				)
			}
			footer={
				hiddenRowCount > 0 ? (
					<DashboardTableFooterNote>
						<DashboardRepositoryOverflowPopover rows={hiddenRows} />
					</DashboardTableFooterNote>
				) : null
			}
		/>
	);
}
