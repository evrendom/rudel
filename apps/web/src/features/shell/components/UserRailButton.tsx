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
} from "@/features/shell/components/shell-rail";
import { authClient, signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function UserRailButton({
	mode = "expanded",
}: {
	mode?: SidebarRowMode;
}) {
	const navigate = useNavigate();
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
							getUtilityRailItemClassName(mode),
							mode === "collapsed" &&
								"hover:!bg-transparent active:!bg-transparent",
						)}
					/>
				}
			>
				<div
					data-sidebar-user-icon-lane
					className="flex h-[var(--sidebar-icon-lane-size)] w-[var(--sidebar-icon-lane-size)] shrink-0 items-center justify-center [&_svg]:h-[var(--sidebar-icon-size)] [&_svg]:w-[var(--sidebar-icon-size)] [&_svg]:shrink-0"
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
					className={getUtilityRailLabelClassName(mode)}
				>
					{accountLabel}
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="min-w-48" side="right" align="end">
				<DropdownMenuItem onClick={() => navigate(appRoutes.settingsAccount())}>
					<Settings2Icon />
					Profile settings
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
