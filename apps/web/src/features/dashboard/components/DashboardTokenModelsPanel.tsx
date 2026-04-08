import type { ModelTokensTrendData } from "@rudel/api-routes";
import { CpuIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Skeleton } from "@/app/ui/skeleton";
import { DashboardAnalysisPanel } from "@/features/dashboard/components/DashboardAnalysisPanel";
import { DashboardTokenModelChart } from "@/features/dashboard/components/DashboardTokenModelChart";
import { DashboardTokenModelTable } from "@/features/dashboard/components/DashboardTokenModelTable";
import {
	buildDashboardTokenModelChartData,
	buildDashboardTokenModelRows,
} from "@/features/dashboard/data/dashboard-token-model-adapter";

function DashboardTokenModelChartFallback() {
	const skeletonHeights = [
		"h-[8rem]",
		"h-[10rem]",
		"h-[6.75rem]",
		"h-[11rem]",
		"h-[8.5rem]",
		"h-[9.5rem]",
	] as const;

	return (
		<div className="flex h-full items-end gap-3 px-4 pb-8 pt-4">
			{skeletonHeights.map((heightClassName) => (
				<div
					key={heightClassName}
					className="flex min-w-0 flex-1 flex-col items-center gap-3"
				>
					<Skeleton
						className={`w-full max-w-[44px] rounded-xl bg-muted/70 ${heightClassName}`}
					/>
					<Skeleton className="h-3 w-16 rounded-full bg-muted/60" />
				</div>
			))}
		</div>
	);
}

export function DashboardTokenModelsPanel({
	modelTokensTrend,
}: {
	modelTokensTrend: ModelTokensTrendData[] | undefined;
}) {
	const [highlightedModelId, setHighlightedModelId] = useState<string | null>(
		null,
	);
	const modelRows = useMemo(
		() => buildDashboardTokenModelRows(modelTokensTrend),
		[modelTokensTrend],
	);
	const chartData = useMemo(
		() => buildDashboardTokenModelChartData(modelRows),
		[modelRows],
	);
	const hasModelData = modelRows.length > 0;
	const isPending = modelTokensTrend === undefined;

	return (
		<DashboardAnalysisPanel
			title="By model"
			icon={
				<CpuIcon className="size-5 text-[color:var(--dashboardy-heading)]" />
			}
			chartShellDataSlot="dashboard-token-model-chart-shell"
			showTableDivider={hasModelData}
			chartContent={
				isPending ? (
					<DashboardTokenModelChartFallback />
				) : hasModelData ? (
					<DashboardTokenModelChart
						activeId={highlightedModelId}
						data={chartData}
					/>
				) : (
					<div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
						No model token activity in the selected range.
					</div>
				)
			}
			tableContent={
				hasModelData ? (
					<DashboardTokenModelTable
						onHighlightModelChange={setHighlightedModelId}
						rows={modelRows}
					/>
				) : null
			}
		/>
	);
}
