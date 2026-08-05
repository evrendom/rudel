import { ArrowDown, ArrowLeft, ArrowUp } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";
import { cn } from "@/lib/utils";

type SessionTraceNavigation = {
	hasNextSession: boolean;
	hasPreviousSession: boolean;
	onNextSession: () => void;
	onPreviousSession: () => void;
};

const sessionTraceDockPressClassName =
	"scale-100 transition-transform duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100";

const sessionTraceDockButtonClassName = cn(
	"group relative flex size-9 shrink-0 items-center justify-center rounded-[calc(var(--dock-radius)-var(--dock-padding))] text-[color:var(--dashboard-01-rail-icon-active)] outline-none hover:bg-neutral-950/4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:active:scale-100 dark:hover:bg-white/6",
	sessionTraceDockPressClassName,
);

const sessionTraceDockTouchTargetClassName =
	"absolute top-1/2 left-1/2 size-12 -translate-1/2 pointer-fine:hidden";

function SessionTraceNavigationButton({
	disabled,
	icon,
	label,
	onClick,
}: {
	disabled: boolean;
	icon: ReactNode;
	label: string;
	onClick: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={label}
					className={sessionTraceDockButtonClassName}
					disabled={disabled}
					onClick={onClick}
				>
					{icon}
					<span
						aria-hidden="true"
						className={sessionTraceDockTouchTargetClassName}
					/>
				</button>
			</TooltipTrigger>
			<TooltipContent side="top" sideOffset={10}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
}

export function SessionTraceDock({
	navigation,
	onReturn,
	position,
	totalSessions,
}: {
	navigation: SessionTraceNavigation;
	onReturn: () => void;
	position: number | undefined;
	totalSessions: number;
}) {
	const positionLabel =
		position === undefined || totalSessions === 0
			? "Session"
			: `${position} of ${totalSessions}`;

	return (
		<nav
			aria-label="Session controls"
			className="shell-dock-content flex min-w-0 items-center gap-1"
		>
			<button
				type="button"
				aria-label="Back to sessions"
				className={cn(
					"group relative flex h-9 shrink-0 items-center gap-1.5 rounded-[calc(var(--dock-radius)-var(--dock-padding))] pl-2 pr-2.5 text-base font-medium text-[color:var(--dashboard-01-rail-icon-active)] outline-none hover:bg-neutral-950/4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)] dark:hover:bg-white/6 sm:text-sm",
					sessionTraceDockPressClassName,
				)}
				onClick={onReturn}
			>
				<ArrowLeft
					aria-hidden="true"
					className="size-4 shrink-0 transition-transform duration-200 ease-out group-hover:-translate-x-px group-active:translate-x-0 motion-reduce:transition-none"
				/>
				<span>Back</span>
				<span
					aria-hidden="true"
					className={sessionTraceDockTouchTargetClassName}
				/>
			</button>
			<div
				aria-hidden="true"
				className="h-5 w-px shrink-0 bg-neutral-950/8 dark:bg-white/10"
			/>
			<SessionTraceNavigationButton
				disabled={!navigation.hasPreviousSession}
				icon={
					<ArrowUp
						aria-hidden="true"
						className="size-4 shrink-0 transition-transform duration-200 ease-out group-hover:-translate-y-px group-active:translate-y-0 group-disabled:translate-y-0 motion-reduce:transition-none"
					/>
				}
				label="Previous session"
				onClick={navigation.onPreviousSession}
			/>
			<p
				aria-live="polite"
				className="min-w-16 shrink-0 px-1 text-center font-mono text-base font-medium whitespace-nowrap text-[color:var(--dashboard-01-rail-icon)] tabular-nums sm:min-w-20 sm:text-sm"
			>
				<span className="sr-only">Session </span>
				{positionLabel}
			</p>
			<SessionTraceNavigationButton
				disabled={!navigation.hasNextSession}
				icon={
					<ArrowDown
						aria-hidden="true"
						className="size-4 shrink-0 transition-transform duration-200 ease-out group-hover:translate-y-px group-active:translate-y-0 group-disabled:translate-y-0 motion-reduce:transition-none"
					/>
				}
				label="Next session"
				onClick={navigation.onNextSession}
			/>
		</nav>
	);
}
