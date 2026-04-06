"use client";

import * as React from "react";
import {
	SIDEBAR_SHELL_COLLAPSE_DURATION_MS,
	Sidebar,
	type SidebarShellMotionVariant,
	useSidebar,
} from "@/app/ui/sidebar";
import { SidebarNewsPopover } from "@/features/shell/components/SidebarNewsPopover";
import {
	RailLink,
	type SidebarRowDebugProps,
	type SidebarRowMode,
} from "@/features/shell/components/shell-rail";
import { UserRailButton } from "@/features/shell/components/UserRailButton";
import { WorkspaceMenuButton } from "@/features/shell/components/WorkspaceMenuButton";
import { shellRoutes } from "@/features/shell/config/shell-routes";
import { SHOW_SIDEBAR_NEWS_MODE } from "@/features/shell/config/sidebar-news";
import { useCurrentShellRoute } from "@/features/shell/hooks/useCurrentShellRoute";
import { cn } from "@/lib/utils";

type SidebarDisplayMode = SidebarRowMode;

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

function getSidebarContentFrameClassName(mode: SidebarDisplayMode) {
	return cn(
		"relative flex h-full min-h-0 flex-col bg-transparent",
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
	debugShowBorders,
	debugVariant,
	forceShowLabels,
}: {
	mode: SidebarDisplayMode;
} & SidebarRowDebugProps) {
	const currentShellRoute = useCurrentShellRoute();

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
						debugShowBorders={debugShowBorders}
						debugVariant={debugVariant}
						forceShowLabels={forceShowLabels}
					>
						{route.icon}
					</RailLink>
				))}
			</ul>
		</nav>
	);
}

export function AppSidebar({
	shellMotionShowBorders = true,
	shellMotionVariant = "baseline",
	shellMotionForceLabels = false,
}: {
	shellMotionShowBorders?: boolean;
	shellMotionVariant?: SidebarShellMotionVariant;
	shellMotionForceLabels?: boolean;
}) {
	const { state, isMobile, openMobile, toggleSidebar } = useSidebar();
	const isSidebarExpanded = isMobile ? openMobile : state === "expanded";
	const [displayMode, setDisplayMode] = React.useState<SidebarDisplayMode>(
		isSidebarExpanded ? "expanded" : "collapsed",
	);

	React.useEffect(() => {
		if (isMobile) {
			setDisplayMode("expanded");
			return;
		}

		if (isSidebarExpanded) {
			setDisplayMode("expanded");
			return;
		}

		if (displayMode === "collapsed") {
			return;
		}

		// Keep the expanded row variant mounted through the width collapse so
		// clipping, not an immediate mode swap, hides the labels.
		const timeoutId = window.setTimeout(() => {
			React.startTransition(() => {
				setDisplayMode("collapsed");
			});
		}, SIDEBAR_SHELL_COLLAPSE_DURATION_MS);

		return () => window.clearTimeout(timeoutId);
	}, [displayMode, isMobile, isSidebarExpanded]);

	const isExpandedMode = displayMode === "expanded";

	return (
		<Sidebar
			collapsible="icon"
			shellMotionShowBorders={shellMotionShowBorders}
			shellMotionVariant={shellMotionVariant}
			className="dashboard-01-chrome-sidebar"
		>
			<div className={getSidebarContentFrameClassName(displayMode)}>
				<div className={getSidebarSectionClassName(displayMode)}>
					<div className={getSidebarTopClusterClassName(displayMode)}>
						{isExpandedMode ? (
							<WorkspaceMenuButton
								debugShowBorders={shellMotionShowBorders}
								debugVariant={shellMotionVariant}
								forceShowLabels={shellMotionForceLabels}
							/>
						) : (
							<WorkspaceMenuButton
								mode="collapsed"
								debugShowBorders={shellMotionShowBorders}
								debugVariant={shellMotionVariant}
								forceShowLabels={shellMotionForceLabels}
							/>
						)}
						{SHOW_SIDEBAR_NEWS_MODE && isExpandedMode ? (
							<SidebarNewsPopover />
						) : null}
					</div>
					<div className={getSidebarNavigationClusterClassName(displayMode)}>
						<SidebarNavigation
							mode={displayMode}
							debugShowBorders={shellMotionShowBorders}
							debugVariant={shellMotionVariant}
							forceShowLabels={shellMotionForceLabels}
						/>
					</div>
				</div>
				{isExpandedMode ? null : (
					<CollapsedSidebarExpandSurface onClick={toggleSidebar} />
				)}
				<div className={getSidebarFooterClassName(displayMode)}>
					{isExpandedMode ? (
						<UserRailButton
							debugShowBorders={shellMotionShowBorders}
							debugVariant={shellMotionVariant}
							forceShowLabels={shellMotionForceLabels}
						/>
					) : (
						<UserRailButton
							mode="collapsed"
							debugShowBorders={shellMotionShowBorders}
							debugVariant={shellMotionVariant}
							forceShowLabels={shellMotionForceLabels}
						/>
					)}
				</div>
				<SidebarEdgeHotspot
					isExpanded={isExpandedMode}
					onClick={toggleSidebar}
				/>
			</div>
		</Sidebar>
	);
}
