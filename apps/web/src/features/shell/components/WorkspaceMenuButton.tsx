"use client";

import { CheckIcon, CommandIcon, Settings2Icon } from "lucide-react";
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
	getSidebarIconLaneDebugClassName,
	getSidebarLabelLaneDebugClassName,
	getSidebarRowDebugClassName,
	getUtilityRailItemClassName,
	getUtilityRailLabelClassName,
	type SidebarRowDebugProps,
	type SidebarRowMode,
} from "@/features/shell/components/shell-rail";
import { appendSidebarShellDebugParams } from "@/features/shell/config/sidebar-shell-debug";
import workspaceIcon from "@/features/team/assets/team-lineup-workspace-icon-v5.png";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { cn } from "@/lib/utils";

export function WorkspaceMenuButton({
	debugShowBorders,
	debugVariant,
	forceShowLabels,
	mode = "expanded",
}: SidebarRowDebugProps & { mode?: SidebarRowMode }) {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { state, actions } = useOrganization();
	const workspaceName = state.activeOrg?.name ?? "Workspace";

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						aria-label={workspaceName}
						data-sidebar-interactive
						data-sidebar-workspace-row
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
					data-sidebar-workspace-icon-lane
					className={cn(
						"flex h-[var(--sidebar-icon-lane-size)] w-[var(--sidebar-icon-lane-size)] shrink-0 items-center justify-center [&_svg]:h-[var(--sidebar-icon-size)] [&_svg]:w-[var(--sidebar-icon-size)] [&_svg]:shrink-0",
						getSidebarIconLaneDebugClassName(debugShowBorders, debugVariant),
					)}
				>
					<div className="relative flex h-[var(--sidebar-avatar-size)] min-h-[var(--sidebar-avatar-size)] w-[var(--sidebar-avatar-size)] min-w-[var(--sidebar-avatar-size)] shrink-0 items-center justify-center overflow-hidden rounded-full bg-black">
						<img
							src={workspaceIcon}
							alt=""
							aria-hidden="true"
							className="block size-full object-cover"
						/>
					</div>
				</div>
				<span
					aria-hidden="true"
					data-sidebar-workspace-label
					className={cn(
						getUtilityRailLabelClassName(mode, forceShowLabels),
						getSidebarLabelLaneDebugClassName(debugShowBorders, debugVariant),
					)}
				>
					{workspaceName}
				</span>
			</DropdownMenuTrigger>
			<DropdownMenuContent className="min-w-56" side="right" align="start">
				{state.organizations.length > 0 ? (
					state.organizations.map((organization) => (
						<DropdownMenuItem
							key={organization.id}
							onClick={() => void actions.switchOrganization(organization.id)}
						>
							<span className="flex-1 truncate">{organization.name}</span>
							{organization.id === state.activeOrg?.id ? <CheckIcon /> : null}
						</DropdownMenuItem>
					))
				) : (
					<DropdownMenuItem disabled>No workspaces yet</DropdownMenuItem>
				)}
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={() =>
						navigate(
							appendSidebarShellDebugParams(
								appRoutes.settingsWorkspace(),
								searchParams,
							),
						)
					}
				>
					<Settings2Icon />
					Workspace settings
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() =>
						navigate(
							appendSidebarShellDebugParams(
								appRoutes.settingsCreateWorkspace(),
								searchParams,
							),
						)
					}
				>
					<CommandIcon />
					Create workspace
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
