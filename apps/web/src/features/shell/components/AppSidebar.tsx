import {
	Building2,
	Check,
	ChevronsLeft,
	ChevronsRight,
	ChevronsUpDown,
	LogOut,
	Mail,
	Plus,
	Settings,
	Shield,
} from "lucide-react";
import { useTheme } from "next-themes";
import { type ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/app/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/app/ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/app/ui/tooltip";
import { ThemeToggle } from "@/components/analytics/ThemeToggle";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { useUserInvitations } from "@/hooks/useUserInvitations";
import { authClient, signOut } from "@/lib/auth-client";
import { getAnalyticsPageName } from "@/lib/product-analytics";
import { cn } from "@/lib/utils";
import {
	isShellRouteActive,
	primaryShellRoutes,
	type ShellRouteDefinition,
} from "../config/shell-routes";

const ADMIN_ORGANIZATION_ID = (
	import.meta.env.VITE_ADMIN_ORGANIZATION_ID ?? ""
).trim();

function getInitials(name: string) {
	return name
		.split(" ")
		.map((part) => part[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

function SidebarNavLink({
	badgeLabel,
	collapsed,
	isActive,
	label,
	onClick,
	to,
	icon,
}: {
	badgeLabel?: string;
	collapsed: boolean;
	isActive: boolean;
	label: string;
	onClick: () => void;
	to: string;
	icon: ReactNode;
}) {
	const link = (
		<Link
			to={to}
			onClick={onClick}
			className={cn(
				"relative flex items-center gap-2 rounded-lg px-2 py-2 text-[0.8125rem] font-medium transition-colors duration-150",
				collapsed ? "justify-center" : "",
				isActive
					? "bg-hover text-heading"
					: "text-muted hover:bg-hover hover:text-foreground",
			)}
		>
			<span className="relative shrink-0">
				{icon}
				{badgeLabel ? (
					<span className="absolute -right-1.5 -top-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[0.5625rem] font-bold leading-none text-white">
						{badgeLabel}
					</span>
				) : null}
			</span>
			{collapsed ? null : (
				<span className="overflow-hidden whitespace-nowrap">{label}</span>
			)}
		</Link>
	);

	if (!collapsed) {
		return link;
	}

	return (
		<Tooltip>
			<TooltipTrigger render={link} />
			<TooltipContent side="right">
				{badgeLabel ? `${label} (${badgeLabel})` : label}
			</TooltipContent>
		</Tooltip>
	);
}

function OrgSwitcher({ collapsed }: { collapsed: boolean }) {
	const { activeOrg, organizations, switchOrg } = useOrganization();
	const { trackNavigation, trackOrganizationAction } = useAnalyticsTracking();

	async function handleSelect(orgId: string) {
		if (orgId === activeOrg?.id) {
			return;
		}

		trackOrganizationAction({
			actionName: "switch_organization",
			targetType: "organization",
			sourceComponent: "org_switcher",
			targetId: orgId,
		});

		await switchOrg(orgId);
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<button
						type="button"
						className={cn(
							"flex h-10 w-full items-center gap-1.5 overflow-hidden px-4 transition-colors hover:bg-hover",
							collapsed ? "justify-center px-0" : "",
						)}
					>
						<Building2 className="h-4 w-4 shrink-0 text-accent" />
						{collapsed ? null : (
							<>
								<span className="flex-1 truncate text-left text-sm font-bold text-heading">
									{activeOrg?.name ?? "Select org"}
								</span>
								<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted" />
							</>
						)}
					</button>
				}
			/>
			<DropdownMenuContent
				side={collapsed ? "right" : "bottom"}
				align="start"
				className="w-56"
			>
				{organizations.map((organization) => (
					<DropdownMenuItem
						key={organization.id}
						onClick={() => void handleSelect(organization.id)}
					>
						<Building2 className="h-3.5 w-3.5 shrink-0 text-muted" />
						<span className="flex-1 truncate">{organization.name}</span>
						{organization.id === activeOrg?.id ? (
							<Check className="h-3.5 w-3.5 shrink-0 text-accent" />
						) : null}
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem
					render={
						<Link
							to="/dashboard/organization"
							onClick={() => {
								trackNavigation({
									navType: "organization_menu",
									sourceComponent: "org_switcher",
									targetPath: "/dashboard/organization",
									targetType: "page",
									toPageName: "organization",
								});
							}}
						/>
					}
				>
					<Settings className="h-3.5 w-3.5 shrink-0" />
					<span>Manage organization</span>
				</DropdownMenuItem>
				<DropdownMenuItem
					render={
						<Link
							to="/dashboard/organization/new"
							onClick={() => {
								trackNavigation({
									navType: "organization_menu",
									sourceComponent: "org_switcher",
									targetPath: "/dashboard/organization/new",
									targetType: "page",
									toPageName: "organization_create",
								});
							}}
						/>
					}
				>
					<Plus className="h-3.5 w-3.5 shrink-0" />
					<span>Create organization</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function buildRouteSourceComponent(route: ShellRouteDefinition) {
	return `sidebar_${route.id}`;
}

export function AppSidebar() {
	const { pathname } = useLocation();
	const { data: session } = authClient.useSession();
	const { count: invitationCount } = useUserInvitations();
	const { organizations } = useOrganization();
	const { resolvedTheme } = useTheme();
	const { trackAuthenticationAction, trackNavigation, trackUtility } =
		useAnalyticsTracking();
	const [collapsed, setCollapsed] = useState(false);

	const logoSrc =
		resolvedTheme === "dark" ? "/logo-light.svg" : "/logo-dark.svg";
	const isAdmin =
		ADMIN_ORGANIZATION_ID !== "" &&
		organizations.some(
			(organization) => organization.id === ADMIN_ORGANIZATION_ID,
		);
	const isInvitationRouteActive = pathname === "/dashboard/invitations";
	const isAdminRouteActive =
		pathname === "/dashboard/admin" || pathname.startsWith("/dashboard/admin/");

	function trackSidebarNavigation(sourceComponent: string, targetPath: string) {
		trackNavigation({
			navType: "sidebar",
			sourceComponent,
			targetPath,
			targetType: "page",
			toPageName: getAnalyticsPageName(targetPath) ?? undefined,
		});
	}

	function toggleCollapsed() {
		const nextCollapsed = !collapsed;

		trackUtility({
			utilityName: "sidebar_collapse",
			componentId: "app_sidebar",
			utilityState: nextCollapsed ? "collapsed" : "expanded",
		});

		setCollapsed(nextCollapsed);
	}

	return (
		<TooltipProvider>
			<aside
				className={cn(
					"relative z-20 flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 ease-in-out",
					collapsed ? "w-14" : "w-64",
				)}
			>
				<div className="flex items-center border-b border-border">
					<Link
						to="/dashboard"
						onClick={() => trackSidebarNavigation("sidebar_logo", "/dashboard")}
						className={cn(
							"flex h-10 shrink-0 items-center px-4",
							collapsed ? "px-3" : "",
						)}
					>
						<img src={logoSrc} alt="Rudel" className="h-5 w-5" />
					</Link>
					<div className="min-w-0 flex-1">
						<OrgSwitcher collapsed={collapsed} />
					</div>
					<button
						type="button"
						onClick={toggleCollapsed}
						className="mr-1 shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-hover hover:text-foreground"
						title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
					>
						{collapsed ? (
							<ChevronsRight className="h-4 w-4" />
						) : (
							<ChevronsLeft className="h-4 w-4" />
						)}
					</button>
				</div>

				<nav className="flex flex-1 flex-col gap-[1px] px-2 pb-1 pt-2">
					{primaryShellRoutes.map((route) => {
						const Icon = route.icon;

						return (
							<SidebarNavLink
								key={route.id}
								collapsed={collapsed}
								isActive={isShellRouteActive(pathname, route)}
								label={route.label}
								onClick={() =>
									trackSidebarNavigation(
										buildRouteSourceComponent(route),
										route.path,
									)
								}
								to={route.path}
								icon={<Icon className="h-4 w-4 shrink-0" />}
							/>
						);
					})}

					{invitationCount > 0 ? (
						<SidebarNavLink
							collapsed={collapsed}
							isActive={isInvitationRouteActive}
							label="Invitations"
							badgeLabel={`${invitationCount}`}
							onClick={() =>
								trackSidebarNavigation(
									"sidebar_invitations",
									"/dashboard/invitations",
								)
							}
							to="/dashboard/invitations"
							icon={<Mail className="h-4 w-4 shrink-0" />}
						/>
					) : null}

					{isAdmin ? <div className="mt-auto" /> : null}
					{isAdmin ? (
						<SidebarNavLink
							collapsed={collapsed}
							isActive={isAdminRouteActive}
							label="Admin"
							onClick={() =>
								trackSidebarNavigation("sidebar_admin", "/dashboard/admin")
							}
							to="/dashboard/admin"
							icon={<Shield className="h-4 w-4 shrink-0" />}
						/>
					) : null}
				</nav>

				{session?.user ? (
					<div className="border-t border-border p-2">
						{collapsed ? (
							<div className="mb-2 flex justify-center">
								<Tooltip>
									<TooltipTrigger
										render={
											<div className="flex h-7 w-7 items-center justify-center rounded-md bg-hover text-[0.5625rem] font-bold tracking-[0.14em] text-accent">
												A
											</div>
										}
									/>
									<TooltipContent side="right">
										OPEN ALPHA Testing v{__APP_VERSION__}
									</TooltipContent>
								</Tooltip>
							</div>
						) : (
							<div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-hover px-2 py-2">
								<div className="truncate text-[0.6875rem] font-bold tracking-[0.08em] text-accent">
									OPEN ALPHA Testing
								</div>
							</div>
						)}

						<div
							className={cn(
								"flex items-center gap-2",
								collapsed ? "justify-center" : "",
							)}
						>
							{collapsed ? (
								<Tooltip>
									<TooltipTrigger
										render={
											<Link
												to="/dashboard/profile"
												onClick={() =>
													trackSidebarNavigation(
														"sidebar_profile_avatar",
														"/dashboard/profile",
													)
												}
												className="flex min-w-0 items-center gap-2"
											>
												<Avatar size="sm" className="shrink-0">
													{session.user.image ? (
														<AvatarImage
															src={session.user.image}
															alt={session.user.name}
														/>
													) : null}
													<AvatarFallback>
														{getInitials(session.user.name)}
													</AvatarFallback>
												</Avatar>
											</Link>
										}
									/>
									<TooltipContent side="right">
										{session.user.name}
									</TooltipContent>
								</Tooltip>
							) : (
								<>
									<Link
										to="/dashboard/profile"
										onClick={() =>
											trackSidebarNavigation(
												"sidebar_profile",
												"/dashboard/profile",
											)
										}
										className="flex min-w-0 flex-1 items-center gap-2"
									>
										<Avatar size="sm" className="shrink-0">
											{session.user.image ? (
												<AvatarImage
													src={session.user.image}
													alt={session.user.name}
												/>
											) : null}
											<AvatarFallback>
												{getInitials(session.user.name)}
											</AvatarFallback>
										</Avatar>
										<span className="flex-1 truncate text-xs font-medium text-foreground transition-colors hover:text-heading">
											{session.user.name}
										</span>
									</Link>
									<ThemeToggle />
									<button
										type="button"
										onClick={() => {
											trackAuthenticationAction({
												actionName: "sign_out",
												sourceComponent: "sidebar_sign_out",
												authMethod: "session",
											});
											signOut();
										}}
										className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-hover hover:text-foreground"
										title="Sign out"
									>
										<LogOut className="h-3.5 w-3.5" />
									</button>
								</>
							)}
						</div>
					</div>
				) : null}
			</aside>
		</TooltipProvider>
	);
}
