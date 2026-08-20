import { useLocation } from "react-router-dom";
import { isNewSessionPath, isSessionDetailPath } from "@/app/routes";
import { Separator } from "@/app/ui/separator";
import { SidebarTrigger } from "@/app/ui/sidebar";
import {
	getActiveSettingsRouteId,
	settingsRouteMap,
} from "@/features/settings/config/settings-routes";
import { DashboardHeader } from "@/features/shell/components/dashboard-header";
import { WorkspaceMenuButton } from "@/features/shell/components/WorkspaceMenuButton";
import { useCurrentShellRoute } from "@/features/shell/hooks/useCurrentShellRoute";
import { cn } from "@/lib/utils";

function SiteHeaderLeadingControls({
	showSidebarTrigger,
	showWorkspaceMenu,
}: {
	showSidebarTrigger: boolean;
	showWorkspaceMenu: boolean;
}) {
	return (
		<>
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
		</>
	);
}

export function SiteHeader({
	setNewseshListPortalHost,
	setPortalHost,
	showSidebarTrigger = false,
	showWorkspaceMenu = true,
}: {
	setNewseshListPortalHost: (element: HTMLElement | null) => void;
	setPortalHost: (element: HTMLElement | null) => void;
	showSidebarTrigger?: boolean;
	showWorkspaceMenu?: boolean;
}) {
	const location = useLocation();
	const currentShellRoute = useCurrentShellRoute();
	const isSessionDetail = isSessionDetailPath(location.pathname);
	const isNewSession = isNewSessionPath(location.pathname);
	const title =
		currentShellRoute.id === "settings"
			? settingsRouteMap[getActiveSettingsRouteId(location.pathname)].label
			: currentShellRoute.title;

	return (
		<DashboardHeader
			showDivider={!isSessionDetail}
			className={cn(
				isSessionDetail ? "p-0" : "gap-2",
				isSessionDetail
					? isNewSession
						? "[--dashboard-header-inset:4.5px]"
						: "[--dashboard-header-inset:4px]"
					: "px-3 sm:px-4 lg:px-6",
			)}
		>
			{isSessionDetail ? (
				<div className="flex min-h-0 min-w-0 flex-1 self-stretch">
					<div
						className={cn(
							"hidden min-w-0 items-center",
							isNewSession
								? "border-b-[0.5px] border-[#e5e5e6] bg-[#fcfcfc] px-2 lg:flex lg:w-[var(--session-list-pane-width,29.8125rem)] lg:flex-none"
								: "gap-2 px-3 sm:flex sm:w-[var(--session-list-pane-width,clamp(20rem,34vw,40rem))] sm:flex-none",
						)}
					>
						{isNewSession && showSidebarTrigger ? (
							<SidebarTrigger className="size-7 shrink-0 rounded-md text-[#5b5c5e] hover:bg-[#ececed] hover:text-[#1b1b1b]" />
						) : (
							<SiteHeaderLeadingControls
								showSidebarTrigger={showSidebarTrigger}
								showWorkspaceMenu={showWorkspaceMenu}
							/>
						)}
						<h1
							className={cn(
								"truncate font-medium text-balance [font-family:var(--app-font-heading)]",
								isNewSession
									? "ml-1 text-[0.8125rem] tracking-[-0.01em] text-[#1b1b1b]"
									: "text-base",
							)}
						>
							Sessions
						</h1>
						{isNewSession ? (
							<div
								ref={setNewseshListPortalHost}
								className="ml-1 flex min-w-0 flex-1 items-center"
							/>
						) : null}
					</div>
					<div
						className={cn(
							"relative z-10 flex min-w-0 flex-1 items-center gap-2 border-l border-black/6 bg-[var(--dashboard-01-content-background)] pr-2 pl-3 dark:border-white/8",
							!isNewSession &&
								"shadow-[-4px_0_10px_-8px_rgba(0,0,0,0.18)] dark:shadow-[-4px_0_10px_-8px_rgba(0,0,0,0.5)]",
						)}
					>
						<div
							className={cn(
								"flex shrink-0 items-center gap-2",
								isNewSession ? "lg:hidden" : "sm:hidden",
							)}
						>
							<SiteHeaderLeadingControls
								showSidebarTrigger={showSidebarTrigger}
								showWorkspaceMenu={showWorkspaceMenu}
							/>
						</div>
						<div
							ref={setPortalHost}
							className="flex min-w-0 flex-1 items-center"
						/>
					</div>
				</div>
			) : (
				<>
					<SiteHeaderLeadingControls
						showSidebarTrigger={showSidebarTrigger}
						showWorkspaceMenu={showWorkspaceMenu}
					/>
					<h1 className="truncate text-base font-medium text-balance [font-family:var(--app-font-heading)]">
						{title}
					</h1>
				</>
			)}
		</DashboardHeader>
	);
}
