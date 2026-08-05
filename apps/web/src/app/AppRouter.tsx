import { type ComponentType, lazy, type ReactNode, Suspense } from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import {
	appRoutes,
	getBottomRailPreviewPath,
	getLeftSidebarPreviewPath,
} from "@/app/routes";
import { NotFoundPage } from "@/app/system/NotFoundPage";
import { AcceptInvitationPage } from "@/features/invitations/AcceptInvitationPage";
import { settingsRouteMap } from "@/features/settings/config/settings-routes";
import { SettingsIndexRedirect } from "@/features/settings/SettingsIndexRedirect";
import {
	AppShellLayout,
	BottomRailAppShellLayout,
	LeftSidebarAppShellLayout,
} from "@/features/shell/AppShellLayout";
import { shellRouteMap } from "@/features/shell/config/shell-routes";

function lazyNamed<TModule extends Record<string, unknown>>(
	loader: () => Promise<TModule>,
	exportName: keyof TModule,
) {
	return lazy(async () => {
		const module = await loader();
		return {
			default: module[exportName] as ComponentType,
		};
	});
}

const DashboardPage = lazyNamed(
	() => import("@/features/dashboard/DashboardPage"),
	"DashboardPage",
);
const SessionsPage = lazyNamed(
	() => import("@/features/sessions/sessions-page"),
	"SessionsPage",
);
const SkillsPage = lazyNamed(
	() => import("@/features/skills/SkillsPage"),
	"SkillsPage",
);
const SettingsLayout = lazyNamed(
	() => import("@/features/settings/SettingsLayout"),
	"SettingsLayout",
);
const WorkspaceSettingsPage = lazyNamed(
	() => import("@/features/settings/workspace/WorkspaceSettingsPage"),
	"WorkspaceSettingsPage",
);
const MembersSettingsPage = lazyNamed(
	() => import("@/features/settings/members/MembersSettingsPage"),
	"MembersSettingsPage",
);
const AccountSettingsPage = lazyNamed(
	() => import("@/features/settings/account/AccountSettingsPage"),
	"AccountSettingsPage",
);
const TeamPage = lazyNamed(
	() => import("@/features/team/TeamPage"),
	"TeamPage",
);
const TeamInviteAcceptPage = lazyNamed(
	() => import("@/features/team/TeamInviteAcceptPage"),
	"TeamInviteAcceptPage",
);
const PresetBaselinePage = lazyNamed(
	() => import("@/app/system/PresetBaselinePage"),
	"PresetBaselinePage",
);
const LEGACY_DASHBOARDY_PATH = "/dashboardy";
const LEGACY_DASHBOARD_SESSIONS_PATH = "/dashboard/sessions";
const LEGACY_SESSION_FULL_PATH = "/session/full";
const LEGACY_SESSION_SPLIT_PATH = "/session/split";

type ShellRoutePaths = {
	dashboard: string;
	session: string;
	skills: string;
	team: string;
	settings: string;
	settingsAccount: string;
	settingsWorkspace: string;
};

const canonicalShellRoutePaths: ShellRoutePaths = {
	dashboard: appRoutes.dashboard(),
	session: appRoutes.session(),
	skills: appRoutes.skills(),
	team: appRoutes.team(),
	settings: appRoutes.settings(),
	settingsAccount: appRoutes.settingsAccount(),
	settingsWorkspace: appRoutes.settingsWorkspace(),
};

const bottomRailShellRoutePaths: ShellRoutePaths = {
	dashboard: getBottomRailPreviewPath(canonicalShellRoutePaths.dashboard),
	session: getBottomRailPreviewPath(canonicalShellRoutePaths.session),
	skills: getBottomRailPreviewPath(canonicalShellRoutePaths.skills),
	team: getBottomRailPreviewPath(canonicalShellRoutePaths.team),
	settings: getBottomRailPreviewPath(canonicalShellRoutePaths.settings),
	settingsAccount: getBottomRailPreviewPath(
		canonicalShellRoutePaths.settingsAccount,
	),
	settingsWorkspace: getBottomRailPreviewPath(
		canonicalShellRoutePaths.settingsWorkspace,
	),
};

const leftSidebarShellRoutePaths: ShellRoutePaths = {
	dashboard: getLeftSidebarPreviewPath(canonicalShellRoutePaths.dashboard),
	session: getLeftSidebarPreviewPath(canonicalShellRoutePaths.session),
	skills: getLeftSidebarPreviewPath(canonicalShellRoutePaths.skills),
	team: getLeftSidebarPreviewPath(canonicalShellRoutePaths.team),
	settings: getLeftSidebarPreviewPath(canonicalShellRoutePaths.settings),
	settingsAccount: getLeftSidebarPreviewPath(
		canonicalShellRoutePaths.settingsAccount,
	),
	settingsWorkspace: getLeftSidebarPreviewPath(
		canonicalShellRoutePaths.settingsWorkspace,
	),
};

