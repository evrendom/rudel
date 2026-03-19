import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { cn } from "../../lib/utils";
import { AnalyticsCard } from "./AnalyticsCard";

interface StatCardProps {
	title: string;
	value: string | number;
	subtitle?: string;
	icon?: LucideIcon;
	trend?: {
		value: number;
		label?: string;
	};
	iconColor?: string;
	href?: string;
	linkLabel?: string;
}

export function StatCard({
	title,
	value,
	icon: Icon,
	trend,
	iconColor = "text-blue-600",
	href,
	linkLabel,
}: StatCardProps) {
	const { trackNavigation } = useAnalyticsTracking();

	return (
		<AnalyticsCard className="!p-4">
			<div className="flex items-start justify-between">
				<div className="flex-1 min-w-0">
					<p className="text-xs font-medium text-muted">{title}</p>
					<p className="text-2xl font-bold text-heading">{value}</p>
					{trend && (
						<div className="flex items-center mt-1">
							<span
								className={cn(
									"text-xs font-medium",
									trend.value >= 0
										? "text-status-success-icon"
										: "text-status-error-icon",
								)}
							>
								{trend.value >= 0 ? "\u2191" : "\u2193"}{" "}
								{Math.abs(trend.value).toFixed(1)}%
							</span>
						</div>
					)}
				</div>
				<div className="flex flex-col items-end gap-1 shrink-0">
					{Icon && (
						<div className={cn("p-1.5 rounded-md bg-surface", iconColor)}>
							<Icon className="h-3.5 w-3.5" />
						</div>
					)}
					{href && (
						<Link
							to={href}
							onClick={() => {
								trackNavigation({
									navType: "stat_card",
									sourceComponent: "stat_card",
									targetPath: href,
									targetType: "page",
								});
							}}
							className="text-[11px] text-muted hover:text-heading transition-colors whitespace-nowrap"
						>
							{linkLabel || "Details"} &rarr;
						</Link>
					)}
				</div>
			</div>
		</AnalyticsCard>
	);
}
