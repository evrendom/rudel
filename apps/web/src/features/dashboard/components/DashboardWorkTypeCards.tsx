import { DashboardMeter } from "@/features/dashboard/components/DashboardMeter";
import type { DashboardWorkTypeStat } from "@/features/dashboard/data/dashboard-static-data";

export function DashboardWorkTypeCards({
	items,
}: {
	items: DashboardWorkTypeStat[];
}) {
	return (
		<div className="@container/work-types grid gap-3 @md/work-types:grid-cols-2 @5xl/work-types:grid-cols-4">
			{items.map((item) => (
				<div
					key={item.label}
					className="dashboardy-bucket-card grid gap-4 rounded-[1.4rem]"
				>
					<div className="grid gap-1">
						<p className="dashboardy-label truncate">{item.label}</p>
						<p className="dashboard-big-number text-[1.7rem]/7 tabular-nums text-[color:var(--dashboardy-heading)]">
							{item.commits}
						</p>
					</div>
					<DashboardMeter value={item.commitRate} />
					<div className="flex items-center justify-between gap-3">
						<p className="dashboardy-list-secondary text-sm tabular-nums">
							{item.sessions} sessions
						</p>
						<p className="dashboardy-list-value text-sm tabular-nums">
							{item.commitRate}% rate
						</p>
					</div>
				</div>
			))}
		</div>
	);
}
