import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/app/ui/table";
import type { DashboardBranchActivity } from "@/features/dashboard/data/dashboard-static-data";

export function DashboardBranchActivityCard({
	rows,
	reposTouched,
}: {
	rows: DashboardBranchActivity[];
	reposTouched: number;
}) {
	return (
		<Card className="dashboardy-card overflow-hidden rounded-[1.9rem] border py-0 shadow-none">
			<CardHeader className="gap-2 border-b border-[color:var(--dashboardy-border)] px-5 py-4">
				<div className="grid gap-1">
					<p className="dashboardy-label">Repository spread</p>
					<CardTitle className="dashboardy-section-title text-xl/7">
						Git depth
					</CardTitle>
				</div>
				<CardDescription className="dashboardy-footnote">
					Which branches received commits and how spread out the output is.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4 px-5 py-4">
				<div className="@container/branch-summary grid gap-3 @md/branch-summary:grid-cols-2">
					<div className="dashboardy-bucket-card rounded-[1.4rem]">
						<p className="dashboardy-label">Repositories touched</p>
						<p className="dashboard-big-number mt-2 text-2xl/8 tabular-nums text-[color:var(--dashboardy-heading)]">
							{reposTouched}
						</p>
					</div>
					<div className="dashboardy-bucket-card rounded-[1.4rem]">
						<p className="dashboardy-label">Active branches</p>
						<p className="dashboard-big-number mt-2 text-2xl/8 tabular-nums text-[color:var(--dashboardy-heading)]">
							{rows.length}
						</p>
					</div>
				</div>
				<div className="overflow-x-auto">
					<Table className="dashboardy-board-table min-w-[34rem]">
						<TableHeader>
							<TableRow className="border-[color:var(--dashboardy-divider)] hover:bg-transparent">
								<TableHead className="dashboardy-label h-9 px-0">
									Repository
								</TableHead>
								<TableHead className="dashboardy-label h-9 px-0">
									Branch
								</TableHead>
								<TableHead className="dashboardy-label h-9 px-0 text-right">
									Commits
								</TableHead>
								<TableHead className="dashboardy-label h-9 px-0 text-right">
									Players
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((row) => (
								<TableRow
									key={`${row.repository}-${row.branch}`}
									className="dashboardy-board-row border-[color:var(--dashboardy-divider)] hover:bg-transparent"
								>
									<TableCell className="dashboardy-list-primary px-0">
										{row.repository}
									</TableCell>
									<TableCell className="px-0">
										<p className="dashboardy-mono text-[0.8125rem] text-[color:var(--dashboardy-muted)]">
											{row.branch}
										</p>
									</TableCell>
									<TableCell className="px-0 text-right tabular-nums text-[color:var(--dashboardy-heading)]">
										{row.commits}
									</TableCell>
									<TableCell className="px-0 text-right tabular-nums text-[color:var(--dashboardy-muted)]">
										{row.players}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	);
}
