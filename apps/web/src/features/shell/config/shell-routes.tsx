import {
	BookOpenIcon,
	Clock3Icon,
	Settings2Icon,
	StarIcon,
	UsersIcon,
} from "lucide-react";
import type { ReactElement } from "react";
import { appRoutes, getCanonicalAppPath } from "@/app/routes";

export type ShellRouteId =
	| "dashboard"
	| "sessions"
	| "skills"
	| "team"
	| "settings";
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
		path: appRoutes.session(),
		title: "Sessions",
		navLabel: "Sessions",
		shortcut: "H",
		icon: <Clock3Icon />,
	},
	{
		id: "skills",
		path: appRoutes.skills(),
		title: "Skills",
		navLabel: "Skills",
		shortcut: "K",
		icon: <BookOpenIcon />,
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
	skills: shellRoutes[2],
	team: shellRoutes[3],
	settings: shellRoutes[4],
} as const;

export function getCurrentShellRoute(pathname: string): ShellRouteDefinition {
	const canonicalPathname = getCanonicalAppPath(pathname);

	if (
		canonicalPathname === appRoutes.session() ||
		canonicalPathname.startsWith(`${appRoutes.session()}/`)
	) {
		return shellRouteMap.sessions;
	}

	return (
		[...shellRoutes]
			.sort(
				(leftRoute, rightRoute) =>
					rightRoute.path.length - leftRoute.path.length,
			)
			.find(
				(route) =>
					canonicalPathname === route.path ||
					canonicalPathname.startsWith(`${route.path}/`),
			) ?? shellRouteMap.dashboard
	);
}
