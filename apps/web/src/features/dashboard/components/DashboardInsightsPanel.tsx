import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { DashboardBranchActivityCard } from "@/features/dashboard/components/DashboardBranchActivityCard";
import { DashboardCommitCostCards } from "@/features/dashboard/components/DashboardCommitCostCards";
import { DashboardDistributionTable } from "@/features/dashboard/components/DashboardDistributionTable";
import { DashboardImpactCards } from "@/features/dashboard/components/DashboardImpactCards";
import { DashboardRankedOutputTable } from "@/features/dashboard/components/DashboardRankedOutputTable";
import { DashboardSessionProfileTable } from "@/features/dashboard/components/DashboardSessionProfileTable";
import type {
	DashboardBinaryImpact,
	DashboardBranchActivity,
	DashboardCommitCostMetric,
	DashboardDistributionRow,
	DashboardProfileComparisonRow,
	DashboardRankedOutputRow,
} from "@/features/dashboard/data/dashboard-static-data";

export function DashboardInsightsPanel({
	players,
	repositories,
	models,
	sources,
	sessionProfile,
	impactComparisons,
	commitCostMetrics,
	activeBranches,
	reposTouched,
}: {
	players: DashboardRankedOutputRow[];
	repositories: DashboardRankedOutputRow[];
	models: DashboardDistributionRow[];
	sources: DashboardDistributionRow[];
	sessionProfile: DashboardProfileComparisonRow[];
	impactComparisons: DashboardBinaryImpact[];
	commitCostMetrics: DashboardCommitCostMetric[];
	activeBranches: DashboardBranchActivity[];
	reposTouched: number;
}) {
	return (
		<section className="@container/insights-panel grid gap-4">
			<Card className="dashboardy-card overflow-hidden rounded-[1.9rem] border py-0 shadow-none">
				<CardHeader className="gap-2 border-b border-[color:var(--dashboardy-border)] px-5 py-4">
					<div className="grid gap-1">
						<p className="dashboardy-label">Output composition</p>
						<CardTitle className="dashboardy-section-title text-xl/7">
							Output broken down by dimension
						</CardTitle>
					</div>
					<CardDescription className="dashboardy-footnote">
						The same shipped output sliced by player, repository, model, and
						source.
					</CardDescription>
				</CardHeader>
				<CardContent className="@container/output-breakdown grid gap-4 px-5 py-4">
					<div className="grid gap-4 @xl/output-breakdown:grid-cols-2">
						<DashboardRankedOutputTable
							title="By player"
							description="Who is driving the output and at what rate."
							rows={players}
						/>
						<DashboardRankedOutputTable
							title="By repository"
							description="Where AI-assisted output is concentrating."
							rows={repositories}
						/>
					</div>
					<div className="grid gap-4 xl:grid-cols-2">
						<DashboardDistributionTable
							title="By model"
							description="Which model produced the commits and how reliably."
							rows={models}
						/>
						<DashboardDistributionTable
							title="By source"
							description="Claude vs Codex split on shipped output."
							rows={sources}
						/>
					</div>
				</CardContent>
			</Card>

			<div className="grid gap-4 @xl/insights-panel:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)]">
				<Card className="dashboardy-card overflow-hidden rounded-[1.9rem] border py-0 shadow-none">
					<CardHeader className="gap-2 border-b border-[color:var(--dashboardy-border)] px-5 py-4">
						<div className="grid gap-1">
							<p className="dashboardy-label">Session quality</p>
							<CardTitle className="dashboardy-section-title text-xl/7">
								What makes a shipping session different
							</CardTitle>
						</div>
						<CardDescription className="dashboardy-footnote">
							Profile the sessions that commit and compare them with the ones
							that do not.
						</CardDescription>
					</CardHeader>
					<CardContent className="grid gap-4 px-5 py-4">
						<DashboardSessionProfileTable rows={sessionProfile} />
						<DashboardImpactCards items={impactComparisons} />
					</CardContent>
				</Card>

				<div className="grid gap-4">
					<Card className="dashboardy-card overflow-hidden rounded-[1.9rem] border py-0 shadow-none">
						<CardHeader className="gap-2 border-b border-[color:var(--dashboardy-border)] px-5 py-4">
							<div className="grid gap-1">
								<p className="dashboardy-label">Commit economics</p>
								<CardTitle className="dashboardy-section-title text-xl/7">
									The production cost of a commit
								</CardTitle>
							</div>
							<CardDescription className="dashboardy-footnote">
								Time, interaction count, and cost viewed through the output
								lens.
							</CardDescription>
						</CardHeader>
						<CardContent className="px-5 py-4">
							<DashboardCommitCostCards items={commitCostMetrics} />
						</CardContent>
					</Card>

					<DashboardBranchActivityCard
						rows={activeBranches}
						reposTouched={reposTouched}
					/>
				</div>
			</div>
		</section>
	);
}
