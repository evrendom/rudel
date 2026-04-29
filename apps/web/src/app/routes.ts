import { appendWebAcquisitionSearchParams } from "@/lib/acquisition-attribution";

const DASHBOARD_PATH = "/dashboard";
const DASHBOARD_SESSIONS_PATH = `${DASHBOARD_PATH}/sessions`;
const DASHBOARD_GET_STARTED_LEGACY_PATH = `${DASHBOARD_PATH}/get-started`;
const GET_STARTED_PATH = "/get-started";
const TEAM_PATH = "/team";
const SETTINGS_ROOT_PATH = "/settings";
const SETTINGS_WORKSPACE_PATH = `${SETTINGS_ROOT_PATH}/workspace`;
const SETTINGS_MEMBERS_PATH = `${SETTINGS_ROOT_PATH}/members`;
const SETTINGS_INVITATIONS_PATH = `${SETTINGS_ROOT_PATH}/invitations`;
const SETTINGS_ACCOUNT_PATH = `${SETTINGS_ROOT_PATH}/account`;
const SETTINGS_CREATE_WORKSPACE_PATH = `${SETTINGS_ROOT_PATH}/create-workspace`;
const PRESET_BASELINE_PATH = "/__preset-baseline";
const CARD_REFERENCE_PATH = "/card-reference";
const WRAPPED_TEAM_CARD_PATH = "/wrapped";
const DEV_WRAPPED_PATH = "/dev/wrapped";
const WRAPPED_RESUME_PATH = "/resume";
export const WRAPPED_ROUTE_FLOW_QUERY_PARAM = "flow";
export const WRAPPED_ROUTE_CARD_PROFILE_FLOW = "card-profile";
export const WRAPPED_ROUTE_DESKTOP_READY_FLOW = "desktop-ready";
export const WRAPPED_ROUTE_SESSIONS_LANDED_FLOW = "sessions-landed";

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
	wrappedCardProfile: (search?: string) => getWrappedCardProfilePath(search),
	wrappedDesktopReady: (search?: string) => getWrappedDesktopReadyPath(search),
	wrappedSessionsLanded: (search?: string) =>
		getWrappedSessionsLandedPath(search),
	devWrapped: () => DEV_WRAPPED_PATH,
	wrappedPublic: (publicId: string) =>
		`${WRAPPED_TEAM_CARD_PATH}/${encodeURIComponent(publicId)}`,
	wrappedResume: (token: string) =>
		`${WRAPPED_RESUME_PATH}/${encodeURIComponent(token)}`,
	wrappedTeamCardFromShare: (
		shareId: string,
		sourceSearch?: string,
		referrerDomain?: string | null,
	) => getWrappedTeamCardFromSharePath(shareId, sourceSearch, referrerDomain),
	settingsWorkspace: () => SETTINGS_WORKSPACE_PATH,
	settingsMembers: () => SETTINGS_MEMBERS_PATH,
	settingsInvitations: () => SETTINGS_INVITATIONS_PATH,
	settingsAccount: () => SETTINGS_ACCOUNT_PATH,
	settingsCreateWorkspace: () => SETTINGS_CREATE_WORKSPACE_PATH,
};

function getWrappedTeamCardFromSharePath(
	shareId: string,
	sourceSearch?: string,
	referrerDomain?: string | null,
) {
	const searchParams = new URLSearchParams();
	searchParams.set("share_id", shareId);
	appendWebAcquisitionSearchParams(searchParams, sourceSearch, referrerDomain);

	return `${WRAPPED_TEAM_CARD_PATH}?${searchParams.toString()}`;
}

export function getWrappedCardProfilePath(search?: string) {
	return getWrappedFlowPath(WRAPPED_ROUTE_CARD_PROFILE_FLOW, search);
}

export function getWrappedDesktopReadyPath(search?: string) {
	return getWrappedFlowPath(WRAPPED_ROUTE_DESKTOP_READY_FLOW, search);
}

export function getWrappedSessionsLandedPath(search?: string) {
	return getWrappedFlowPath(WRAPPED_ROUTE_SESSIONS_LANDED_FLOW, search);
}

function getWrappedFlowPath(flow: string, search?: string) {
	const searchParams = new URLSearchParams(search);
	searchParams.set(WRAPPED_ROUTE_FLOW_QUERY_PARAM, flow);

	return `${WRAPPED_TEAM_CARD_PATH}?${searchParams.toString()}`;
}

// Public wrapped pages live at /wrapped/:id. New links use username-style ids,
// while older UUID ids still resolve because the backend key is plain text.
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
