import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/app/ui/table";
import { DashboardMeter } from "@/features/dashboard/components/DashboardMeter";
import type { DashboardRankedOutputRow } from "@/features/dashboard/data/dashboard-static-data";

export function DashboardRankedOutputTable({
	title,
	description,
	rows,
	showHeader = true,
}: {
	title: string;
	description: string;
	rows: DashboardRankedOutputRow[];
	showHeader?: boolean;
}) {
	const maxCommits = Math.max(...rows.map((row) => row.commits), 1);

	return (
		<div className="dashboardy-bucket-card min-w-0 rounded-[1.4rem]">
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
				<Table className="dashboardy-board-table min-w-[28rem]">
					<TableHeader>
						<TableRow className="border-[color:var(--dashboardy-divider)] hover:bg-transparent">
							<TableHead className="dashboardy-label h-9 px-0">Name</TableHead>
							<TableHead className="dashboardy-label h-9 w-[44%] px-0">
								Volume
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
								<TableCell className="px-0">
									<div className="grid gap-0.5">
										<p className="dashboardy-list-primary">{row.label}</p>
										{row.secondaryLabel ? (
											<p className="dashboardy-footnote text-xs/5">
												{row.secondaryLabel}
											</p>
										) : null}
									</div>
								</TableCell>
								<TableCell className="px-0">
									<div className="grid gap-2">
										<p className="dashboardy-footnote text-sm tabular-nums">
											{row.commits} commits / {row.sessions} sessions
										</p>
										<DashboardMeter value={(row.commits / maxCommits) * 100} />
									</div>
								</TableCell>
								<TableCell className="dashboardy-list-value px-0 text-right text-sm tabular-nums">
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
