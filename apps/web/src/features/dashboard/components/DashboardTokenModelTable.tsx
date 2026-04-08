import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/ui/popover";
import {
	DashboardGridTable,
	DashboardTableFooterNote,
} from "@/features/dashboard/components/DashboardGridTable";
import type { DashboardHighlightSource } from "@/features/dashboard/components/dashboard-highlight-state";
import type { DashboardTokenModelSummaryRow } from "@/features/dashboard/data/dashboard-token-model-adapter";
import { formatCompactWholeNumber, formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_VISIBLE_MODELS = 7;

function DashboardTokenModelOverflowPopover({
	rows,
}: {
	rows: DashboardTokenModelSummaryRow[];
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

export function DashboardTokenModelTable({
	highlightSource,
	highlightedModelId,
	onHighlightModelChange,
	rows,
}: {
	highlightSource?: DashboardHighlightSource;
	highlightedModelId?: string | null;
	onHighlightModelChange?: (modelId: string | null) => void;
	rows: DashboardTokenModelSummaryRow[];
}) {
	const visibleRows = rows.slice(0, MAX_VISIBLE_MODELS);
	const hiddenRows = rows.slice(MAX_VISIBLE_MODELS);
	const hiddenRowCount = Math.max(rows.length - visibleRows.length, 0);
	const hasTableHighlight =
		highlightSource === "table" && highlightedModelId != null;
	const hasChartHighlight =
		highlightSource === "chart" && highlightedModelId != null;

	return (
		<DashboardGridTable
			columns={[
				{
					id: "model",
					header: "Model",
					renderCell: (row) => (
						<p
							className="truncate font-semibold text-[color:var(--dashboardy-heading)]"
							title={row.label}
						>
							{row.label}
						</p>
					),
				},
				{
					id: "cost",
					header: "Cost",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{formatCurrency(row.estimatedCost)}
						</p>
					),
				},
				{
					id: "input",
					header: "Input",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{formatCompactWholeNumber(row.inputTokens)}
						</p>
					),
				},
				{
					id: "output",
					header: "Output",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{formatCompactWholeNumber(row.outputTokens)}
						</p>
					),
				},
				{
					id: "total",
					header: "Total",
					renderCell: (row) => (
						<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
							{formatCompactWholeNumber(row.totalTokens)}
						</p>
					),
				},
			]}
			rows={visibleRows}
			rowKey={(row) => row.id}
			gridTemplateColumns="minmax(220px,14fr) 120px 120px 120px 120px"
			minWidthClassName="min-w-[48rem]"
			onRowHoverChange={onHighlightModelChange}
			getHoverRowId={(row) => row.id}
			rowClassName={(row) =>
				cn(
					"w-full text-left transition-[opacity,background-color] duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
					hasTableHighlight &&
						"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
					hasChartHighlight &&
						highlightedModelId === row.id &&
						"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
					hasTableHighlight &&
						highlightedModelId === row.id &&
						"bg-[color:var(--dashboardy-subsurface-strong)] odd:bg-[color:var(--dashboardy-subsurface-strong)]",
					hasTableHighlight && highlightedModelId !== row.id && "opacity-50",
					hasChartHighlight && highlightedModelId !== row.id && "opacity-50",
				)
			}
			footer={
				hiddenRowCount > 0 ? (
					<DashboardTableFooterNote>
						<DashboardTokenModelOverflowPopover rows={hiddenRows} />
					</DashboardTableFooterNote>
				) : null
			}
		/>
	);
}
