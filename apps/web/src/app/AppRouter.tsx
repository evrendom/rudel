import { Navigate, Route, Routes } from "react-router-dom";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { WorkspaceSettingsPage } from "@/features/settings/workspace/WorkspaceSettingsPage";
import { AppShellLayout } from "@/features/shell/AppShellLayout";
import { TeamPage } from "@/features/team/TeamPage";
import { AcceptInvitationPage } from "@/pages/AcceptInvitationPage";
import { AdminPage } from "@/pages/dashboard/AdminPage";
import { CreateOrgPage } from "@/pages/dashboard/CreateOrgPage";
import { DeveloperDetailPage } from "@/pages/dashboard/DeveloperDetailPage";
import { DevelopersListPage } from "@/pages/dashboard/DevelopersListPage";
import { ErrorsPage } from "@/pages/dashboard/ErrorsPage";
import { InvitationsPage } from "@/pages/dashboard/InvitationsPage";
import { LearningsPage } from "@/pages/dashboard/LearningsPage";
import { ProfilePage } from "@/pages/dashboard/ProfilePage";
import { ProjectDetailPage } from "@/pages/dashboard/ProjectDetailPage";
import { ProjectsListPage } from "@/pages/dashboard/ProjectsListPage";
import { ROIPage } from "@/pages/dashboard/ROIPage";
import { SessionDetailPage } from "@/pages/dashboard/SessionDetailPage";
import { SessionsListPage } from "@/pages/dashboard/SessionsListPage";

export function AppRouter({
	rootRedirectTarget,
}: {
	rootRedirectTarget: string | null;
}) {
	return (
		<Routes>
			<Route
				path="/"
				element={<Navigate to={rootRedirectTarget || "/dashboard"} replace />}
			/>
			<Route
				path="/invitation/:invitationId"
				element={<AcceptInvitationPage />}
			/>
			<Route path="/dashboard" element={<AppShellLayout />}>
				<Route index element={<DashboardPage />} />
				<Route path="developers" element={<DevelopersListPage />} />
				<Route path="developers/:userId" element={<DeveloperDetailPage />} />
				<Route path="projects" element={<ProjectsListPage />} />
				<Route path="projects/:projectPath" element={<ProjectDetailPage />} />
				<Route path="sessions" element={<SessionsListPage />} />
				<Route path="sessions/:sessionId" element={<SessionDetailPage />} />
				<Route path="team" element={<TeamPage />} />
				<Route path="roi" element={<ROIPage />} />
				<Route path="errors" element={<ErrorsPage />} />
				<Route path="learnings" element={<LearningsPage />} />
				<Route path="profile" element={<ProfilePage />} />
				<Route path="invitations" element={<InvitationsPage />} />
				<Route path="organization" element={<WorkspaceSettingsPage />} />
				<Route path="organization/new" element={<CreateOrgPage />} />
				<Route path="admin" element={<AdminPage />} />
			</Route>
			<Route path="*" element={<Navigate to="/dashboard" replace />} />
		</Routes>
	);
}
