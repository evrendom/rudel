import {
	DashboardCellStack,
	DashboardGridTable,
	DashboardTableFooterNote,
} from "@/features/dashboard/components/DashboardGridTable";
import type { DashboardSessionHourlyOverviewRow } from "@/features/dashboard/data/dashboard-tab-adapters";
import { formatCompactNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_HOURLY_ROWS = 10;

function getBandToneClasses(
	tone: DashboardSessionHourlyOverviewRow["bandTone"],
) {
	switch (tone) {
		case "success":
			return {
				dotClassName: "bg-[color:var(--dashboardy-success-foreground)]",
				textClassName: "text-[color:var(--dashboardy-success-foreground)]",
			};
		case "warning":
			return {
				dotClassName: "bg-[color:var(--dashboardy-warning-foreground)]",
				textClassName: "text-[color:var(--dashboardy-warning-foreground)]",
			};
		case "danger":
			return {
				dotClassName: "bg-[color:var(--dashboardy-danger-foreground)]",
				textClassName: "text-[color:var(--dashboardy-danger-foreground)]",
			};
		case "muted":
			return {
				dotClassName: "bg-[color:var(--dashboardy-subtle)]",
				textClassName: "text-[color:var(--dashboardy-muted)]",
			};
	}
}

export function DashboardSessionHourlyOverviewTable({
	highlightSource,
	highlightedHour,
	isLoading = false,
	onHighlightHourChange,
	rows,
}: {
	highlightSource?: "chart" | "table" | null;
	highlightedHour?: string | null;
	isLoading?: boolean;
	onHighlightHourChange?: (hour: string | null) => void;
	rows: DashboardSessionHourlyOverviewRow[];
}) {
	const visibleRows = rows.slice(0, MAX_HOURLY_ROWS);
	const hiddenCount = Math.max(rows.length - visibleRows.length, 0);
	const hasTableHighlight =
		highlightSource === "table" && highlightedHour != null;

	return (
		<DashboardGridTable
			columns={[
				{
					id: "hour",
					header: "Hour",
					renderCell: (row) => (
						<DashboardCellStack
							primary={row.label}
							secondary={`Hour ${row.hour.toString().padStart(2, "0")}`}
							primaryClassName="font-semibold"
						/>
					),
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
					id: "share",
					header: "Share",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{row.sharePct == null ? "—" : formatPercent(row.sharePct)}
						</p>
					),
				},
				{
					id: "band",
					header: "Window",
					renderCell: (row) => {
						const tone = getBandToneClasses(row.bandTone);

						return (
							<div className="flex items-center gap-2">
								<span
									className={cn("size-2 rounded-full", tone.dotClassName)}
								/>
								<p className={cn("truncate font-semibold", tone.textClassName)}>
									{row.bandLabel}
								</p>
							</div>
						);
					},
				},
			]}
			rows={visibleRows}
			rowKey={(row) => row.hour.toString()}
			getHoverRowId={(row) => row.hour.toString()}
			onRowHoverChange={onHighlightHourChange}
			gridTemplateColumns="minmax(160px,1.2fr) 100px 90px minmax(180px,1fr)"
			minWidthClassName="min-w-[42rem]"
			rowClassName={(row) =>
				cn(
					"transition-colors duration-200",
					hasTableHighlight &&
						highlightedHour === row.hour.toString() &&
						"!bg-[color:var(--dashboardy-subsurface-strong)]",
				)
			}
			loadingState={
				isLoading ? (
					<div className="px-3.5 py-4 text-sm text-[color:var(--dashboardy-muted)]">
						Loading hourly session breakdown…
					</div>
				) : undefined
			}
			emptyState={
				<div className="px-3.5 py-4 text-sm text-[color:var(--dashboardy-muted)]">
					No session activity in the selected range.
				</div>
			}
			footer={
				hiddenCount > 0 ? (
					<DashboardTableFooterNote>
						{hiddenCount} quieter hours not shown
					</DashboardTableFooterNote>
				) : undefined
			}
		/>
	);
}
