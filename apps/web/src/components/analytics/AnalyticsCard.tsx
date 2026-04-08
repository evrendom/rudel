import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface AnalyticsCardProps {
	children: ReactNode;
	className?: string;
}

export function AnalyticsCard({ children, className }: AnalyticsCardProps) {
	return (
		<div
			className={cn(
				"group/card flex flex-col gap-6 overflow-hidden rounded-4xl bg-card px-6 py-6 text-sm text-card-foreground shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10",
				className,
			)}
		>
			{children}
		</div>
	);
}
