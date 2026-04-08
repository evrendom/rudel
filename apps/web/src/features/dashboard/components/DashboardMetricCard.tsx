import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";

export function DashboardMetricCard({
	description,
	icon: Icon,
	title,
	to,
	value,
}: {
	description: string;
	icon: LucideIcon;
	title: string;
	to: string;
	value: string;
}) {
	return (
		<Link to={to} className="group block h-full">
			<Card className="h-full border-slate-200/80 bg-white/95 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.45)] transition-transform hover:-translate-y-0.5 dark:border-slate-800/80 dark:bg-slate-950/70">
				<CardContent className="flex h-full flex-col gap-4 p-5">
					<div className="flex items-start justify-between gap-4">
						<div className="min-w-0">
							<p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
								{title}
							</p>
							<p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
								{value}
							</p>
						</div>
						<div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-slate-950/5 text-slate-700 dark:bg-slate-50/10 dark:text-slate-200">
							<Icon className="h-5 w-5" />
						</div>
					</div>
					<div className="mt-auto flex items-center justify-between gap-3 text-sm text-slate-600 dark:text-slate-300">
						<span>{description}</span>
						<ArrowUpRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
					</div>
				</CardContent>
			</Card>
		</Link>
	);
}
