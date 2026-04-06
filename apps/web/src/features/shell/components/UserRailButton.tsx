"use client";

import { LogOutIcon, Settings2Icon } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
	getSidebarIconLaneDebugClassName,
	getSidebarLabelLaneDebugClassName,
	getSidebarRowDebugClassName,
	getUtilityRailItemClassName,
	getUtilityRailLabelClassName,
	type SidebarRowDebugProps,
	type SidebarRowMode,
} from "@/features/shell/components/shell-rail";
import { appendSidebarShellDebugParams } from "@/features/shell/config/sidebar-shell-debug";
import { authClient, signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function UserRailButton({
	debugShowBorders,
	debugVariant,
	forceShowLabels,
	mode = "expanded",
}: SidebarRowDebugProps & { mode?: SidebarRowMode }) {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
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
							getUtilityRailItemClassName(mode, forceShowLabels),
							mode === "collapsed" &&
								"hover:!bg-transparent active:!bg-transparent",
							getSidebarRowDebugClassName({ debugShowBorders, debugVariant }),
						)}
					/>
				}
			>
				<div
					data-sidebar-user-icon-lane
					className={cn(
						"flex h-[var(--sidebar-icon-lane-size)] w-[var(--sidebar-icon-lane-size)] shrink-0 items-center justify-center [&_svg]:h-[var(--sidebar-icon-size)] [&_svg]:w-[var(--sidebar-icon-size)] [&_svg]:shrink-0",
						getSidebarIconLaneDebugClassName(debugShowBorders, debugVariant),
					)}
				>
					<div className="relative flex h-[var(--sidebar-avatar-size)] min-h-[var(--sidebar-avatar-size)] w-[var(--sidebar-avatar-size)] min-w-[var(--sidebar-avatar-size)] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--dashboard-01-avatar-background)] text-[color:var(--dashboard-01-avatar-foreground)]">
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
				<span
					aria-hidden="true"
					data-sidebar-user-label
					className={cn(
						getUtilityRailLabelClassName(mode, forceShowLabels),
						getSidebarLabelLaneDebugClassName(debugShowBorders, debugVariant),
					)}
				>
					{accountLabel}
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="min-w-48" side="right" align="end">
				<DropdownMenuItem
					onClick={() =>
						navigate(
							appendSidebarShellDebugParams(
								appRoutes.settingsAccount(),
								searchParams,
							),
						)
					}
				>
					<Settings2Icon />
					Account settings
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={async () => {
						await signOut();
						navigate(appendSidebarShellDebugParams("/", searchParams));
					}}
				>
					<LogOutIcon />
					Log out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
