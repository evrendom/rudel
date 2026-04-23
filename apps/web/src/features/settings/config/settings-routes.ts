import { appRoutes } from "@/app/routes";

export type SettingsRouteId =
	| "workspace"
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
	invitations: {
		id: "invitations",
		label: "Invitations",
		segment: "invitations",
		path: appRoutes.settingsInvitations(),
	},
	account: {
		id: "account",
		label: "Profile",
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

export type PrimarySettingsRouteId = "workspace" | "account";

export const primarySettingsRoutes = [
	settingsRouteMap.workspace,
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

	return matchedRoute === "account" ? "account" : "workspace";
}

export function getSettingsPathFromLegacyTab(tab: string | null): string {
	if (tab === "account") {
		return settingsRouteMap.account.path;
	}

	return settingsRouteMap.workspace.path;
}
