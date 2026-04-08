import type { LucideIcon } from "lucide-react";
import {
	AlertCircle,
	BookOpen,
	Clock,
	DollarSign,
	FolderKanban,
	LayoutDashboard,
	UserCircle,
} from "lucide-react";

export type ShellRouteId =
	| "overview"
	| "developers"
	| "projects"
	| "sessions"
	| "learnings"
	| "errors"
	| "roi";

export type ShellRouteDefinition = {
	id: ShellRouteId;
	label: string;
	path: string;
	icon: LucideIcon;
	exact?: boolean;
};

export const primaryShellRoutes: readonly ShellRouteDefinition[] = [
	{
		id: "overview",
		label: "Overview",
		path: "/dashboard",
		icon: LayoutDashboard,
		exact: true,
	},
	{
		id: "developers",
		label: "Developers",
		path: "/dashboard/developers",
		icon: UserCircle,
	},
	{
		id: "projects",
		label: "Projects",
		path: "/dashboard/projects",
		icon: FolderKanban,
	},
	{
		id: "sessions",
		label: "Sessions",
		path: "/dashboard/sessions",
		icon: Clock,
	},
	{
		id: "learnings",
		label: "Learnings",
		path: "/dashboard/learnings",
		icon: BookOpen,
	},
	{
		id: "errors",
		label: "Errors",
		path: "/dashboard/errors",
		icon: AlertCircle,
	},
	{
		id: "roi",
		label: "ROI Calculator",
		path: "/dashboard/roi",
		icon: DollarSign,
	},
] as const;

export function isShellRouteActive(
	pathname: string,
	route: ShellRouteDefinition,
): boolean {
	if (route.exact) {
		return pathname === route.path;
	}

	return pathname === route.path || pathname.startsWith(`${route.path}/`);
}

export function getCurrentShellRoute(pathname: string): ShellRouteDefinition {
	return (
		primaryShellRoutes.find((route) => isShellRouteActive(pathname, route)) ??
		primaryShellRoutes[0]
	);
}
