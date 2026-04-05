"use client";

import { Link, useSearchParams } from "react-router-dom";
import {
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
} from "@/features/shell/components/shell-rail";
import { UserRailButton } from "@/features/shell/components/UserRailButton";
import { WorkspaceMenuButton } from "@/features/shell/components/WorkspaceMenuButton";
import { shellRoutes } from "@/features/shell/config/shell-routes";
import { SHOW_SIDEBAR_NEWS_MODE } from "@/features/shell/config/sidebar-news";
import { appendSidebarShellDebugParams } from "@/features/shell/config/sidebar-shell-debug";
import { useCurrentShellRoute } from "@/features/shell/hooks/useCurrentShellRoute";
import workspaceIcon from "@/features/team/assets/team-lineup-workspace-icon-v5.png";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

function collapsedLayerClassName(isVisible: boolean) {
	return cn(
		"absolute inset-y-0 left-0 flex w-(--sidebar-width-icon) min-h-0 flex-col bg-transparent pb-1.5",
		isVisible
			? "pointer-events-auto opacity-100"
			: "pointer-events-none opacity-0",
	);
}

function expandedLayerClassName(isVisible: boolean) {
	return cn(
		"absolute inset-y-0 left-0 flex w-(--sidebar-width) min-h-0 flex-col overflow-x-clip overflow-y-auto text-clip whitespace-nowrap bg-transparent",
		isVisible
			? "pointer-events-auto opacity-100"
			: "pointer-events-none opacity-0",
	);
}

function TinyRailButton({
	ariaLabel,
	label,
	children,
	onClick,
	debugShowBorders,
	debugVariant,
	forceShowLabels,
	rowDataAttribute,
	iconDataAttribute,
}: {
	ariaLabel: string;
	label: string;
	children: React.ReactNode;
	onClick: () => void;
	debugShowBorders: boolean;
	debugVariant: SidebarShellMotionVariant;
	forceShowLabels?: boolean;
	rowDataAttribute: string;
	iconDataAttribute: string;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={ariaLabel}
			onClick={onClick}
			className={cn(
				getUtilityRailItemClassName(false, forceShowLabels),
				"!w-auto self-start",
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
					getUtilityRailLabelClassName(false, forceShowLabels),
					getSidebarLabelLaneDebugClassName(debugShowBorders, debugVariant),
				)}
			>
				{label}
			</span>
		</button>
	);
}

function TinyRailLink({
	to,
	label,
	active,
	children,
	debugShowBorders,
	debugVariant,
	forceShowLabels,
}: {
	to: string;
	label: string;
	active?: boolean;
	children: React.ReactNode;
} & SidebarRowDebugProps) {
	const [searchParams] = useSearchParams();
	const resolvedTo = appendSidebarShellDebugParams(to, searchParams);

	return (
		<Link
			to={resolvedTo}
			title={label}
			aria-label={label}
			data-sidebar-interactive
			data-sidebar-nav-row
			className={cn(
				getUtilityRailItemClassName(false, forceShowLabels),
				"!w-auto self-start",
				active && "bg-white text-[color:var(--dashboard-01-rail-icon-active)]",
				getSidebarRowDebugClassName({
					debugShowBorders,
					debugVariant,
				}),
			)}
		>
			<span
				aria-hidden="true"
				data-sidebar-nav-icon-lane
				className={cn(
					"flex h-[var(--sidebar-icon-lane-size)] w-[var(--sidebar-icon-lane-size)] shrink-0 items-center justify-center [&_svg]:h-[var(--sidebar-icon-size)] [&_svg]:w-[var(--sidebar-icon-size)] [&_svg]:shrink-0",
					getSidebarIconLaneDebugClassName(debugShowBorders, debugVariant),
				)}
			>
				{children}
			</span>
			<span
				aria-hidden="true"
				data-sidebar-nav-label
				className={cn(
					getUtilityRailLabelClassName(false, forceShowLabels),
					getSidebarLabelLaneDebugClassName(debugShowBorders, debugVariant),
				)}
			>
				{label}
			</span>
		</Link>
	);
}

function TinyRailNav({
	debugShowBorders,
	debugVariant,
	forceShowLabels,
}: SidebarRowDebugProps) {
	const currentShellRoute = useCurrentShellRoute();

	return (
		<nav aria-label="Primary">
			<ul className="flex flex-col gap-1">
				{shellRoutes.map((route) => (
					<li key={route.id}>
						<TinyRailLink
							to={route.path}
							label={route.navLabel}
							active={currentShellRoute.id === route.id}
							debugShowBorders={debugShowBorders}
							debugVariant={debugVariant}
							forceShowLabels={forceShowLabels}
						>
							{route.icon}
						</TinyRailLink>
					</li>
				))}
			</ul>
		</nav>
	);
}

