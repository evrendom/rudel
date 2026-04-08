import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type DashboardAnalysisPanelProps = {
	title: string;
	icon?: ReactNode;
	titleLevel?: "h2" | "h3";
	controls?: ReactNode;
	chartContent: ReactNode;
	tableContent: ReactNode;
	className?: string;
	chartCardClassName?: string;
	chartInnerClassName?: string;
	chartShellClassName?: string;
	chartShellDataSlot?: string;
	tableSectionClassName?: string;
	showTableDivider?: boolean;
};

export function DashboardAnalysisPanel({
	title,
	icon,
	titleLevel = "h2",
	controls,
	chartContent,
	tableContent,
	className,
	chartCardClassName,
	chartInnerClassName,
	chartShellClassName,
	chartShellDataSlot,
	tableSectionClassName,
	showTableDivider = true,
}: DashboardAnalysisPanelProps) {
	const TitleTag = titleLevel;

	return (
		<div className={cn("flex flex-col gap-8", className)}>
			<div className="grid gap-4">
				<div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-center gap-2.5">
						{icon}
						<TitleTag
							className={cn(
								"dashboardy-section-title",
								titleLevel === "h2" ? "text-xl/7" : "text-lg/7",
							)}
						>
							{title}
						</TitleTag>
					</div>
					{controls}
				</div>
				<div
					className={cn(
						"rounded-[1.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)]",
						chartCardClassName,
					)}
				>
					<div className={cn("px-3 py-2 sm:px-4 sm:py-3", chartInnerClassName)}>
						<div
							data-slot={chartShellDataSlot}
							className={cn("h-[18.5rem] sm:h-[20rem]", chartShellClassName)}
						>
							{chartContent}
						</div>
					</div>
				</div>
			</div>
			<div
				className={cn(
					showTableDivider &&
						"border-t border-[color:var(--dashboardy-divider)] pt-8",
					tableSectionClassName,
				)}
			>
				{tableContent}
			</div>
		</div>
	);
}
