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
}: {
	to: string;
	label: string;
	shortcut?: string;
	active?: boolean;
	badgeLabel?: string;
	children: ReactNode;
	mode?: SidebarRowMode;
}) {
	const link = (
		<Link
			to={to}
			aria-label={label}
			data-sidebar-interactive
			data-sidebar-nav-row
			className={cn(
				getUtilityRailItemClassName(mode),
				active && "bg-white text-[color:var(--dashboard-01-rail-icon-active)]",
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
		</Link>
	);

	return (
		<li>
			{mode === "collapsed" ? (
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
