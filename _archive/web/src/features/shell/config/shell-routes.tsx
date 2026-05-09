import { Clock3Icon, Settings2Icon, StarIcon, UsersIcon } from "lucide-react";
import type { ReactElement } from "react";
import { appRoutes } from "@/app/routes";

export type ShellRouteId = "dashboard" | "sessions" | "team" | "settings";
export type ShellRouteIcon = ReactElement<{ size?: number }>;

export type ShellRouteDefinition = {
	id: ShellRouteId;
	path: string;
	title: string;
	navLabel: string;
	shortcut: string;
	icon: ShellRouteIcon;
};

export const shellRoutes = [
	{
		id: "dashboard",
		path: appRoutes.dashboard(),
		title: "Dashboard",
		navLabel: "Dashboard",
		shortcut: "D",
		icon: <StarIcon />,
	},
	{
		id: "sessions",
		path: appRoutes.dashboardSessions(),
		title: "Sessions",
		navLabel: "Sessions",
		shortcut: "H",
		icon: <Clock3Icon />,
	},
	{
		id: "team",
		path: appRoutes.team(),
		title: "Team",
		navLabel: "Team",
		shortcut: "T",
		icon: <UsersIcon />,
	},
	{
		id: "settings",
		path: appRoutes.settings(),
		title: "Settings",
		navLabel: "Settings",
		shortcut: "S",
		icon: <Settings2Icon />,
	},
] satisfies readonly ShellRouteDefinition[];

export const shellRouteMap = {
	dashboard: shellRoutes[0],
	sessions: shellRoutes[1],
	team: shellRoutes[2],
	settings: shellRoutes[3],
} as const;

export function getCurrentShellRoute(pathname: string): ShellRouteDefinition {
	return (
		[...shellRoutes]
			.sort(
				(leftRoute, rightRoute) =>
					rightRoute.path.length - leftRoute.path.length,
			)
			.find(
				(route) =>
					pathname === route.path || pathname.startsWith(`${route.path}/`),
			) ?? shellRouteMap.dashboard
	);
}
