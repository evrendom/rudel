import {
	AlertCircle,
	BookOpen,
	Building2,
	Check,
	ChevronsLeft,
	ChevronsRight,
	ChevronsUpDown,
	Clock,
	DollarSign,
	FolderKanban,
	LayoutDashboard,
	LogOut,
	Mail,
	Plus,
	Settings,
	Shield,
	UserCircle,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { useOrganization } from "../../contexts/OrganizationContext";
import { useUserInvitations } from "../../hooks/useUserInvitations";
import { authClient, signOut } from "../../lib/auth-client";
import { getAnalyticsPageName } from "../../lib/product-analytics";
import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "../ui/tooltip";
import { ThemeToggle } from "./ThemeToggle";

const navigation = [
	{ name: "Overview", href: "/dashboard", icon: LayoutDashboard },
	{ name: "Developers", href: "/dashboard/developers", icon: UserCircle },
	{ name: "Projects", href: "/dashboard/projects", icon: FolderKanban },
	{ name: "Sessions", href: "/dashboard/sessions", icon: Clock },
	{ name: "Learnings", href: "/dashboard/learnings", icon: BookOpen },
	{ name: "Errors", href: "/dashboard/errors", icon: AlertCircle },
	{
		name: "ROI Calculator",
		href: "/dashboard/roi",
		icon: DollarSign,
	},
];

function getInitials(name: string) {
	return name
		.split(" ")
		.map((part) => part[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

function OrgSwitcher({ collapsed }: { collapsed: boolean }) {
	const { activeOrg, organizations, switchOrg } = useOrganization();
	const { trackNavigation, trackOrganizationAction } = useAnalyticsTracking();

	const handleSelect = async (orgId: string) => {
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
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex w-full items-center gap-1.5 px-4 h-10 overflow-hidden hover:bg-hover transition-colors",
						collapsed && "justify-center px-0",
					)}
				>
					<Building2 className="h-4 w-4 shrink-0 text-accent" />
					{!collapsed && (
						<>
							<span className="flex-1 truncate text-left text-sm font-bold text-heading">
								{activeOrg?.name ?? "Select org"}
							</span>
							<ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted" />
						</>
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				side={collapsed ? "right" : "bottom"}
				align="start"
				className="w-56"
			>
				{organizations.map((org) => (
					<DropdownMenuItem key={org.id} onClick={() => handleSelect(org.id)}>
						<Building2 className="h-3.5 w-3.5 shrink-0 text-muted" />
						<span className="flex-1 truncate">{org.name}</span>
						{org.id === activeOrg?.id && (
							<Check className="h-3.5 w-3.5 shrink-0 text-accent" />
						)}
					</DropdownMenuItem>
				))}
				<DropdownMenuSeparator />
				<DropdownMenuItem asChild>
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
					>
						<Settings className="h-3.5 w-3.5 shrink-0" />
						<span>Manage organization</span>
					</Link>
				</DropdownMenuItem>
				<DropdownMenuItem asChild>
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
					>
						<Plus className="h-3.5 w-3.5 shrink-0" />
						<span>Create organization</span>
					</Link>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

const ADMIN_ORGANIZATION_ID = (
	import.meta.env.VITE_ADMIN_ORGANIZATION_ID ?? ""
).trim();

export function Sidebar() {
	const { pathname } = useLocation();
	const { data: session } = authClient.useSession();
	const [collapsed, setCollapsed] = useState(false);
	const { resolvedTheme } = useTheme();
	const { count: invitationCount } = useUserInvitations();
	const { organizations } = useOrganization();
	const { trackAuthenticationAction, trackNavigation, trackUtility } =
		useAnalyticsTracking();

	const isAdmin =
		ADMIN_ORGANIZATION_ID !== "" &&
		organizations.some((org) => org.id === ADMIN_ORGANIZATION_ID);

	const logoSrc =
		resolvedTheme === "dark" ? "/logo-light.svg" : "/logo-dark.svg";

	const trackSidebarNavigation = (
		sourceComponent: string,
		targetPath: string,
	) => {
		trackNavigation({
			navType: "sidebar",
			sourceComponent,
			targetPath,
			targetType: "page",
			toPageName: getAnalyticsPageName(targetPath) ?? undefined,
		});
	};

	return (
		<TooltipProvider>
			<div
				className={cn(
					"relative flex h-full shrink-0 flex-col bg-surface border-r border-border z-20 transition-[width] duration-200 ease-in-out",
					collapsed ? "w-14" : "w-64",
				)}
			>
				<div className="flex items-center border-b border-border">
					<Link
						to="/dashboard"
						onClick={() => trackSidebarNavigation("sidebar_logo", "/dashboard")}
						className={cn(
							"flex items-center shrink-0 px-4 h-10",
							collapsed && "px-3",
						)}
					>
						<img src={logoSrc} alt="Rudel" className="h-5 w-5" />
					</Link>
					<div className="flex-1 min-w-0">
						<OrgSwitcher collapsed={collapsed} />
					</div>
					<button
						type="button"
						onClick={() => {
							trackUtility({
								utilityName: "sidebar_collapse",
								componentId: "sidebar",
								utilityState: collapsed ? "expanded" : "collapsed",
							});
							setCollapsed(!collapsed);
						}}
						className="p-1 mr-1 rounded-md text-muted hover:text-foreground hover:bg-hover transition-colors shrink-0"
						title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
					>
						{collapsed ? (
							<ChevronsRight className="h-4 w-4" />
						) : (
							<ChevronsLeft className="h-4 w-4" />
						)}
					</button>
				</div>

				<nav className="flex-1 px-2 pt-2 pb-1 flex flex-col gap-[1px]">
					{navigation.map((item) => {
						const isActive = pathname === item.href;
						const Icon = item.icon;

						const link = (
							<Link
								to={item.href}
								onClick={() =>
									trackSidebarNavigation(
										`sidebar_${item.name
											.toLowerCase()
											.replace(/[^a-z0-9]+/g, "_")}`,
										item.href,
									)
								}
								className={cn(
									"flex items-center gap-2 rounded-lg px-2 py-2 text-[0.8125rem] font-medium transition-colors duration-150",
									collapsed && "justify-center",
									isActive
										? "bg-hover text-heading"
										: "text-muted hover:bg-hover hover:text-foreground",
								)}
							>
								<Icon className="h-4 w-4 shrink-0" />
								{!collapsed && (
									<span className="whitespace-nowrap overflow-hidden">
										{item.name}
									</span>
								)}
							</Link>
						);

						return (
							<div key={item.name}>
								{collapsed ? (
									<Tooltip>
										<TooltipTrigger asChild>{link}</TooltipTrigger>
										<TooltipContent side="right">{item.name}</TooltipContent>
									</Tooltip>
								) : (
									link
								)}
							</div>
						);
					})}
					{invitationCount > 0 &&
						(() => {
							const isActive = pathname === "/dashboard/invitations";
							const link = (
								<Link
									to="/dashboard/invitations"
									onClick={() =>
										trackSidebarNavigation(
											"sidebar_invitations",
											"/dashboard/invitations",
										)
									}
									className={cn(
										"relative flex items-center gap-2 rounded-lg px-2 py-2 text-[0.8125rem] font-medium transition-colors duration-150",
										collapsed && "justify-center",
										isActive
											? "bg-hover text-heading"
											: "text-muted hover:bg-hover hover:text-foreground",
									)}
								>
									<span className="relative">
										<Mail className="h-4 w-4 shrink-0" />
										<span className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[0.5625rem] font-bold leading-none text-white">
											{invitationCount}
										</span>
									</span>
									{!collapsed && (
										<span className="whitespace-nowrap overflow-hidden">
											Invitations
										</span>
									)}
								</Link>
							);

							return (
								<div>
									{collapsed ? (
										<Tooltip>
											<TooltipTrigger asChild>{link}</TooltipTrigger>
											<TooltipContent side="right">
												Invitations ({invitationCount})
											</TooltipContent>
										</Tooltip>
									) : (
										link
									)}
								</div>
							);
						})()}
					{isAdmin && <div className="mt-auto" />}
					{isAdmin &&
						(() => {
							const isActive = pathname === "/dashboard/admin";
							const link = (
								<Link
									to="/dashboard/admin"
									onClick={() =>
										trackSidebarNavigation("sidebar_admin", "/dashboard/admin")
									}
									className={cn(
										"flex items-center gap-2 rounded-lg px-2 py-2 text-[0.8125rem] font-medium transition-colors duration-150",
										collapsed && "justify-center",
										isActive
											? "bg-hover text-heading"
											: "text-muted hover:bg-hover hover:text-foreground",
									)}
								>
									<Shield className="h-4 w-4 shrink-0" />
									{!collapsed && (
										<span className="whitespace-nowrap overflow-hidden">
											Admin
										</span>
									)}
								</Link>
							);

							return (
								<div>
									{collapsed ? (
										<Tooltip>
											<TooltipTrigger asChild>{link}</TooltipTrigger>
											<TooltipContent side="right">Admin</TooltipContent>
										</Tooltip>
									) : (
										link
									)}
								</div>
							);
						})()}
				</nav>

				{session?.user && (
					<div className="border-t border-border p-2">
						{collapsed ? (
							<div className="mb-2 flex justify-center">
								<Tooltip>
									<TooltipTrigger asChild>
										<div className="flex h-7 w-7 items-center justify-center rounded-md bg-hover text-[0.5625rem] font-bold tracking-[0.14em] text-accent">
											A
										</div>
									</TooltipTrigger>
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
								{/**<div className="shrink-0 text-[0.6875rem] text-muted">
									v{__APP_VERSION__}
								</div>*/}
							</div>
						)}
						<div
							className={cn(
								"flex items-center gap-2",
								collapsed ? "justify-center" : "px-0",
							)}
						>
							{collapsed ? (
								<Tooltip>
									<TooltipTrigger asChild>
										<Link
											to="/dashboard/profile"
											onClick={() =>
												trackSidebarNavigation(
													"sidebar_profile_avatar",
													"/dashboard/profile",
												)
											}
											className="flex items-center gap-2 min-w-0"
										>
											<Avatar size="sm" className="shrink-0">
												{session.user.image && (
													<AvatarImage
														src={session.user.image}
														alt={session.user.name}
													/>
												)}
												<AvatarFallback>
													{getInitials(session.user.name)}
												</AvatarFallback>
											</Avatar>
										</Link>
									</TooltipTrigger>
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
										className="flex-1 flex items-center gap-2 min-w-0"
									>
										<Avatar size="sm" className="shrink-0">
											{session.user.image && (
												<AvatarImage
													src={session.user.image}
													alt={session.user.name}
												/>
											)}
											<AvatarFallback>
												{getInitials(session.user.name)}
											</AvatarFallback>
										</Avatar>
										<span className="flex-1 truncate text-xs font-medium text-foreground hover:text-heading transition-colors">
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
										className="p-1 rounded-md text-muted hover:text-foreground hover:bg-hover transition-colors shrink-0"
										title="Sign out"
									>
										<LogOut className="h-3.5 w-3.5" />
									</button>
								</>
							)}
						</div>
					</div>
				)}
			</div>
		</TooltipProvider>
	);
}
