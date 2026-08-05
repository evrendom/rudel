"use client";

import { LogOutIcon, Settings2Icon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/app/ui/dropdown-menu";
import {
	getInitials,
	getUtilityRailItemClassName,
	getUtilityRailLabelClassName,
	type SidebarRowMode,
} from "@/features/shell/components/shell-rail-utils";
import { useShellRoutePath } from "@/features/shell/hooks/use-shell-route-path";
import { authClient, signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function UserRailButton({
	mode = "expanded",
	variant = "sidebar",
}: {
	mode?: SidebarRowMode;
	variant?: "bottom-rail" | "dock" | "sidebar";
}) {
	const navigate = useNavigate();
	const getShellRoutePath = useShellRoutePath();
	const { data: session } = authClient.useSession();

	const name =
		session?.user &&
		"name" in session.user &&
		typeof session.user.name === "string"
			? session.user.name
			: undefined;
	const email =
		session?.user &&
		"email" in session.user &&
		typeof session.user.email === "string"
			? session.user.email
			: undefined;
	const image =
		session?.user &&
		"image" in session.user &&
		typeof session.user.image === "string"
			? session.user.image
			: undefined;
	const accountLabel = name ?? email ?? "Account";
	const isDockVariant = variant === "dock";
	const isBottomRailVariant = variant === "bottom-rail";
	const isIconOnlyVariant = isBottomRailVariant || isDockVariant;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						aria-label={accountLabel}
						data-sidebar-interactive
						data-sidebar-user-row
						className={cn(
							isDockVariant
								? "relative flex size-9 shrink-0 scale-100 items-center justify-center rounded-[calc(var(--dock-radius)-var(--dock-padding))] text-[color:var(--dashboard-01-rail-icon)] outline-none transition-transform duration-150 ease-out hover:bg-neutral-950/4 hover:text-[color:var(--dashboard-01-rail-icon-active)] active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)] motion-reduce:transition-none motion-reduce:active:scale-100 dark:hover:bg-white/6"
								: getUtilityRailItemClassName(
										isBottomRailVariant ? "collapsed" : mode,
									),
							isBottomRailVariant &&
								"!size-9 !w-9 self-auto overflow-visible rounded-lg",
							!isDockVariant &&
								!isBottomRailVariant &&
								mode === "collapsed" &&
								"hover:!bg-transparent active:!bg-transparent",
						)}
					/>
				}
			>
				<div
					data-sidebar-user-icon-lane
					className={cn(
						"flex shrink-0 items-center justify-center",
						isDockVariant
							? "size-8"
							: "h-[var(--sidebar-icon-lane-size)] w-[var(--sidebar-icon-lane-size)] [&_svg]:h-[var(--sidebar-icon-size)] [&_svg]:w-[var(--sidebar-icon-size)] [&_svg]:shrink-0",
					)}
				>
					<div
						className={cn(
							"relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--dashboard-01-avatar-background)] text-[color:var(--dashboard-01-avatar-foreground)]",
							isDockVariant
								? "size-7"
								: "h-[var(--sidebar-avatar-size)] min-h-[var(--sidebar-avatar-size)] w-[var(--sidebar-avatar-size)] min-w-[var(--sidebar-avatar-size)]",
						)}
					>
						{image ? (
							<img
								src={image}
								alt={name ?? email ?? "User avatar"}
								className="size-full rounded-full object-cover"
							/>
						) : (
							<span className="text-[10px] font-semibold uppercase">
								{getInitials(name, email)}
							</span>
						)}
					</div>
				</div>
				{isIconOnlyVariant ? (
					<span
						aria-hidden="true"
						className="pointer-fine:hidden absolute top-1/2 left-1/2 size-12 -translate-1/2"
					/>
				) : null}
				{isIconOnlyVariant ? null : (
					<span
						aria-hidden="true"
						data-sidebar-user-label
						className={getUtilityRailLabelClassName(mode)}
					>
						{accountLabel}
					</span>
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				className="min-w-48"
				side={isIconOnlyVariant ? "top" : "right"}
				align="end"
				sideOffset={isDockVariant ? 10 : isBottomRailVariant ? 8 : 4}
			>
				<DropdownMenuItem
					onClick={() =>
						navigate(getShellRoutePath(appRoutes.settingsAccount()))
					}
				>
					<Settings2Icon />
					Account settings
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={async () => {
						await signOut();
						navigate("/");
					}}
				>
					<LogOutIcon />
					Log out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
