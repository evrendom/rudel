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
	getInitials,
	getSidebarIconLaneDebugClassName,
	getSidebarLabelLaneDebugClassName,
	getSidebarRowDebugClassName,
	getUtilityRailItemClassName,
	getUtilityRailLabelClassName,
	RailLink,
	type SidebarRowDebugProps,
	type SidebarRowMode,
} from "@/features/shell/components/shell-rail";
import { UserRailButton } from "@/features/shell/components/UserRailButton";
import { WorkspaceMenuButton } from "@/features/shell/components/WorkspaceMenuButton";
import { shellRoutes } from "@/features/shell/config/shell-routes";
import { SHOW_SIDEBAR_NEWS_MODE } from "@/features/shell/config/sidebar-news";
import { useCurrentShellRoute } from "@/features/shell/hooks/useCurrentShellRoute";
import workspaceIcon from "@/features/team/assets/team-lineup-workspace-icon-v5.png";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type SidebarDisplayMode = SidebarRowMode;

function getSidebarSectionClassName(mode: SidebarDisplayMode) {
	return cn(
		"mt-[var(--sidebar-section-first-margin-top)] flex w-full flex-col",
		mode === "expanded"
			? "gap-[var(--sidebar-expanded-stack-gap)] pl-[calc(var(--sidebar-rail-inset-left)+var(--sidebar-expanded-section-padding-x))] pr-[calc(var(--sidebar-rail-inset-right)+var(--sidebar-expanded-section-padding-x))]"
			: "gap-[var(--sidebar-collapsed-stack-gap)] pl-[calc(var(--sidebar-rail-inset-left)+var(--sidebar-collapsed-section-padding-x))] pr-[calc(var(--sidebar-rail-inset-right)+var(--sidebar-collapsed-section-padding-x))]",
	);
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
		"flex h-full min-h-0 flex-col bg-transparent",
		mode === "expanded"
			? "w-(--sidebar-width) overflow-x-clip overflow-y-auto text-clip whitespace-nowrap"
			: "w-(--sidebar-width-icon) pb-1.5",
	);
}

function SidebarActionButton({
	ariaLabel,
	label,
	children,
	onClick,
	debugShowBorders = true,
	debugVariant = "baseline",
	forceShowLabels,
	rowDataAttribute,
	iconDataAttribute,
}: {
	ariaLabel: string;
	label: string;
	children: React.ReactNode;
	onClick: () => void;
	forceShowLabels?: boolean;
	rowDataAttribute: string;
	iconDataAttribute: string;
} & Pick<SidebarRowDebugProps, "debugShowBorders" | "debugVariant">) {
	return (
		<button
			type="button"
			title={label}
			aria-label={ariaLabel}
			onClick={onClick}
			className={cn(
				getUtilityRailItemClassName("collapsed", forceShowLabels),
				getSidebarRowDebugClassName({
					debugShowBorders,
					debugVariant,
				}),
			)}
			{...{ [rowDataAttribute]: true }}
		>
			<span
				className={cn(
					"flex h-[var(--sidebar-icon-lane-size)] w-[var(--sidebar-icon-lane-size)] shrink-0 items-center justify-center [&_svg]:h-[var(--sidebar-icon-size)] [&_svg]:w-[var(--sidebar-icon-size)] [&_svg]:shrink-0",
					getSidebarIconLaneDebugClassName(debugShowBorders, debugVariant),
				)}
				{...{ [iconDataAttribute]: true }}
			>
				{children}
			</span>
			<span
				aria-hidden="true"
				className={cn(
					getUtilityRailLabelClassName("collapsed", forceShowLabels),
					getSidebarLabelLaneDebugClassName(debugShowBorders, debugVariant),
				)}
			>
				{label}
			</span>
		</button>
	);
}

function CollapsedWorkspaceButton({
	debugShowBorders,
	debugVariant,
	forceShowLabels,
	onClick,
}: {
	onClick: () => void;
} & SidebarRowDebugProps) {
	const { state } = useOrganization();
	const workspaceName = state.activeOrg?.name ?? "Workspace";

	return (
		<SidebarActionButton
			ariaLabel="Open workspace menu"
			label={workspaceName}
			onClick={onClick}
			debugShowBorders={debugShowBorders}
			debugVariant={debugVariant}
			forceShowLabels={forceShowLabels}
			rowDataAttribute="data-sidebar-workspace-row"
			iconDataAttribute="data-sidebar-workspace-icon-lane"
		>
			<div className="relative flex h-[var(--sidebar-avatar-size)] min-h-[var(--sidebar-avatar-size)] w-[var(--sidebar-avatar-size)] min-w-[var(--sidebar-avatar-size)] shrink-0 items-center justify-center overflow-hidden rounded-full bg-black">
				<img
					src={workspaceIcon}
					alt=""
					aria-hidden="true"
					className="block size-full object-cover"
				/>
			</div>
		</SidebarActionButton>
	);
}

function CollapsedUserButton({
	debugShowBorders,
	debugVariant,
	forceShowLabels,
	onClick,
}: {
	onClick: () => void;
} & SidebarRowDebugProps) {
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

	return (
		<SidebarActionButton
			ariaLabel="Open account menu"
			label={name ?? email ?? "Account"}
			onClick={onClick}
			debugShowBorders={debugShowBorders}
			debugVariant={debugVariant}
			forceShowLabels={forceShowLabels}
			rowDataAttribute="data-sidebar-user-row"
			iconDataAttribute="data-sidebar-user-icon-lane"
		>
			<div className="relative flex h-[var(--sidebar-avatar-size)] min-h-[var(--sidebar-avatar-size)] w-[var(--sidebar-avatar-size)] min-w-[var(--sidebar-avatar-size)] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--dashboard-01-avatar-background)] text-[color:var(--dashboard-01-avatar-foreground)]">
				{image ? (
					<img
						src={image}
						alt=""
						aria-hidden="true"
						className="size-6 rounded-full object-cover"
					/>
				) : (
					<span className="text-[10px] font-semibold uppercase">
						{getInitials(name, email)}
					</span>
				)}
			</div>
		</SidebarActionButton>
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
					{isExpandedMode ? (
						<WorkspaceMenuButton
							debugShowBorders={shellMotionShowBorders}
							debugVariant={shellMotionVariant}
							forceShowLabels={shellMotionForceLabels}
						/>
					) : (
						<CollapsedWorkspaceButton
							onClick={toggleSidebar}
							debugShowBorders={shellMotionShowBorders}
							debugVariant={shellMotionVariant}
							forceShowLabels={shellMotionForceLabels}
						/>
					)}
					{SHOW_SIDEBAR_NEWS_MODE && isExpandedMode ? (
						<SidebarNewsPopover />
					) : null}
					<SidebarNavigation
						mode={displayMode}
						debugShowBorders={shellMotionShowBorders}
						debugVariant={shellMotionVariant}
						forceShowLabels={shellMotionForceLabels}
					/>
				</div>
				<div className={getSidebarFooterClassName(displayMode)}>
					{isExpandedMode ? (
						<UserRailButton
							debugShowBorders={shellMotionShowBorders}
							debugVariant={shellMotionVariant}
							forceShowLabels={shellMotionForceLabels}
						/>
					) : (
						<CollapsedUserButton
							onClick={toggleSidebar}
							debugShowBorders={shellMotionShowBorders}
							debugVariant={shellMotionVariant}
							forceShowLabels={shellMotionForceLabels}
						/>
					)}
				</div>
			</div>
		</Sidebar>
	);
}
