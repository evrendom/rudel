import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/app/ui/table";
import type { DashboardProfileComparisonRow } from "@/features/dashboard/data/dashboard-static-data";

export function DashboardSessionProfileTable({
	rows,
}: {
	rows: DashboardProfileComparisonRow[];
}) {
	return (
		<div className="dashboardy-bucket-card rounded-[1.4rem]">
			<div className="grid gap-1 pb-3">
				<h3 className="dashboardy-section-title text-sm/6">
					Committed vs uncommitted profile
				</h3>
				<p className="dashboardy-footnote text-sm/6">
					What sessions that ship look like compared with sessions that do not.
				</p>
			</div>
			<div className="overflow-x-auto">
				<Table className="dashboardy-board-table min-w-[24rem]">
					<TableHeader>
						<TableRow className="border-[color:var(--dashboardy-divider)] hover:bg-transparent">
							<TableHead className="dashboardy-label h-9 px-0">
								Metric
							</TableHead>
							<TableHead className="dashboardy-label h-9 px-0 text-right">
								Committed
							</TableHead>
							<TableHead className="dashboardy-label h-9 px-0 text-right">
								Uncommitted
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => (
							<TableRow
								key={row.label}
								className="dashboardy-board-row border-[color:var(--dashboardy-divider)] hover:bg-transparent"
							>
								<TableCell className="dashboardy-list-primary px-0">
									{row.label}
								</TableCell>
								<TableCell className="px-0 text-right tabular-nums text-[color:var(--dashboardy-heading)]">
									{row.committed}
								</TableCell>
								<TableCell className="px-0 text-right tabular-nums text-[color:var(--dashboardy-muted)]">
									{row.uncommitted}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
