"use client";

import { CheckIcon, CommandIcon, Settings2Icon } from "lucide-react";
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
	getUtilityRailItemClassName,
	getUtilityRailLabelClassName,
	type SidebarRowMode,
} from "@/features/shell/components/shell-rail";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { cn } from "@/lib/utils";

function WorkspaceMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 1720 1896"
			fill="none"
			aria-hidden="true"
			className={cn(
				"h-[calc(var(--sidebar-avatar-size)*0.92)] w-auto",
				className,
			)}
		>
			<circle
				cx="859.946"
				cy="948.44"
				r="268.025"
				transform="rotate(23.8002 859.946 948.44)"
				fill="currentColor"
			/>
			<path
				d="M859.625 537.599C1008.55 537.599 1129.37 417.364 1129.37 268.799C1129.37 120.235 1008.69 0 859.625 0C710.563 0 589.877 120.28 589.877 268.845C589.877 417.364 710.563 537.599 859.625 537.599ZM859.625 1895.24C1008.55 1895.24 1129.37 1774.96 1129.37 1626.4C1129.37 1477.88 1008.69 1357.6 859.625 1357.6C710.563 1357.6 589.877 1477.88 589.877 1626.44C589.877 1774.96 710.563 1895.24 859.625 1895.24ZM269.748 877.021C418.675 877.021 539.496 756.741 539.496 608.176C539.496 459.656 418.765 339.377 269.748 339.377C120.641 339.377 0 459.747 0 608.312C0 756.922 120.641 877.156 269.748 877.156V877.021ZM1449.5 1555.86C1598.43 1555.86 1719.25 1435.58 1719.25 1287.02C1719.25 1138.5 1598.56 1018.22 1449.5 1018.22C1300.44 1018.22 1179.75 1138.5 1179.75 1287.07C1179.75 1435.58 1300.44 1555.86 1449.5 1555.86ZM1449.5 877.021C1598.43 877.021 1719.25 756.741 1719.25 608.176C1719.25 459.702 1598.56 339.422 1449.5 339.422C1300.44 339.422 1179.75 459.702 1179.75 608.221C1179.75 756.741 1300.44 877.021 1449.5 877.021ZM269.748 1555.82C418.675 1555.82 539.496 1435.54 539.496 1286.97C539.496 1138.45 418.765 1018.22 269.748 1018.22C120.641 1018.22 0 1138.73 0 1287.11C0 1435.54 120.641 1555.95 269.748 1555.95V1555.82Z"
				fill="currentColor"
			/>
		</svg>
	);
}

export function WorkspaceMenuButton({
	mode = "expanded",
}: {
	mode?: SidebarRowMode;
}) {
	const navigate = useNavigate();
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
							getUtilityRailItemClassName(mode),
							mode === "collapsed" &&
								"hover:!bg-transparent active:!bg-transparent",
						)}
					/>
				}
			>
				<div
					data-sidebar-workspace-icon-lane
					className="flex h-[var(--sidebar-icon-lane-size)] w-[var(--sidebar-icon-lane-size)] shrink-0 items-center justify-center"
				>
					<div className="relative flex h-[var(--sidebar-avatar-size)] min-h-[var(--sidebar-avatar-size)] w-[var(--sidebar-avatar-size)] min-w-[var(--sidebar-avatar-size)] shrink-0 items-center justify-center text-[#292A2F] dark:text-white/90">
						<WorkspaceMark />
					</div>
				</div>
				<span
					aria-hidden="true"
					data-sidebar-workspace-label
					className={getUtilityRailLabelClassName(mode)}
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
					onClick={() => navigate(appRoutes.settingsWorkspace())}
				>
					<Settings2Icon />
					Workspace settings
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() =>
						navigate(`${appRoutes.settingsWorkspace()}#new-workspace`)
					}
				>
					<CommandIcon />
					Create workspace
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
