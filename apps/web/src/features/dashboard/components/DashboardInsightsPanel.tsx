import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DashboardInsightSeverity =
	| "critical"
	| "negative"
	| "warning"
	| "info"
	| "positive";
type DashboardInsightType = "trend" | "performer" | "alert" | "info";

export type DashboardInsightItem = {
	insightKey: string;
	link: string;
	message: string;
	severity: DashboardInsightSeverity;
	type: DashboardInsightType;
};

const SEVERITY_BADGE_STYLES: Record<DashboardInsightSeverity, string> = {
	critical:
		"border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200",
	info: "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
	negative:
		"border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200",
	positive:
		"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200",
	warning:
		"border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200",
};

const TYPE_LABELS: Record<DashboardInsightType, string> = {
	alert: "Alert",
	info: "Info",
	performer: "Top performer",
	trend: "Trend",
};

export function DashboardInsightsPanel({
	insights,
}: {
	insights: readonly DashboardInsightItem[];
}) {
	if (insights.length === 0) {
		return null;
	}

	return (
		<Card className="border-slate-200/80 bg-white/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.45)] dark:border-slate-800/80 dark:bg-slate-950/70">
			<CardHeader className="border-b border-slate-200/70 pb-4 dark:border-slate-800/70">
				<CardTitle className="text-lg font-semibold tracking-tight text-slate-950 dark:text-slate-50">
					Quick insights
				</CardTitle>
				<CardDescription>
					A short list of notable changes in the current range.
				</CardDescription>
			</CardHeader>
			<CardContent className="p-4">
				<ul className="space-y-3">
					{insights.map((insight) => (
						<li key={insight.insightKey}>
							<Link
								to={insight.link}
								className="group block rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 transition-colors hover:border-slate-300 hover:bg-white dark:border-slate-800/80 dark:bg-slate-900/80 dark:hover:border-slate-700 dark:hover:bg-slate-950"
							>
								<div className="flex items-start justify-between gap-3">
									<Badge
										variant="outline"
										className={cn(
											"rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
											SEVERITY_BADGE_STYLES[insight.severity],
										)}
									>
										{TYPE_LABELS[insight.type]}
									</Badge>
									<ArrowUpRight className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-slate-700 dark:text-slate-500 dark:group-hover:text-slate-200" />
								</div>
								<p className="mt-3 text-sm font-medium leading-6 text-slate-900 dark:text-slate-100">
									{insight.message}
								</p>
							</Link>
						</li>
					))}
				</ul>
			</CardContent>
		</Card>
	);
}
