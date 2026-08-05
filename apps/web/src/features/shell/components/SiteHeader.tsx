import { useLocation } from "react-router-dom";
import { isSessionDetailPath } from "@/app/routes";
import { Separator } from "@/app/ui/separator";
import { SidebarTrigger } from "@/app/ui/sidebar";
import {
	getActiveSettingsRouteId,
	settingsRouteMap,
} from "@/features/settings/config/settings-routes";
import { DashboardHeader } from "@/features/shell/components/dashboard-header";
import { WorkspaceMenuButton } from "@/features/shell/components/WorkspaceMenuButton";
import { useCurrentShellRoute } from "@/features/shell/hooks/useCurrentShellRoute";

export function SiteHeader({
	setPortalHost,
	showSidebarTrigger = false,
	showWorkspaceMenu = true,
}: {
	setPortalHost: (element: HTMLElement | null) => void;
	showSidebarTrigger?: boolean;
	showWorkspaceMenu?: boolean;
}) {
	const location = useLocation();
	const currentShellRoute = useCurrentShellRoute();
	const isSessionDetail = isSessionDetailPath(location.pathname);
	const title =
		currentShellRoute.id === "settings"
			? settingsRouteMap[getActiveSettingsRouteId(location.pathname)].label
			: currentShellRoute.title;

	return (
		<DashboardHeader showDivider className="gap-2 px-3 sm:px-4 lg:px-6">
			{showSidebarTrigger ? (
				<>
					<SidebarTrigger className="-ml-1 size-9 rounded-lg text-[color:var(--dashboard-01-rail-icon)] hover:bg-[color:var(--dashboard-01-rail-hover)] hover:text-[color:var(--dashboard-01-rail-icon-active)] md:hidden" />
					<Separator
						orientation="vertical"
						className="data-vertical:h-4 data-vertical:self-auto md:hidden"
					/>
				</>
			) : null}
			{showWorkspaceMenu ? (
				<div className="flex shrink-0 items-center gap-2.5">
					<WorkspaceMenuButton variant="header" />
					<Separator
						orientation="vertical"
						className="data-vertical:h-4 data-vertical:self-auto"
					/>
				</div>
			) : null}
			{isSessionDetail ? (
				<div ref={setPortalHost} className="flex min-w-0 flex-1 items-center" />
			) : (
				<h1 className="truncate text-base font-medium text-balance [font-family:var(--app-font-heading)]">
					{title}
				</h1>
			)}
		</DashboardHeader>
	);
}
