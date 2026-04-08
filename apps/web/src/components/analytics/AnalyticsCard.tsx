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
				"bg-input rounded-lg shadow-md border border-border p-6",
				className,
			)}
		>
			{children}
		</div>
	);
}
