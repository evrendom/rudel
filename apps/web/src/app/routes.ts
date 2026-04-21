const DASHBOARD_PATH = "/dashboard";
const DASHBOARD_GET_STARTED_LEGACY_PATH = `${DASHBOARD_PATH}/get-started`;
const GET_STARTED_PATH = "/get-started";
const TEAM_PATH = "/team";
const SETTINGS_ROOT_PATH = "/settings";
const SETTINGS_WORKSPACE_PATH = `${SETTINGS_ROOT_PATH}/workspace`;
const SETTINGS_INVITATIONS_PATH = `${SETTINGS_ROOT_PATH}/invitations`;
const SETTINGS_ACCOUNT_PATH = `${SETTINGS_ROOT_PATH}/account`;
const SETTINGS_CREATE_WORKSPACE_PATH = `${SETTINGS_ROOT_PATH}/create-workspace`;
const PRESET_BASELINE_PATH = "/__preset-baseline";
const CARD_REFERENCE_PATH = "/card-reference";
const WRAPPED_TEAM_CARD_PATH = "/wrapped";
const WRAPPED_SHARE_PATH = `${WRAPPED_TEAM_CARD_PATH}/share`;
const LEGACY_WALK_IN_TEAM_CARD_PATH = "/walk-in-team-card";

export const appRoutes = {
	home: () => DASHBOARD_PATH,
	dashboard: () => DASHBOARD_PATH,
	getStarted: () => GET_STARTED_PATH,
	dashboardGetStartedLegacy: () => DASHBOARD_GET_STARTED_LEGACY_PATH,
	team: () => TEAM_PATH,
	settings: () => SETTINGS_ROOT_PATH,
	settingsRoot: () => SETTINGS_ROOT_PATH,
	presetBaseline: () => PRESET_BASELINE_PATH,
	cardReference: () => CARD_REFERENCE_PATH,
	wrappedTeamCard: () => WRAPPED_TEAM_CARD_PATH,
	wrappedShare: (shareId: string) =>
		`${WRAPPED_SHARE_PATH}/${encodeURIComponent(shareId)}`,
	getStartedFromWrappedShare: (shareId: string) =>
		`${GET_STARTED_PATH}?share_id=${encodeURIComponent(shareId)}`,
	walkInTeamCard: () => WRAPPED_TEAM_CARD_PATH,
	legacyWalkInTeamCard: () => LEGACY_WALK_IN_TEAM_CARD_PATH,
	settingsWorkspace: () => SETTINGS_WORKSPACE_PATH,
	settingsInvitations: () => SETTINGS_INVITATIONS_PATH,
	settingsAccount: () => SETTINGS_ACCOUNT_PATH,
	settingsCreateWorkspace: () => SETTINGS_CREATE_WORKSPACE_PATH,
};

export function getWrappedShareIdFromPath(pathname: string) {
	const routeMatch = pathname.match(/^\/wrapped\/share\/([^/]+)\/?$/u);
	const encodedShareId = routeMatch?.[1];

	if (!encodedShareId) {
		return null;
	}

	try {
		return decodeURIComponent(encodedShareId);
	} catch {
		return null;
	}
}

export function getWrappedShareIdFromSearch(search: string) {
	const searchParams = new URLSearchParams(search);
	const shareId = searchParams.get("share_id");

	if (!shareId) {
		return null;
	}

	return shareId;
}
