import { format, parseISO } from "date-fns";
import {
	DashboardCellStack,
	DashboardGridTable,
	DashboardTableFooterNote,
} from "@/features/dashboard/components/DashboardGridTable";
import type { DashboardRepositoryDailyOverviewRow } from "@/features/dashboard/data/dashboard-repository-adapters";
import { formatCompactNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_REPOSITORY_DAILY_ROWS = 10;

function buildDayCell(row: DashboardRepositoryDailyOverviewRow) {
	const parsedDate = parseISO(row.date);
	const safeDateLabel = Number.isNaN(parsedDate.getTime())
		? row.date
		: format(parsedDate, "MMM d");
	const safeDayLabel = Number.isNaN(parsedDate.getTime())
		? row.date
		: format(parsedDate, "EEEE");

	return (
		<DashboardCellStack
			primary={safeDayLabel}
			secondary={safeDateLabel}
			primaryClassName="font-semibold"
		/>
	);
}

export function DashboardRepositoryDailyOverviewTable({
	highlightedDate,
	highlightSource,
	onHighlightDateChange,
	rows,
}: {
	highlightedDate?: string | null;
	highlightSource?: "chart" | "table" | null;
	onHighlightDateChange?: (date: string | null) => void;
	rows: DashboardRepositoryDailyOverviewRow[];
}) {
	const visibleRows = rows.slice(-MAX_REPOSITORY_DAILY_ROWS).reverse();
	const hiddenCount = Math.max(rows.length - visibleRows.length, 0);
	const hasTableHighlight =
		highlightSource === "table" && highlightedDate != null;
	const hasChartHighlight =
		highlightSource === "chart" && highlightedDate != null;

	return (
		<DashboardGridTable
			columns={[
				{
					id: "day",
					header: "Day",
					renderCell: buildDayCell,
				},
				{
					id: "sessions",
					header: "Sessions",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{formatCompactNumber(row.sessions)}
						</p>
					),
				},
				{
					id: "repos",
					header: "Repos",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{row.activeRepositories}
						</p>
					),
				},
				{
					id: "lead",
					header: "Lead repo",
					renderCell: (row) => (
						<DashboardCellStack
							primary={row.leadRepositoryLabel ?? "—"}
							secondary={
								row.leadRepositoryLabel
									? `${formatCompactNumber(row.leadRepositorySessions)} sessions`
									: "No repository activity"
							}
							primaryClassName="font-medium"
							secondaryClassName="font-medium tabular-nums"
						/>
					),
				},
				{
					id: "share",
					header: "Lead share",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{row.leadRepositoryShare == null
								? "—"
								: formatPercent(row.leadRepositoryShare)}
						</p>
					),
				},
			]}
			rows={visibleRows}
			rowKey={(row) => row.date}
			getHoverRowId={(row) => row.date}
			onRowHoverChange={onHighlightDateChange}
			gridTemplateColumns="minmax(180px,1.2fr) 100px 90px minmax(220px,1.2fr) 100px"
			minWidthClassName="min-w-[54rem]"
			rowClassName={(row) =>
				cn(
					"w-full text-left transition-[opacity,background-color] duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
					hasTableHighlight &&
						"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
					hasChartHighlight &&
						highlightedDate === row.date &&
						"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
					hasTableHighlight &&
						highlightedDate === row.date &&
						"!bg-[color:var(--dashboardy-subsurface-strong)] odd:!bg-[color:var(--dashboardy-subsurface-strong)]",
					hasTableHighlight && highlightedDate !== row.date && "opacity-50",
					hasChartHighlight && highlightedDate !== row.date && "opacity-50",
				)
			}
			footer={
				hiddenCount > 0 ? (
					<DashboardTableFooterNote>
						Latest {visibleRows.length} days shown
					</DashboardTableFooterNote>
				) : undefined
			}
		/>
	);
}
