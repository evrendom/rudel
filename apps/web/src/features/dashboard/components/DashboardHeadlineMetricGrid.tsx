import type {
	DashboardDeltaTone,
	DashboardHeadlineMetric,
} from "@/features/dashboard/data/dashboard-static-data";
import { cn } from "@/lib/utils";

const deltaToneClass: Record<DashboardDeltaTone, string> = {
	positive: "text-status-success-icon",
	negative: "text-status-error-icon",
	neutral: "text-[color:var(--dashboardy-muted)]",
};

const metricBarClass: Record<DashboardHeadlineMetric["id"], string> = {
	sessions: "bg-[color:var(--dashboard-01-tone-blue)]",
	uncommitted: "bg-[#C21674]",
	commitRate: "bg-[color:var(--dashboard-01-tone-teal)]",
};

export function DashboardHeadlineMetricGrid({
	metrics,
	className,
	isLoading = false,
	showDelta = true,
}: {
	metrics: DashboardHeadlineMetric[];
	className?: string;
	isLoading?: boolean;
	showDelta?: boolean;
}) {
	if (isLoading) {
		return (
			<div className={cn("@container/headline-metrics", className)}>
				<div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-4 md:gap-x-10">
					<div className="flex min-w-[8.5rem] flex-col gap-1.5">
						<p className="dashboardy-section-title text-[1.8rem]/none text-[color:var(--dashboardy-muted)] sm:text-[3.2rem]/none">
							Counting...
						</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className={cn("@container/headline-metrics", className)}>
			<div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-4 md:gap-x-10">
				{metrics.map((metric) => (
					<div key={metric.id} className="flex min-w-[8.5rem] flex-col gap-1.5">
						<div className="flex items-end gap-2">
							<p className="dashboardy-section-title text-[1.8rem]/none text-[color:var(--dashboardy-heading)] sm:text-[3.2rem]/none">
								{metric.valueLabel}
							</p>
							{showDelta ? (
								<span
									className={cn(
										"pb-0.5 text-xs font-semibold tabular-nums sm:text-sm",
										deltaToneClass[metric.deltaTone],
									)}
								>
									{metric.deltaLabel}
								</span>
							) : null}
						</div>
						<div className="flex items-center gap-1.5 leading-none">
							<span
								className={cn(
									"h-3 w-[3px] rounded-full",
									metricBarClass[metric.id],
								)}
							/>
							<p className="whitespace-nowrap text-[13px] font-semibold text-[color:var(--dashboardy-muted)] sm:text-sm">
								{metric.label}
							</p>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
