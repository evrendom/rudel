import type { DashboardCommitCostMetric } from "@/features/dashboard/data/dashboard-static-data";

export function DashboardCommitCostCards({
	items,
}: {
	items: DashboardCommitCostMetric[];
}) {
	return (
		<div className="@container/commit-costs grid gap-3 @lg/commit-costs:grid-cols-3">
			{items.map((item) => (
				<div
					key={item.label}
					className="dashboardy-bucket-card grid gap-2 rounded-[1.4rem]"
				>
					<p className="dashboardy-label truncate">{item.label}</p>
					<p className="dashboard-big-number text-2xl/8 tabular-nums text-[color:var(--dashboardy-heading)]">
						{item.valueLabel}
					</p>
					<p className="dashboardy-footnote text-sm/6">{item.description}</p>
				</div>
			))}
		</div>
	);
}
