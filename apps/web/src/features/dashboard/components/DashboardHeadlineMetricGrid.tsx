import type {
	DashboardDeltaTone,
	DashboardHeadlineMetric,
} from "@/features/dashboard/data/dashboard-static-data";
import { cn } from "@/lib/utils";

const deltaToneClass: Record<DashboardDeltaTone, string> = {
	positive: "text-emerald-700 dark:text-emerald-400",
	negative: "text-rose-700 dark:text-rose-400",
	neutral: "text-muted-foreground",
};

export function DashboardHeadlineMetricGrid({
	metrics,
}: {
	metrics: DashboardHeadlineMetric[];
}) {
	return (
		<div className="@container/headline-metrics dashboardy-card overflow-hidden rounded-[1.9rem] border shadow-none">
			<div className="grid divide-y divide-[color:var(--dashboardy-divider)] @lg/headline-metrics:grid-cols-3 @lg/headline-metrics:divide-x @lg/headline-metrics:divide-y-0">
				{metrics.map((metric) => (
					<div
						key={metric.id}
						className="grid gap-3 p-4 @lg/headline-metrics:p-5"
					>
						<div className="grid gap-1">
							<div className="flex items-start justify-between gap-3">
								<p className="dashboardy-label truncate">{metric.label}</p>
								<p
									className={cn(
										"shrink-0 pt-0.5 text-xs font-medium tabular-nums",
										deltaToneClass[metric.deltaTone],
									)}
								>
									{metric.deltaLabel}
								</p>
							</div>
							<p className="dashboard-big-number text-[1.85rem]/8 tabular-nums text-[color:var(--dashboardy-heading)]">
								{metric.valueLabel}
							</p>
						</div>
						<p className="dashboardy-footnote max-w-[24ch] text-sm/6">
							{metric.description}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}