function ExpandedPanelNav({
	debugShowBorders,
	debugVariant,
	forceShowLabels,
}: SidebarRowDebugProps) {
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
						active={currentShellRoute.id === route.id}
						debugShowBorders={debugShowBorders}
						debugVariant={debugVariant}
						forceExpandedSidebar
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
	const { state, toggleSidebar } = useSidebar();
	const { data: session } = authClient.useSession();
	const isExpandedSidebar = state === "expanded";
	const userName =
		session?.user &&
		"name" in session.user &&
		typeof session.user.name === "string"
			? session.user.name
			: undefined;
	const userEmail =
		session?.user &&
		"email" in session.user &&
		typeof session.user.email === "string"
			? session.user.email
			: undefined;
	const userImage =
		session?.user &&
		"image" in session.user &&
		typeof session.user.image === "string"
			? session.user.image
			: undefined;

	return (
		<Sidebar
			collapsible="icon"
			shellMotionShowBorders={shellMotionShowBorders}
			shellMotionVariant={shellMotionVariant}
			className="dashboard-01-chrome-sidebar"
		>
			<div className="relative flex size-full min-h-0">
				<div
					aria-hidden={isExpandedSidebar}
					data-sidebar-layer="collapsed"
					data-sidebar-layer-active={isExpandedSidebar ? "false" : "true"}
					inert={isExpandedSidebar}
					className={collapsedLayerClassName(!isExpandedSidebar)}
				>
					<div className="flex h-full w-(--sidebar-width-icon) min-w-(--sidebar-width-icon) flex-col items-start bg-transparent">
						<div className="mt-[var(--sidebar-section-first-margin-top)] flex w-full flex-col gap-[var(--sidebar-collapsed-stack-gap)] pl-[calc(var(--sidebar-rail-inset-left)+var(--sidebar-collapsed-section-padding-x))] pr-[calc(var(--sidebar-rail-inset-right)+var(--sidebar-collapsed-section-padding-x))]">
							<TinyRailButton
								ariaLabel="Open workspace menu"
								label="Workspace"
								onClick={toggleSidebar}
								debugShowBorders={shellMotionShowBorders}
								debugVariant={shellMotionVariant}
								forceShowLabels={shellMotionForceLabels}
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
							</TinyRailButton>
							<TinyRailNav
								debugShowBorders={shellMotionShowBorders}
								debugVariant={shellMotionVariant}
								forceShowLabels={shellMotionForceLabels}
							/>
						</div>
						<div className="mt-auto w-full pl-[calc(var(--sidebar-rail-inset-left)+var(--sidebar-collapsed-footer-padding-x))] pr-[calc(var(--sidebar-rail-inset-right)+var(--sidebar-collapsed-footer-padding-x))]">
							<TinyRailButton
								ariaLabel="Open account menu"
								label="Account"
								onClick={toggleSidebar}
								debugShowBorders={shellMotionShowBorders}
								debugVariant={shellMotionVariant}
								forceShowLabels={shellMotionForceLabels}
								rowDataAttribute="data-sidebar-user-row"
								iconDataAttribute="data-sidebar-user-icon-lane"
							>
								<div className="relative flex h-[var(--sidebar-avatar-size)] min-h-[var(--sidebar-avatar-size)] w-[var(--sidebar-avatar-size)] min-w-[var(--sidebar-avatar-size)] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[color:var(--dashboard-01-avatar-background)] text-[color:var(--dashboard-01-avatar-foreground)]">
									{userImage ? (
										<img
											src={userImage}
											alt=""
											aria-hidden="true"
											className="size-6 rounded-full object-cover"
										/>
									) : (
										<span className="text-[10px] font-semibold uppercase">
											{getInitials(userName, userEmail)}
										</span>
									)}
								</div>
							</TinyRailButton>
						</div>
					</div>
				</div>
				<div
					aria-hidden={!isExpandedSidebar}
					data-sidebar-layer="expanded"
					data-sidebar-layer-active={isExpandedSidebar ? "true" : "false"}
					inert={!isExpandedSidebar}
					className={expandedLayerClassName(isExpandedSidebar)}
				>
					<div className="flex min-h-full flex-col bg-transparent">
						<div className="mt-[var(--sidebar-section-first-margin-top)] flex w-full flex-col gap-[var(--sidebar-expanded-stack-gap)] pl-[calc(var(--sidebar-rail-inset-left)+var(--sidebar-expanded-section-padding-x))] pr-[calc(var(--sidebar-rail-inset-right)+var(--sidebar-expanded-section-padding-x))]">
							<WorkspaceMenuButton
								debugShowBorders={shellMotionShowBorders}
								debugVariant={shellMotionVariant}
								forceExpandedSidebar
								forceShowLabels={shellMotionForceLabels}
							/>
							{SHOW_SIDEBAR_NEWS_MODE ? <SidebarNewsPopover /> : null}
							<ExpandedPanelNav
								debugShowBorders={shellMotionShowBorders}
								debugVariant={shellMotionVariant}
								forceShowLabels={shellMotionForceLabels}
							/>
						</div>
						<div className="mt-auto w-full pl-[calc(var(--sidebar-rail-inset-left)+var(--sidebar-expanded-footer-padding-x))] pr-[calc(var(--sidebar-rail-inset-right)+var(--sidebar-expanded-footer-padding-x))] pb-[var(--sidebar-expanded-footer-padding-bottom)]">
							<UserRailButton
								debugShowBorders={shellMotionShowBorders}
								debugVariant={shellMotionVariant}
								forceExpandedSidebar
								forceShowLabels={shellMotionForceLabels}
							/>
						</div>
					</div>
				</div>
			</div>
		</Sidebar>
	);
}
