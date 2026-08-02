import type { LucideIcon } from "lucide-react";
import { Component, type ReactNode } from "react";
import { Skeleton } from "@/app/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";
import { cn } from "@/lib/utils";

export const sessionMetricItemClassName =
	"flex shrink-0 items-start gap-2 px-3 first:pl-0 last:pr-0";

export function SessionMetric({
	badge,
	icon: Icon,
	label,
	value,
	mono = false,
}: {
	badge?: string;
	icon: LucideIcon;
	label: string;
	value: string | number;
	mono?: boolean;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div className={cn(sessionMetricItemClassName, "cursor-help")}>
					<Icon
						aria-hidden="true"
						className="size-4 h-lh shrink-0 stroke-[color:var(--dashboardy-heading)]"
					/>
					<div className="min-w-0 flex-1">
						<div
							className={cn(
								"whitespace-nowrap text-base font-semibold text-[color:var(--dashboardy-heading)] tabular-nums sm:text-[0.8125rem]",
								mono && "font-mono",
							)}
						>
							<span className="sr-only">{label}: </span>
							{value}
							{badge ? (
								<span className="ml-1.5 inline-flex rounded-full border border-[color:var(--dashboardy-warning-foreground)] px-1.5 py-0.5 align-middle font-sans text-[0.625rem] font-medium text-[color:var(--dashboardy-warning-foreground)]">
									{badge}
								</span>
							) : null}
						</div>
					</div>
				</div>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

export function SessionMetricSkeleton({
	valueClassName,
}: {
	valueClassName: string;
}) {
	return (
		<div className={sessionMetricItemClassName}>
			<Skeleton className="size-4 shrink-0 rounded-sm bg-[color:var(--dashboardy-subsurface-strong)]" />
			<div className="min-w-0 flex-1">
				<Skeleton
					className={cn(
						"h-4 rounded-sm bg-[color:var(--dashboardy-subsurface-strong)]",
						valueClassName,
					)}
				/>
			</div>
		</div>
	);
}

type SessionDetailErrorBoundaryProps = {
	children: ReactNode;
};

type SessionDetailErrorBoundaryState = {
	hasError: boolean;
};

export class SessionDetailErrorBoundary extends Component<
	SessionDetailErrorBoundaryProps,
	SessionDetailErrorBoundaryState
> {
	override state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	override componentDidCatch(error: unknown) {
		console.error("[SessionDetailView] Failed to render session detail", error);
	}

	override render() {
		if (this.state.hasError) {
			return (
				<div className="flex h-full items-center justify-center px-6 py-10">
					<div className="dashboardy-card max-w-md rounded-[1.5rem] border px-6 py-5 text-center shadow-none">
						<p className="text-lg font-semibold text-[color:var(--dashboardy-heading)]">
							Unable to render this session
						</p>
						<p className="mt-2 text-sm text-[color:var(--dashboardy-muted)]">
							The transcript payload for this session uses an unexpected shape.
						</p>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
