import { Settings2Icon, StarIcon, UsersIcon } from "lucide-react";
import type { ReactElement } from "react";
import { appRoutes } from "@/app/routes";

export type ShellRouteId = "dashboard" | "team" | "settings";
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
	team: shellRoutes[1],
	settings: shellRoutes[2],
} as const;

export function getCurrentShellRoute(pathname: string): ShellRouteDefinition {
	return (
		shellRoutes.find(
			(route) =>
				pathname === route.path || pathname.startsWith(`${route.path}/`),
		) ?? shellRouteMap.dashboard
	);
}
