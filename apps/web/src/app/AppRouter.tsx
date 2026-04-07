import { type ComponentType, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { NotFoundPage } from "@/app/system/NotFoundPage";
import { AcceptInvitationPage } from "@/features/invitations/AcceptInvitationPage";
import { settingsRouteMap } from "@/features/settings/config/settings-routes";
import { SettingsIndexRedirect } from "@/features/settings/SettingsIndexRedirect";
import { AppShellLayout } from "@/features/shell/AppShellLayout";
import { shellRouteMap } from "@/features/shell/config/shell-routes";
import { appendSidebarShellDebugParams } from "@/features/shell/config/sidebar-shell-debug";

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
const DashboardyPage = lazyNamed(
	() => import("@/features/dashboardy/DashboardyPage"),
	"DashboardyPage",
);
const SettingsLayout = lazyNamed(
	() => import("@/features/settings/SettingsLayout"),
	"SettingsLayout",
);
const WorkspaceSettingsPage = lazyNamed(
	() => import("@/features/settings/workspace/WorkspaceSettingsPage"),
	"WorkspaceSettingsPage",
);
const InvitationsSettingsPage = lazyNamed(
	() => import("@/features/settings/invitations/InvitationsSettingsPage"),
	"InvitationsSettingsPage",
);
const AccountSettingsPage = lazyNamed(
	() => import("@/features/settings/account/AccountSettingsPage"),
	"AccountSettingsPage",
);
const CreateWorkspacePage = lazyNamed(
	() => import("@/features/settings/create-workspace/CreateWorkspacePage"),
	"CreateWorkspacePage",
);
const TeamPage = lazyNamed(
	() => import("@/features/team/TeamPage"),
	"TeamPage",
);
const PresetBaselinePage = lazyNamed(
	() => import("@/app/system/PresetBaselinePage"),
	"PresetBaselinePage",
);

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

function LazyRoute({ Component }: { Component: ComponentType }) {
	return (
		<Suspense fallback={<DashboardRouteLoadingScreen />}>
			<Component />
		</Suspense>
	);
}

export function AppRouter({
	rootRedirectTarget,
}: {
	rootRedirectTarget: string | null;
}) {
	const location = useLocation();
	const rootRedirect = appendSidebarShellDebugParams(
		rootRedirectTarget || shellRouteMap.dashboard.path,
		new URLSearchParams(location.search),
	);

	return (
		<Routes>
			<Route path="/" element={<Navigate to={rootRedirect} replace />} />
			<Route
				path="/invitation/:invitationId"
				element={<AcceptInvitationPage />}
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
					path={shellRouteMap.dashboardy.path}
					element={<LazyRoute Component={DashboardyPage} />}
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
						path={settingsRouteMap.invitations.segment}
						element={<LazyRoute Component={InvitationsSettingsPage} />}
					/>
					<Route
						path={settingsRouteMap.account.segment}
						element={<LazyRoute Component={AccountSettingsPage} />}
					/>
					<Route
						path={settingsRouteMap["create-workspace"].segment}
						element={<LazyRoute Component={CreateWorkspacePage} />}
					/>
				</Route>
			</Route>
			<Route path="*" element={<NotFoundPage />} />
		</Routes>
	);
}
