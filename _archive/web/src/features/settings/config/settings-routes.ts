import { appRoutes } from "@/app/routes";

export type SettingsRouteId =
	| "workspace"
	| "members"
	| "invitations"
	| "account"
	| "create-workspace";

export type SettingsRouteDefinition = {
	id: SettingsRouteId;
	label: string;
	segment: string;
	path: string;
};

export const settingsRouteMap: Record<
	SettingsRouteId,
	SettingsRouteDefinition
> = {
	workspace: {
		id: "workspace",
		label: "Workspace",
		segment: "workspace",
		path: appRoutes.settingsWorkspace(),
	},
	members: {
		id: "members",
		label: "Members",
		segment: "members",
		path: appRoutes.settingsMembers(),
	},
	invitations: {
		id: "invitations",
		label: "Invitations",
		segment: "invitations",
		path: appRoutes.settingsInvitations(),
	},
	account: {
		id: "account",
		label: "Account",
		segment: "account",
		path: appRoutes.settingsAccount(),
	},
	"create-workspace": {
		id: "create-workspace",
		label: "Create workspace",
		segment: "create-workspace",
		path: appRoutes.settingsCreateWorkspace(),
	},
};

const settingsRoutes = Object.values(settingsRouteMap);

export type PrimarySettingsRouteId = "workspace" | "members" | "account";

export const primarySettingsRoutes = [
	settingsRouteMap.workspace,
	settingsRouteMap.members,
	settingsRouteMap.account,
] as const satisfies readonly SettingsRouteDefinition[];

export function getActiveSettingsRouteId(
	pathname: string,
): PrimarySettingsRouteId {
	const matchedRoute =
		settingsRoutes.find(
			(route) =>
				pathname === route.path || pathname.startsWith(`${route.path}/`),
		)?.id ?? "workspace";

	if (matchedRoute === "account" || matchedRoute === "invitations") {
		return "account";
	}

	if (matchedRoute === "members") {
		return "members";
	}

	return "workspace";
}

export function getSettingsPathFromLegacyTab(tab: string | null): string {
	if (tab === "account" || tab === "profile") {
		return settingsRouteMap.account.path;
	}

	if (tab === "members" || tab === "team") {
		return settingsRouteMap.members.path;
	}

	if (tab === "invitations") {
		return `${settingsRouteMap.account.path}#workspace-invitations`;
	}

	return settingsRouteMap.workspace.path;
}
