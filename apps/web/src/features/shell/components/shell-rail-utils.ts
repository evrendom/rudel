import { shellPressMotionClassName } from "@/features/shell/components/shell-press-motion";
import { cn } from "@/lib/utils";

export type SidebarRowMode = "collapsed" | "expanded";

const shellMenuButtonBaseClassName = cn(
	"relative flex h-[var(--sidebar-row-height)] w-full items-center gap-[var(--sidebar-row-gap)] overflow-hidden rounded-full text-left !bg-[var(--sidebar-row-idle-bg)] text-[color:var(--sidebar-row-fg)] outline-none hover:!bg-[var(--sidebar-row-hover-bg)] hover:!text-[color:var(--sidebar-row-active-fg)] active:!bg-[var(--sidebar-row-hover-bg)] active:!text-[color:var(--sidebar-row-active-fg)] focus-visible:ring-3 focus-visible:ring-ring/50 data-[active=true]:!bg-[var(--sidebar-row-active-bg)] data-[active=true]:!text-[color:var(--sidebar-row-active-fg)]",
	shellPressMotionClassName,
);

function getShellMenuButtonClassName(mode: SidebarRowMode) {
	return cn(
		shellMenuButtonBaseClassName,
		mode === "expanded"
			? "justify-start pl-[var(--sidebar-row-padding-left)] pr-[var(--sidebar-row-padding-right)]"
			: "justify-start pl-[var(--sidebar-collapsed-row-padding-left)] pr-[var(--sidebar-collapsed-row-padding-right)]",
	);
}

export function getUtilityRailItemClassName(mode: SidebarRowMode) {
	return cn(
		getShellMenuButtonClassName(mode),
		mode === "collapsed" && "!w-auto self-start",
	);
}

export function getRailLabelClassName(mode: SidebarRowMode) {
	return mode === "expanded"
		? "min-w-0 flex-1 truncate whitespace-nowrap text-[length:var(--sidebar-label-font-size)] font-medium"
		: "sr-only";
}

export function getUtilityRailLabelClassName(mode: SidebarRowMode) {
	return mode === "expanded"
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
