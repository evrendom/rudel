import { type ComponentType, lazy, type ReactNode, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { NotFoundPage } from "@/app/system/NotFoundPage";
import { isYcReviewSession } from "@/features/auth/auth-route-utils";
import { AcceptInvitationPage } from "@/features/invitations/AcceptInvitationPage";
import { settingsRouteMap } from "@/features/settings/config/settings-routes";
import { SettingsIndexRedirect } from "@/features/settings/SettingsIndexRedirect";
import { AppShellLayout } from "@/features/shell/AppShellLayout";
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
const SessionsListPage = lazyNamed(
	() => import("@/pages/dashboard/SessionsListPage"),
	"SessionsListPage",
);
const SessionDetailPage = lazyNamed(
	() => import("@/pages/dashboard/SessionDetailPage"),
	"SessionDetailPage",
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

export function AppRouter({
	rootRedirectTarget,
	session,
}: {
	rootRedirectTarget: string | null;
	session: unknown;
}) {
	const location = useLocation();
	const rootRedirect = rootRedirectTarget || shellRouteMap.dashboard.path;
	const canonicalWorkspaceSettingsPath = settingsRouteMap.workspace.path;
	const canonicalAccountSettingsPath = settingsRouteMap.account.path;
	const settingsPath = shellRouteMap.settings.path;
	const sessionDetailPath = `${appRoutes.dashboardSessions()}/`;
	const isYcReview = isYcReviewSession(session);
	const isYcSettingsPath =
		isYcReview &&
		(location.pathname === settingsPath ||
			location.pathname.startsWith(`${settingsPath}/`));
	const isYcSessionDetailPath =
		isYcReview && location.pathname.startsWith(sessionDetailPath);

	if (isYcSettingsPath) {
		return <Navigate replace to={appRoutes.wrappedStory()} />;
	}

	if (isYcSessionDetailPath) {
		return <Navigate replace to={appRoutes.dashboardSessions()} />;
	}

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
			<Route element={<AppShellLayout />}>
				<Route
					path={shellRouteMap.dashboard.path}
					element={<LazyRoute Component={DashboardPage} />}
				/>
				<Route
					path={`${shellRouteMap.dashboard.path}/sessions`}
					element={<LazyRoute Component={SessionsListPage} />}
				/>
				<Route
					path={`${shellRouteMap.dashboard.path}/sessions/:sessionId`}
					element={<LazyRoute Component={SessionDetailPage} />}
				/>
				<Route
					path={LEGACY_DASHBOARDY_PATH}
					element={<Navigate to={shellRouteMap.dashboard.path} replace />}
				/>
				<Route
					path={shellRouteMap.team.path}
					element={<LazyRoute Component={TeamPage} />}
				/>
				<Route
					path={shellRouteMap.settings.path}
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
								to={`${canonicalAccountSettingsPath}#workspace-invitations`}
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
								to={`${canonicalWorkspaceSettingsPath}#new-workspace`}
							/>
						}
					/>
				</Route>
			</Route>
			<Route path="*" element={<NotFoundPage />} />
		</Routes>
	);
}
