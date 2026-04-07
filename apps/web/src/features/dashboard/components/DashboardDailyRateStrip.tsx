import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/app/ui/table";
import type { DashboardOutputSnapshot } from "@/features/dashboard/data/dashboard-static-data";

export function DashboardDailyRateStrip({
	data,
}: {
	data: DashboardOutputSnapshot["dailyPattern"];
}) {
	return (
		<div className="dashboardy-bucket-card overflow-x-auto rounded-[1.4rem] p-0">
			<Table className="dashboardy-board-table min-w-[34rem]">
				<TableHeader>
					<TableRow className="border-[color:var(--dashboardy-divider)] hover:bg-transparent">
						<TableHead className="dashboardy-label h-9 px-4">Day</TableHead>
						<TableHead className="dashboardy-label h-9 px-4">Date</TableHead>
						<TableHead className="dashboardy-label h-9 px-4 text-right">
							Rate
						</TableHead>
						<TableHead className="dashboardy-label h-9 px-4 text-right">
							Commits
						</TableHead>
						<TableHead className="dashboardy-label h-9 px-4 text-right">
							Sessions
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.map((point) => (
						<TableRow
							key={point.date}
							className="dashboardy-board-row border-[color:var(--dashboardy-divider)] hover:bg-transparent"
						>
							<TableCell className="dashboardy-list-primary px-4">
								{point.axisLabel}
							</TableCell>
							<TableCell className="dashboardy-footnote px-4">
								{point.fullLabel}
							</TableCell>
							<TableCell className="px-4 text-right tabular-nums text-[color:var(--dashboardy-heading)]">
								{point.commitRate == null ? "—" : `${point.commitRate}%`}
							</TableCell>
							<TableCell className="px-4 text-right tabular-nums text-[color:var(--dashboardy-heading)]">
								{point.commits ?? "—"}
							</TableCell>
							<TableCell className="px-4 text-right tabular-nums text-[color:var(--dashboardy-muted)]">
								{point.sessions ?? "—"}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
