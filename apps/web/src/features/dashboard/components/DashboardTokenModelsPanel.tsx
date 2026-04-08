import type { ModelTokensTrendData } from "@rudel/api-routes";
import { CpuIcon } from "lucide-react";
import { useMemo } from "react";
import { ModelTokensChart } from "@/components/charts/ModelTokensChart";

function formatCompactNumber(value: number) {
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}

	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(1)}K`;
	}

	return value.toLocaleString();
}

export function DashboardTokenModelsPanel({
	modelTokensTrend,
}: {
	modelTokensTrend: ModelTokensTrendData[] | undefined;
}) {
	const leadingModelNote = useMemo(() => {
		const totals = new Map<string, number>();

		for (const row of modelTokensTrend ?? []) {
			totals.set(row.model, (totals.get(row.model) ?? 0) + row.total_tokens);
		}

		const topModel = Array.from(totals.entries()).sort(
			(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
		)[0];

		if (!topModel) {
			return "No model token activity in the selected range.";
		}

		return `${topModel[0]} is carrying the heaviest token load at ${formatCompactNumber(topModel[1])}.`;
	}, [modelTokensTrend]);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between">
				<div className="flex items-center gap-2.5">
					<CpuIcon className="size-5 text-[color:var(--dashboardy-heading)]" />
					<h2 className="dashboardy-section-title text-xl/7">By model</h2>
				</div>
				<p className="max-w-[48ch] text-sm/6 text-[color:var(--dashboardy-muted)] sm:text-right">
					{leadingModelNote}
				</p>
			</div>
			<div className="rounded-[1.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-3 py-2 sm:px-4 sm:py-3">
				{(modelTokensTrend?.length ?? 0) > 0 ? (
					<ModelTokensChart data={modelTokensTrend ?? []} />
				) : (
					<div className="flex h-[18.5rem] items-center justify-center px-6 text-center text-sm text-muted-foreground sm:h-[20rem]">
						No model token activity in the selected range.
					</div>
				)}
			</div>
		</div>
	);
}
