const DASHBOARD_PATH = "/dashboard";
const DASHBOARD_SESSIONS_PATH = `${DASHBOARD_PATH}/sessions`;
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
const DEV_WRAPPED_PATH = "/dev/wrapped";
const WRAPPED_RESUME_PATH = "/resume";
const LEGACY_WALK_IN_TEAM_CARD_PATH = "/walk-in-team-card";

// These helpers are the canonical route surface for the Saturday wrapped loop.
// We keep them centralized so design, auth, analytics, and public sharing all
// talk about the same URLs instead of rebuilding strings in multiple places.
export const appRoutes = {
	home: () => DASHBOARD_PATH,
	dashboard: () => DASHBOARD_PATH,
	dashboardSessions: () => DASHBOARD_SESSIONS_PATH,
	getStarted: () => GET_STARTED_PATH,
	dashboardGetStartedLegacy: () => DASHBOARD_GET_STARTED_LEGACY_PATH,
	team: () => TEAM_PATH,
	settings: () => SETTINGS_ROOT_PATH,
	settingsRoot: () => SETTINGS_ROOT_PATH,
	presetBaseline: () => PRESET_BASELINE_PATH,
	cardReference: () => CARD_REFERENCE_PATH,
	wrappedTeamCard: () => WRAPPED_TEAM_CARD_PATH,
	devWrapped: () => DEV_WRAPPED_PATH,
	wrappedPublic: (publicId: string) =>
		`${WRAPPED_TEAM_CARD_PATH}/${encodeURIComponent(publicId)}`,
	wrappedResume: (token: string) =>
		`${WRAPPED_RESUME_PATH}/${encodeURIComponent(token)}`,
	wrappedTeamCardFromShare: (shareId: string) =>
		`${WRAPPED_TEAM_CARD_PATH}?share_id=${encodeURIComponent(shareId)}`,
	walkInTeamCard: () => WRAPPED_TEAM_CARD_PATH,
	legacyWalkInTeamCard: () => LEGACY_WALK_IN_TEAM_CARD_PATH,
	settingsWorkspace: () => SETTINGS_WORKSPACE_PATH,
	settingsInvitations: () => SETTINGS_INVITATIONS_PATH,
	settingsAccount: () => SETTINGS_ACCOUNT_PATH,
	settingsCreateWorkspace: () => SETTINGS_CREATE_WORKSPACE_PATH,
};

// Public wrapped pages live at /wrapped/:id in this pass. The id is still the
// existing UUID-backed share id even though the route shape is changing.
export function getWrappedPublicIdFromPath(pathname: string) {
	const routeMatch = pathname.match(/^\/wrapped\/([^/]+)\/?$/u);
	const encodedPublicId = routeMatch?.[1];

	if (!encodedPublicId) {
		return null;
	}

	try {
		return decodeURIComponent(encodedPublicId);
	} catch {
		return null;
	}
}

// Legacy launch links used /wrapped/share/:id. Keep that parser separate so
// App.tsx can redirect old links to the canonical /wrapped/:id route without
// mixing legacy compatibility into the main public-route matcher.
export function getLegacyWrappedPublicIdFromPath(pathname: string) {
	const routeMatch = pathname.match(/^\/wrapped\/share\/([^/]+)\/?$/u);
	const encodedPublicId = routeMatch?.[1];

	if (!encodedPublicId) {
		return null;
	}

	try {
		return decodeURIComponent(encodedPublicId);
	} catch {
		return null;
	}
}

// Post-auth attribution stays in a query param on /wrapped. We parse it
// separately from the public route because it is for analytics and continuation,
// not for rendering the public page itself.
export function getWrappedShareIdFromSearch(search: string) {
	const searchParams = new URLSearchParams(search);
	const shareId = searchParams.get("share_id");

	if (!shareId) {
		return null;
	}

	return shareId;
}

// Resume links stay outside /wrapped because they are not a replay surface.
// They are a small auth-and-continue route whose only job is to return the
// signed-in user to the upload step on desktop.
export function getWrappedResumeTokenFromPath(pathname: string) {
	const routeMatch = pathname.match(/^\/resume\/([^/]+)\/?$/u);
	const encodedToken = routeMatch?.[1];

	if (!encodedToken) {
		return null;
	}

	try {
		return decodeURIComponent(encodedToken);
	} catch {
		return null;
	}
}
