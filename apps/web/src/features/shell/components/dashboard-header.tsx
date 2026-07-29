import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

interface DashboardHeaderProps extends ComponentProps<"header"> {
	showDivider: boolean;
}

export function DashboardHeader({
	className,
	showDivider,
	...props
}: DashboardHeaderProps) {
	return (
		<header
			data-slot="dashboard-header"
			className={cn(
				"flex min-h-[calc(var(--dashboard-01-header-height)-var(--dashboard-header-inset))] shrink-0 items-center bg-[var(--dashboard-01-content-background)] [--dashboard-header-inset:0px]",
				showDivider && "border-b",
				className,
			)}
			{...props}
		/>
	);
}
