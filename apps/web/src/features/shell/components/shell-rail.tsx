import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/app/ui/badge";
import { Kbd } from "@/app/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";
import { cn } from "@/lib/utils";
import {
	getRailLabelClassName,
	getUtilityRailItemClassName,
	type SidebarRowMode,
} from "./shell-rail-utils";

export type { SidebarRowMode } from "./shell-rail-utils";

export function RailLink({
	to,
	label,
	shortcut,
	active,
	badgeLabel,
	children,
	mode = "collapsed",
	placement = "sidebar",
}: {
	to: string;
	label: string;
	shortcut?: string;
	active?: boolean;
	badgeLabel?: string;
	children: ReactNode;
	mode?: SidebarRowMode;
	placement?: "bottom-rail" | "sidebar";
}) {
	const isBottomRailPlacement = placement === "bottom-rail";
	const link = (
		<Link
			to={to}
			aria-label={label}
			aria-current={active ? "page" : undefined}
			data-active={active ? "true" : undefined}
			data-sidebar-interactive
			data-sidebar-nav-row
			className={cn(
				getUtilityRailItemClassName(mode),
				isBottomRailPlacement &&
					"!size-9 !w-9 self-auto overflow-visible rounded-lg",
			)}
		>
			<span
				aria-hidden="true"
				data-sidebar-nav-icon-lane
				className="relative flex h-[var(--sidebar-icon-lane-size)] w-[var(--sidebar-icon-lane-size)] shrink-0 items-center justify-center [&_svg]:h-[var(--sidebar-icon-size)] [&_svg]:w-[var(--sidebar-icon-size)] [&_svg]:shrink-0"
			>
				{children}
			</span>
			<span
				aria-hidden="true"
				data-sidebar-nav-label
				className={getRailLabelClassName(mode)}
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
			{isBottomRailPlacement ? (
				<span
					aria-hidden="true"
					className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
				/>
			) : null}
		</Link>
	);

	return (
		<li
			className={
				isBottomRailPlacement
					? "flex size-12 items-center justify-center"
					: undefined
			}
		>
			{mode === "collapsed" ? (
				<Tooltip>
					<TooltipTrigger asChild>{link}</TooltipTrigger>
					<TooltipContent
						side={isBottomRailPlacement ? "top" : "right"}
						sideOffset={isBottomRailPlacement ? 8 : 0}
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
