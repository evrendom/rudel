import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/app/ui/table";
import type { DashboardDistributionRow } from "@/features/dashboard/data/dashboard-static-data";

export function DashboardDistributionTable({
	title,
	description,
	rows,
	showHeader = true,
}: {
	title: string;
	description: string;
	rows: DashboardDistributionRow[];
	showHeader?: boolean;
}) {
	return (
		<div className="dashboardy-bucket-card rounded-[1.4rem]">
			{showHeader ? (
				<div className="grid gap-1 pb-3">
					<h3 className="dashboardy-section-title truncate text-sm/6">
						{title}
					</h3>
					<p className="dashboardy-footnote text-sm/6">{description}</p>
				</div>
			) : (
				<p className="dashboardy-footnote pb-3 text-sm/6">{description}</p>
			)}
			<div className="overflow-x-auto">
				<Table className="dashboardy-board-table min-w-[24rem]">
					<TableHeader>
						<TableRow className="border-[color:var(--dashboardy-divider)] hover:bg-transparent">
							<TableHead className="dashboardy-label h-9 px-0">Name</TableHead>
							<TableHead className="dashboardy-label h-9 px-0 text-right">
								Commits
							</TableHead>
							<TableHead className="dashboardy-label h-9 px-0 text-right">
								Share
							</TableHead>
							<TableHead className="dashboardy-label h-9 px-0 text-right">
								Rate
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
									{row.commits}
								</TableCell>
								<TableCell className="px-0 text-right tabular-nums text-[color:var(--dashboardy-muted)]">
									{row.sharePercent}%
								</TableCell>
								<TableCell className="px-0 text-right tabular-nums text-[color:var(--dashboardy-heading)]">
									{row.commitRate}%
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
