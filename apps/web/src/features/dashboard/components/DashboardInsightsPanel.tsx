import { cn } from "@/lib/utils";
import type {
	DashboardBreakdownGroup,
	DashboardTone,
} from "@/features/dashboard/data/dashboard-static-data";
import { Badge } from "@/app/ui/badge";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";

const toneClassNames = {
	blue: "bg-dashboard-01-tone-blue",
	teal: "bg-dashboard-01-tone-teal",
	orange: "bg-dashboard-01-tone-orange",
	lime: "bg-dashboard-01-tone-lime",
	violet: "bg-dashboard-01-tone-violet",
	rose: "bg-dashboard-01-tone-rose",
	slate: "bg-dashboard-01-tone-slate",
} as const satisfies Record<DashboardTone, string>;

export function DashboardInsightsPanel({
	breakdownGroups,
	timeComposition,
	comparisonNotes,
	toolCards,
}: {
	breakdownGroups: DashboardBreakdownGroup[];
	timeComposition: Array<{
		label: string;
		valueLabel: string;
		percent: number;
		tone: DashboardTone;
	}>;
	comparisonNotes: readonly [string, string];
	toolCards: Array<{
		label: string;
		value: string;
		progress: number;
		tone: DashboardTone;
	}>;
}) {
	return (
		<Card className="dashboard-01-insights-root rounded-[1.65rem]">
			<CardHeader className="gap-2 pb-1">
				<CardTitle className="text-[1.05rem]">
					Where the team&apos;s energy goes
				</CardTitle>
			</CardHeader>
			<CardContent className="flex flex-col gap-5 pb-5">
				<div className="grid gap-3 lg:grid-cols-2">
					{breakdownGroups.map((group) => (
						<Card
							key={group.title}
							size="sm"
							className="dashboard-01-insights-panel"
						>
							<CardHeader className="gap-2">
								<div className="flex items-center justify-between gap-3">
									<div className="text-sm font-medium text-foreground">
										{group.title}
									</div>
									<Badge variant="outline" className="dashboard-01-insights-chip">
										{group.summary}
									</Badge>
								</div>
							</CardHeader>
							<CardContent>
								<div className="dashboard-01-insights-track flex h-2.5 overflow-hidden rounded-full">
									{group.items.map((item) => (
										<div
											key={item.label}
											className={toneClassNames[item.tone]}
											style={{ width: `${item.percent}%` }}
										/>
									))}
								</div>
								<div className="dashboard-01-insights-meta mt-3 flex flex-wrap gap-x-3 gap-y-2">
									{group.items.map((item) => (
										<div
											key={item.label}
											className="inline-flex items-center gap-1.5 text-[0.72rem] font-medium"
										>
											<span
												className={cn(
													"size-2 rounded-full",
													toneClassNames[item.tone],
												)}
											/>
											<span>{item.label}</span>
											<span className="text-foreground">{item.valueLabel}</span>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					))}
				</div>

				<Card size="sm" className="dashboard-01-insights-panel">
					<CardHeader>
						<CardTitle>Time composition</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="dashboard-01-insights-track flex h-10 overflow-hidden rounded-full">
							{timeComposition.map((segment) => (
								<div
									key={segment.label}
									className={cn(
										"flex items-center justify-center px-3 text-xs font-semibold text-white",
										toneClassNames[segment.tone],
									)}
									style={{ width: `${segment.percent}%` }}
								>
									{segment.label} ({segment.valueLabel})
								</div>
							))}
						</div>
						<div className="dashboard-01-insights-meta mt-3 flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
							<span>{comparisonNotes[0]}</span>
							<span>{comparisonNotes[1]}</span>
						</div>
					</CardContent>
				</Card>

				<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
					{toolCards.map((tool) => (
						<Card
							key={tool.label}
							size="sm"
							className="dashboard-01-insights-panel"
						>
							<CardHeader className="gap-1">
								<div className="text-sm font-semibold tabular-nums text-foreground">
									{tool.value}
								</div>
								<div className="dashboard-01-insights-meta text-xs font-medium">
									{tool.label}
								</div>
							</CardHeader>
							<CardContent>
								<div className="dashboard-01-insights-track h-1.5 overflow-hidden rounded-full">
									<div
										className={cn(
											"h-full rounded-full",
											toneClassNames[tool.tone],
										)}
										style={{ width: `${tool.progress}%` }}
									/>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
