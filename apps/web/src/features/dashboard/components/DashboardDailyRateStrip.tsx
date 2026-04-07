import type { DashboardOutputSnapshot } from "@/features/dashboard/data/dashboard-static-data";
import { cn } from "@/lib/utils";

export function DashboardDailyRateStrip({
	data,
}: {
	data: DashboardOutputSnapshot["dailyPattern"];
}) {
	return (
		<div className="@container/daily-rate grid gap-2 @md/daily-rate:grid-cols-7">
			{data.map((point) => (
				<div
					key={point.date}
					className={cn(
						"dashboardy-bucket-card grid gap-1 rounded-[1.2rem] p-3",
						point.commitRate == null && "opacity-75",
					)}
				>
					<p className="dashboardy-label">{point.axisLabel}</p>
					<p className="dashboard-big-number text-base/6 tabular-nums text-[color:var(--dashboardy-heading)]">
						{point.commitRate == null ? "—" : `${point.commitRate}%`}
					</p>
					<p className="dashboardy-footnote text-xs/5">
						{point.commits == null || point.sessions == null
							? "Future day"
							: `${point.commits} commits / ${point.sessions} sessions`}
					</p>
				</div>
			))}
		</div>
	);
}
