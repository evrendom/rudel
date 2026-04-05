import { appRoutes } from "@/app/routes"

export type SettingsRouteId =
	| "workspace"
	| "invitations"
	| "account"
	| "create-workspace"

export type SettingsRouteDefinition = {
	id: SettingsRouteId
	label: string
	segment: string
	path: string
}

export const settingsRoutes = [
	{
		id: "workspace",
		label: "Workspace",
		segment: "workspace",
		path: appRoutes.settingsWorkspace(),
	},
	{
		id: "invitations",
		label: "Invitations",
		segment: "invitations",
		path: appRoutes.settingsInvitations(),
	},
	{
		id: "account",
		label: "Account",
		segment: "account",
		path: appRoutes.settingsAccount(),
	},
	{
		id: "create-workspace",
		label: "Create workspace",
		segment: "create-workspace",
		path: appRoutes.settingsCreateWorkspace(),
	},
] satisfies readonly SettingsRouteDefinition[]

export const settingsRouteMap: Record<SettingsRouteId, SettingsRouteDefinition> = {
	workspace: settingsRoutes[0],
	invitations: settingsRoutes[1],
	account: settingsRoutes[2],
	"create-workspace": settingsRoutes[3],
}

export function getActiveSettingsRouteId(pathname: string): SettingsRouteId {
	return (
		settingsRoutes.find(
			(route) =>
				pathname === route.path || pathname.startsWith(`${route.path}/`),
		)?.id ?? "workspace"
	)
}

export function getSettingsPathFromLegacyTab(tab: string | null): string {
	switch (tab) {
		case "invitations":
			return settingsRouteMap.invitations.path
		case "account":
			return settingsRouteMap.account.path
		case "create-workspace":
			return settingsRouteMap["create-workspace"].path
		case "workspace":
		default:
			return settingsRouteMap.workspace.path
	}
}