function LegacySessionDetailRedirect() {
	const params = useParams<{ sessionId: string }>();

	return (
		<Navigate
			replace
			to={
				params.sessionId
					? appRoutes.sessionDetail(params.sessionId)
					: appRoutes.session()
			}
		/>
	);
}

function DashboardRouteLoadingScreen() {
	return (
		<div
			aria-busy="true"
			aria-live="polite"
			className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6"
		>
			<div className="h-6 w-32 animate-pulse rounded-md bg-muted" />
			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<div className="h-28 animate-pulse rounded-xl border border-border bg-card" />
				<div className="h-28 animate-pulse rounded-xl border border-border bg-card" />
				<div className="h-28 animate-pulse rounded-xl border border-border bg-card" />
			</div>
			<div className="h-[26rem] animate-pulse rounded-xl border border-border bg-card" />
			<p className="text-sm text-muted-foreground">Loading…</p>
		</div>
	);
}

function LazyRoute({
	Component,
	fallback = <DashboardRouteLoadingScreen />,
}: {
	Component: ComponentType;
	fallback?: ReactNode;
}) {
	return (
		<Suspense fallback={fallback}>
			<Component />
		</Suspense>
	);
}

function getShellRouteElements(routePaths: ShellRoutePaths) {
	return (
		<>
			<Route
				path={routePaths.dashboard}
				element={<LazyRoute Component={DashboardPage} />}
			/>
			<Route
				path={routePaths.session}
				element={<LazyRoute Component={SessionsPage} />}
			/>
			<Route
				path={`${routePaths.session}/:sessionId`}
				element={<LazyRoute Component={SessionsPage} />}
			/>
			<Route
				path={routePaths.skills}
				element={<LazyRoute Component={SkillsPage} />}
			/>
			<Route
				path={routePaths.team}
				element={<LazyRoute Component={TeamPage} />}
			/>
			<Route
				path={routePaths.settings}
				element={<LazyRoute Component={SettingsLayout} />}
			>
				<Route index element={<SettingsIndexRedirect />} />
				<Route
					path={settingsRouteMap.workspace.segment}
					element={<LazyRoute Component={WorkspaceSettingsPage} />}
				/>
				<Route
					path={settingsRouteMap.members.segment}
					element={<LazyRoute Component={MembersSettingsPage} />}
				/>
				<Route
					path={settingsRouteMap.invitations.segment}
					element={
						<Navigate
							replace
							to={`${routePaths.settingsAccount}#workspace-invitations`}
						/>
					}
				/>
				<Route
					path={settingsRouteMap.account.segment}
					element={<LazyRoute Component={AccountSettingsPage} />}
				/>
				<Route
					path={settingsRouteMap["create-workspace"].segment}
					element={
						<Navigate
							replace
							to={`${routePaths.settingsWorkspace}#new-workspace`}
						/>
					}
				/>
			</Route>
		</>
	);
}

export function AppRouter({
	rootRedirectTarget,
}: {
	rootRedirectTarget: string | null;
}) {
	const rootRedirect = rootRedirectTarget || shellRouteMap.dashboard.path;
	return (
		<Routes>
			<Route path="/" element={<Navigate to={rootRedirect} replace />} />
			<Route
				path="/invitation/:invitationId"
				element={<AcceptInvitationPage />}
			/>
			<Route
				path="/team/invite/:token"
				element={<LazyRoute Component={TeamInviteAcceptPage} />}
			/>
			<Route
				path="/__preset-baseline"
				element={<LazyRoute Component={PresetBaselinePage} />}
			/>
			<Route element={<BottomRailAppShellLayout />}>
				{getShellRouteElements(bottomRailShellRoutePaths)}
			</Route>
			<Route element={<LeftSidebarAppShellLayout />}>
				{getShellRouteElements(leftSidebarShellRoutePaths)}
			</Route>
			<Route element={<AppShellLayout />}>
				{getShellRouteElements(canonicalShellRoutePaths)}
				<Route
					path={LEGACY_DASHBOARD_SESSIONS_PATH}
					element={<Navigate to={appRoutes.session()} replace />}
				/>
				<Route
					path={`${LEGACY_DASHBOARD_SESSIONS_PATH}/:sessionId`}
					element={<LegacySessionDetailRedirect />}
				/>
				<Route
					path={LEGACY_SESSION_SPLIT_PATH}
					element={<Navigate to={appRoutes.session()} replace />}
				/>
				<Route
					path={LEGACY_SESSION_FULL_PATH}
					element={<Navigate to={appRoutes.session()} replace />}
				/>
				<Route
					path={`${LEGACY_SESSION_FULL_PATH}/:sessionId`}
					element={<LegacySessionDetailRedirect />}
				/>
				<Route
					path={LEGACY_DASHBOARDY_PATH}
					element={<Navigate to={shellRouteMap.dashboard.path} replace />}
				/>
			</Route>
			<Route path="*" element={<NotFoundPage />} />
		</Routes>
	);
}
