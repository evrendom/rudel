import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge } from "@/app/ui/badge";
import { Kbd } from "@/app/ui/kbd";
import type { SidebarShellMotionVariant } from "@/app/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";
import { appendSidebarShellDebugParams } from "@/features/shell/config/sidebar-shell-debug";
import { cn } from "@/lib/utils";

export type SidebarRowMode = "collapsed" | "expanded";

export type SidebarRowDebugProps = {
	debugShowBorders?: boolean;
	debugVariant?: SidebarShellMotionVariant;
	forceShowLabels?: boolean;
};

const shellMenuButtonBaseClassName =
	"relative flex w-full scale-100 items-center gap-[var(--sidebar-row-gap)] overflow-hidden h-[var(--sidebar-row-height)] rounded-full text-left !bg-[var(--sidebar-row-idle-bg)] text-[color:var(--sidebar-row-fg)] outline-none transition-[background-color,color,transform] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:!bg-[var(--sidebar-row-hover-bg)] hover:!text-[color:var(--sidebar-row-active-fg)] active:scale-[0.98] active:!bg-[var(--sidebar-row-hover-bg)] active:!text-[color:var(--sidebar-row-active-fg)] focus-visible:ring-3 focus-visible:ring-ring/50 data-[active=true]:!bg-[var(--sidebar-row-active-bg)] data-[active=true]:!text-[color:var(--sidebar-row-active-fg)]";

function getShellMenuButtonClassName(mode: SidebarRowMode) {
	return cn(
		shellMenuButtonBaseClassName,
		mode === "expanded"
			? "justify-start pl-[var(--sidebar-row-padding-left)] pr-[var(--sidebar-row-padding-right)]"
			: "justify-start pl-[var(--sidebar-collapsed-row-padding-left)] pr-[var(--sidebar-collapsed-row-padding-right)]",
	);
}

export function getUtilityRailItemClassName(
	mode: SidebarRowMode,
	forceShowLabels = false,
) {
	return cn(
		getShellMenuButtonClassName(mode),
		mode === "collapsed" && "!w-auto self-start",
		forceShowLabels && "overflow-visible",
	);
}

export function getSidebarRowDebugClassName({
	debugShowBorders,
	debugVariant,
}: SidebarRowDebugProps) {
	return debugVariant === "geometry-trace" && debugShowBorders
		? "after:pointer-events-none after:absolute after:inset-0 after:z-20 after:rounded-lg after:border-2 after:border-amber-500 after:content-['']"
		: undefined;
}

export function getSidebarIconLaneDebugClassName(
	debugShowBorders?: boolean,
	debugVariant?: SidebarShellMotionVariant,
) {
	return debugVariant === "geometry-trace" && debugShowBorders
		? "relative before:pointer-events-none before:absolute before:inset-0 before:rounded-md before:bg-sky-500/10 before:content-[''] after:pointer-events-none after:absolute after:inset-0 after:z-10 after:rounded-md after:border-2 after:border-sky-500 after:content-['']"
		: undefined;
}

export function getSidebarLabelLaneDebugClassName(
	debugShowBorders?: boolean,
	debugVariant?: SidebarShellMotionVariant,
) {
	return debugVariant === "geometry-trace" && debugShowBorders
		? "relative before:pointer-events-none before:absolute before:inset-0 before:rounded-md before:bg-rose-500/10 before:content-[''] after:pointer-events-none after:absolute after:inset-0 after:z-10 after:rounded-md after:border-2 after:border-rose-500 after:content-['']"
		: undefined;
}

export function getRailLabelClassName(
	mode: SidebarRowMode,
	forceShowLabels = false,
) {
	return mode === "expanded" || forceShowLabels
		? "min-w-0 flex-1 truncate whitespace-nowrap text-[length:var(--sidebar-label-font-size)] font-medium"
		: "sr-only";
}

export function getUtilityRailLabelClassName(
	mode: SidebarRowMode,
	forceShowLabels = false,
) {
	return mode === "expanded" || forceShowLabels
		? "min-w-0 flex-1 truncate whitespace-nowrap text-[length:var(--sidebar-label-font-size)] font-medium"
		: "sr-only";
}

export function getInitials(name?: string | null, email?: string | null) {
	const source = (name?.trim() || email?.trim() || "R").split(" ");
	return source
		.map((part) => part[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

export function RailLink({
	to,
	label,
	shortcut,
	active,
	badgeLabel,
	children,
	debugShowBorders,
	debugVariant,
	mode = "collapsed",
	forceShowLabels,
}: {
	to: string;
	label: string;
	shortcut?: string;
	active?: boolean;
	badgeLabel?: string;
	children: ReactNode;
	mode?: SidebarRowMode;
} & SidebarRowDebugProps) {
	const [searchParams] = useSearchParams();
	const resolvedTo = appendSidebarShellDebugParams(to, searchParams);
	const link = (
		<Link
			to={resolvedTo}
			aria-label={label}
			data-sidebar-interactive
			data-sidebar-nav-row
			className={cn(
				getUtilityRailItemClassName(mode, forceShowLabels),
				active && "bg-white text-[color:var(--dashboard-01-rail-icon-active)]",
				getSidebarRowDebugClassName({ debugShowBorders, debugVariant }),
			)}
		>
			<span
				aria-hidden="true"
				data-sidebar-nav-icon-lane
				className={cn(
					"relative flex h-[var(--sidebar-icon-lane-size)] w-[var(--sidebar-icon-lane-size)] shrink-0 items-center justify-center [&_svg]:h-[var(--sidebar-icon-size)] [&_svg]:w-[var(--sidebar-icon-size)] [&_svg]:shrink-0",
					getSidebarIconLaneDebugClassName(debugShowBorders, debugVariant),
				)}
			>
				{children}
			</span>
			<span
				aria-hidden="true"
				data-sidebar-nav-label
				className={cn(
					getRailLabelClassName(mode, forceShowLabels),
					getSidebarLabelLaneDebugClassName(debugShowBorders, debugVariant),
				)}
			>
				{label}
			</span>
			{badgeLabel ? (
				<Badge
					className={cn(
						"pointer-events-none absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px]",
						active ? "bg-primary text-primary-foreground" : undefined,
					)}
				>
					{badgeLabel}
				</Badge>
			) : null}
		</Link>
	);

	return (
		<li>
			{mode === "collapsed" && !forceShowLabels ? (
				<Tooltip>
					<TooltipTrigger asChild>{link}</TooltipTrigger>
					<TooltipContent
						side="right"
						className="[&>[aria-hidden='true']]:hidden"
					>
						{shortcut ? (
							<div className="flex items-center gap-2">
								<span>{label}</span>
								<Kbd className="size-5 min-w-0 rounded-full border-0 p-0 text-[10px]">
									{shortcut}
								</Kbd>
							</div>
						) : (
							label
						)}
					</TooltipContent>
				</Tooltip>
			) : (
				link
			)}
		</li>
	);
}
