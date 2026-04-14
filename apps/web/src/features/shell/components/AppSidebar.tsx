"use client";

import { ArrowLeftIcon, Building2Icon, UserIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import * as React from "react";
import { useLocation } from "react-router-dom";
import {
	SIDEBAR_SHELL_COLLAPSE_DURATION_MS,
	Sidebar,
	useSidebar,
} from "@/app/ui/sidebar";
import {
	getActiveSettingsRouteId,
	primarySettingsRoutes,
} from "@/features/settings/config/settings-routes";
import { SidebarNewsCard } from "@/features/shell/components/SidebarNewsCard";
import { SidebarNewsPopover } from "@/features/shell/components/SidebarNewsPopover";
import {
	RailLink,
	type SidebarRowMode,
} from "@/features/shell/components/shell-rail";
import { UserRailButton } from "@/features/shell/components/UserRailButton";
import { WorkspaceMenuButton } from "@/features/shell/components/WorkspaceMenuButton";
import {
	shellRouteMap,
	shellRoutes,
} from "@/features/shell/config/shell-routes";
import {
	SHOW_SIDEBAR_NEWS_MODE,
	SIDEBAR_NEWS_ITEM_ID,
} from "@/features/shell/config/sidebar-news";
import { useCurrentShellRoute } from "@/features/shell/hooks/useCurrentShellRoute";
import { useSidebarDisplayModeSync } from "@/features/shell/hooks/useSidebarDisplayMode";
import { cn } from "@/lib/utils";

type SidebarDisplayMode = SidebarRowMode;
type SidebarNavigationMode = "app" | "settings";

const SIDEBAR_NEWS_DISMISS_STORAGE_KEY = `sidebar-news-dismissed:${SIDEBAR_NEWS_ITEM_ID}`;

const SIDEBAR_NEWS_VISIBILITY_TRANSITION = {
	duration: 0.2,
	ease: [0.22, 1, 0.36, 1] as const,
};

function getSettingsSidebarIcon(routeId: string) {
	return routeId === "account" ? <UserIcon /> : <Building2Icon />;
}

function getSidebarSectionClassName(mode: SidebarDisplayMode) {
	return cn(
		"mt-[var(--sidebar-section-first-margin-top)] flex w-full flex-col",
		mode === "expanded"
			? "pl-[calc(var(--sidebar-rail-inset-left)+var(--sidebar-expanded-section-padding-x))] pr-[calc(var(--sidebar-rail-inset-right)+var(--sidebar-expanded-section-padding-x))]"
			: "pl-[calc(var(--sidebar-rail-inset-left)+var(--sidebar-collapsed-section-padding-x))] pr-[calc(var(--sidebar-rail-inset-right)+var(--sidebar-collapsed-section-padding-x))]",
	);
}

function getSidebarTopClusterClassName(mode: SidebarDisplayMode) {
	return mode === "expanded"
		? "flex w-full flex-col gap-[var(--sidebar-expanded-stack-gap)]"
		: "flex w-full flex-col gap-[var(--sidebar-collapsed-stack-gap)]";
}

function getSidebarNavigationClusterClassName(mode: SidebarDisplayMode) {
	return mode === "expanded"
		? "mt-[calc(var(--sidebar-expanded-stack-gap)+0.5rem)]"
		: "mt-[calc(var(--sidebar-collapsed-stack-gap)+0.5rem)]";
}

function getSidebarFooterClassName(mode: SidebarDisplayMode) {
	return cn(
		"mt-auto w-full",
		mode === "expanded"
			? "pl-[calc(var(--sidebar-rail-inset-left)+var(--sidebar-expanded-footer-padding-x))] pr-[calc(var(--sidebar-rail-inset-right)+var(--sidebar-expanded-footer-padding-x))] pb-[var(--sidebar-expanded-footer-padding-bottom)]"
			: "pl-[calc(var(--sidebar-rail-inset-left)+var(--sidebar-collapsed-footer-padding-x))] pr-[calc(var(--sidebar-rail-inset-right)+var(--sidebar-collapsed-footer-padding-x))]",
	);
}

function getSidebarFooterStackClassName(mode: SidebarDisplayMode) {
	return mode === "expanded"
		? "flex w-full flex-col gap-[var(--sidebar-expanded-stack-gap)]"
		: "flex w-full flex-col gap-[var(--sidebar-collapsed-stack-gap)]";
}

function getSidebarContentFrameClassName(mode: SidebarDisplayMode) {
	return cn(
		"relative flex h-full min-h-0 flex-col overscroll-none bg-transparent",
		mode === "expanded"
			? "w-(--sidebar-width) overflow-x-clip overflow-y-auto text-clip whitespace-nowrap"
			: "w-(--sidebar-width-icon) pb-1.5",
	);
}

function CollapsedSidebarExpandSurface({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			aria-label="Expand sidebar"
			onClick={onClick}
			className="hidden min-h-0 flex-1 cursor-e-resize bg-transparent md:block"
		/>
	);
}

function SidebarEdgeHotspot({
	isExpanded,
	onClick,
}: {
	isExpanded: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label="Toggle sidebar"
			tabIndex={-1}
			onClick={onClick}
			className={cn(
				"group/sidebar-edge absolute inset-y-0 z-20 hidden w-3 translate-x-1/2 bg-transparent md:block",
				"group-data-[side=left]:-right-px group-data-[side=right]:-left-px",
				isExpanded
					? "group-data-[side=left]:cursor-w-resize group-data-[side=right]:cursor-e-resize"
					: "group-data-[side=left]:cursor-e-resize group-data-[side=right]:cursor-w-resize",
			)}
		>
			<span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-200 ease-out group-hover/sidebar-edge:bg-[color:var(--sidebar-border)]">
				<span className="absolute inset-0 bg-transparent transition-colors duration-200 ease-out group-hover/sidebar-edge:bg-black/8 dark:group-hover/sidebar-edge:bg-white/12" />
			</span>
		</button>
	);
}

function SidebarNavigation({
	mode,
	navigationMode,
}: {
	mode: SidebarDisplayMode;
	navigationMode: SidebarNavigationMode;
}) {
	const currentShellRoute = useCurrentShellRoute();
	const location = useLocation();
	const activeSettingsRouteId = getActiveSettingsRouteId(location.pathname);

	if (navigationMode === "settings") {
		return (
			<nav aria-label="Settings">
				<ul className="flex flex-col gap-1">
					{primarySettingsRoutes.map((route) => (
						<RailLink
							key={route.id}
							to={route.path}
							label={route.label}
							mode={mode}
							active={activeSettingsRouteId === route.id}
						>
							{getSettingsSidebarIcon(route.id)}
						</RailLink>
					))}
				</ul>
			</nav>
		);
	}

	return (
		<nav aria-label="Primary">
			<ul className="flex flex-col gap-1">
				{shellRoutes.map((route) => (
					<RailLink
						key={route.id}
						to={route.path}
						label={route.navLabel}
						shortcut={route.shortcut}
						mode={mode}
						active={currentShellRoute.id === route.id}
					>
						{route.icon}
					</RailLink>
				))}
			</ul>
		</nav>
	);
}

export function AppSidebar({
	navigationMode = "app",
}: {
	navigationMode?: SidebarNavigationMode;
}) {
	const { state, isMobile, openMobile, toggleSidebar } = useSidebar();
	const isSidebarExpanded = isMobile ? openMobile : state === "expanded";
	const [displayMode, setDisplayMode] = React.useState<SidebarDisplayMode>(
		isSidebarExpanded ? "expanded" : "collapsed",
	);
	const [isNewsDismissed, setIsNewsDismissed] = React.useState(() => {
		if (typeof window === "undefined") {
			return false;
		}

		try {
			return (
				window.localStorage.getItem(SIDEBAR_NEWS_DISMISS_STORAGE_KEY) === "true"
			);
		} catch {
			return false;
		}
	});
	const showSidebarNewsFeatures =
		SHOW_SIDEBAR_NEWS_MODE && navigationMode === "app";

	const dismissNewsCard = React.useCallback(() => {
		setIsNewsDismissed(true);

		try {
			window.localStorage.setItem(SIDEBAR_NEWS_DISMISS_STORAGE_KEY, "true");
		} catch {}
	}, []);

	useSidebarDisplayModeSync({
		displayMode,
		isMobile,
		isSidebarExpanded,
		collapseDurationMs: SIDEBAR_SHELL_COLLAPSE_DURATION_MS,
		setDisplayMode,
	});

	const isExpandedMode = displayMode === "expanded";
	const showSidebarNewsCard =
		showSidebarNewsFeatures && isSidebarExpanded && !isNewsDismissed;

	return (
		<Sidebar collapsible="icon" className="dashboard-01-chrome-sidebar">
			<div className={getSidebarContentFrameClassName(displayMode)}>
				<div className={getSidebarSectionClassName(displayMode)}>
					<div className={getSidebarTopClusterClassName(displayMode)}>
						{navigationMode === "settings" ? (
							<nav aria-label="Back to app">
								<ul className="flex flex-col gap-1">
									<RailLink
										to={shellRouteMap.dashboard.path}
										label="Back to app"
										mode={displayMode}
									>
										<ArrowLeftIcon />
									</RailLink>
								</ul>
							</nav>
						) : isExpandedMode ? (
							<WorkspaceMenuButton />
						) : (
							<WorkspaceMenuButton mode="collapsed" />
						)}
						{showSidebarNewsFeatures && isExpandedMode ? (
							<SidebarNewsPopover />
						) : null}
					</div>
					<div className={getSidebarNavigationClusterClassName(displayMode)}>
						<SidebarNavigation
							mode={displayMode}
							navigationMode={navigationMode}
						/>
					</div>
				</div>
				{isExpandedMode ? null : (
					<CollapsedSidebarExpandSurface onClick={toggleSidebar} />
				)}
				<div className={getSidebarFooterClassName(displayMode)}>
					<div className={getSidebarFooterStackClassName(displayMode)}>
						<AnimatePresence initial={false}>
							{showSidebarNewsCard ? (
								<motion.div
									key="sidebar-news-card"
									initial={{ opacity: 0 }}
									animate={{ opacity: 1 }}
									exit={{ opacity: 0 }}
									transition={SIDEBAR_NEWS_VISIBILITY_TRANSITION}
								>
									<SidebarNewsCard onDismiss={dismissNewsCard} />
								</motion.div>
							) : null}
						</AnimatePresence>
						{isExpandedMode ? (
							<UserRailButton />
						) : (
							<UserRailButton mode="collapsed" />
						)}
					</div>
				</div>
				{navigationMode === "app" ? (
					<SidebarEdgeHotspot
						isExpanded={isExpandedMode}
						onClick={toggleSidebar}
					/>
				) : null}
			</div>
		</Sidebar>
	);
}
