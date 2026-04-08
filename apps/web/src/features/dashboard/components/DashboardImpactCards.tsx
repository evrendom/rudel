import type { DashboardBinaryImpact } from "@/features/dashboard/data/dashboard-static-data";

export function DashboardImpactCards({
	items,
}: {
	items: DashboardBinaryImpact[];
}) {
	return (
		<div className="@container/impact-cards grid gap-3 @lg/impact-cards:grid-cols-2">
			{items.map((item) => (
				<div
					key={item.label}
					className="dashboardy-bucket-card grid gap-3 rounded-[1.4rem]"
				>
					<div className="grid gap-1">
						<h3 className="dashboardy-section-title text-sm/6">{item.label}</h3>
						<p className="dashboardy-footnote text-sm/6">{item.description}</p>
					</div>
					<div className="grid gap-2">
						<div className="dashboardy-list-row py-3">
							<p className="dashboardy-list-secondary text-sm">
								{item.withLabel}
							</p>
							<p className="dashboardy-list-value text-sm tabular-nums">
								{item.withValue}
							</p>
						</div>
						<div className="dashboardy-list-row py-3">
							<p className="dashboardy-list-secondary text-sm">
								{item.withoutLabel}
							</p>
							<p className="dashboardy-list-value text-sm tabular-nums">
								{item.withoutValue}
							</p>
						</div>
					</div>
				</div>
			))}
		</div>
	);
}
