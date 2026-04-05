import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Badge } from "@/app/ui/badge";
import type { SidebarShellMotionVariant } from "@/app/ui/sidebar";
import { appendSidebarShellDebugParams } from "@/features/shell/config/sidebar-shell-debug";
import { cn } from "@/lib/utils";

export type SidebarRowDebugProps = {
	debugShowBorders?: boolean;
	debugVariant?: SidebarShellMotionVariant;
	forceExpandedSidebar?: boolean;
	forceShowLabels?: boolean;
};

const shellMenuButtonBaseClassName =
	"relative flex w-full items-center gap-[var(--sidebar-row-gap)] overflow-hidden h-[var(--sidebar-row-height)] rounded-[var(--sidebar-row-radius)] text-left !bg-[var(--sidebar-row-idle-bg)] text-[color:var(--sidebar-row-fg)] outline-none transition-[background-color] duration-[160ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:!bg-[var(--sidebar-row-hover-bg)] hover:!text-[color:var(--sidebar-row-active-fg)] active:!bg-[var(--sidebar-row-hover-bg)] active:!text-[color:var(--sidebar-row-active-fg)] focus-visible:ring-3 focus-visible:ring-ring/50 data-[active=true]:!bg-[var(--sidebar-row-active-bg)] data-[active=true]:!text-[color:var(--sidebar-row-active-fg)]";

function getShellMenuButtonClassName(isExpanded: boolean) {
	return cn(
		shellMenuButtonBaseClassName,
		isExpanded
			? "justify-start pl-[var(--sidebar-row-padding-left)] pr-[var(--sidebar-row-padding-right)]"
			: "justify-start pl-[var(--sidebar-collapsed-row-padding-left)] pr-[var(--sidebar-collapsed-row-padding-right)]",
	);
}

export function getUtilityRailItemClassName(
	isExpanded: boolean,
	forceShowLabels = false,
) {
	return cn(
		getShellMenuButtonClassName(isExpanded),
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
	isExpanded: boolean,
	forceShowLabels = false,
) {
	return isExpanded || forceShowLabels
		? "min-w-0 flex-1 truncate whitespace-nowrap text-[length:var(--sidebar-label-font-size)] font-medium"
		: "sr-only";
}

export function getUtilityRailLabelClassName(
	isExpanded: boolean,
	forceShowLabels = false,
) {
	return isExpanded || forceShowLabels
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
	forceExpandedSidebar,
	forceShowLabels,
}: {
	to: string;
	label: string;
	shortcut?: string;
	active?: boolean;
	badgeLabel?: string;
	children: ReactNode;
} & SidebarRowDebugProps) {
	const [searchParams] = useSearchParams();
	const isExpandedSidebar = forceExpandedSidebar ?? false;
	const resolvedTo = appendSidebarShellDebugParams(to, searchParams);

	return (
		<li>
			<Link
				to={resolvedTo}
				aria-label={label}
				data-sidebar-interactive
				data-sidebar-nav-row
				title={!isExpandedSidebar ? label : undefined}
				className={cn(
					getUtilityRailItemClassName(isExpandedSidebar, forceShowLabels),
					active &&
						"bg-white text-[color:var(--dashboard-01-rail-icon-active)]",
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
						getRailLabelClassName(isExpandedSidebar, forceShowLabels),
						getSidebarLabelLaneDebugClassName(debugShowBorders, debugVariant),
					)}
				>
					{label}
				</span>
				{isExpandedSidebar && shortcut ? (
					<span
						aria-hidden="true"
						className="ml-auto inline-flex min-w-5 items-center justify-center rounded-md px-1.5 text-[length:var(--sidebar-shortcut-font-size)] text-[color:var(--sidebar-row-fg)]"
					>
						{shortcut}
					</span>
				) : null}
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
		</li>
	);
}
