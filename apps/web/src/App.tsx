import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginForm } from "./components/auth/login-form";
import { SignupForm } from "./components/auth/signup-form";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { authClient } from "./lib/auth-client";
import { AcceptInvitationPage } from "./pages/AcceptInvitationPage";
import { CreateOrgPage } from "./pages/dashboard/CreateOrgPage";
import { DeveloperDetailPage } from "./pages/dashboard/DeveloperDetailPage";
import { DevelopersListPage } from "./pages/dashboard/DevelopersListPage";
import { ErrorsPage } from "./pages/dashboard/ErrorsPage";
import { InvitationsPage } from "./pages/dashboard/InvitationsPage";
import { LearningsPage } from "./pages/dashboard/LearningsPage";
import { OrganizationPage } from "./pages/dashboard/OrganizationPage";
import { OverviewPage } from "./pages/dashboard/OverviewPage";
import { ProfilePage } from "./pages/dashboard/ProfilePage";
import { ProjectDetailPage } from "./pages/dashboard/ProjectDetailPage";
import { ProjectsListPage } from "./pages/dashboard/ProjectsListPage";
import { ROIPage } from "./pages/dashboard/ROIPage";
import { SessionDetailPage } from "./pages/dashboard/SessionDetailPage";
import { SessionsListPage } from "./pages/dashboard/SessionsListPage";

type Page = "login" | "signup";

function getCliParams(): {
	cliCallback: string;
	state: string;
	codeChallenge: string;
} | null {
	const params = new URLSearchParams(window.location.search);
	const cliCallback = params.get("cli_callback");
	const state = params.get("state");
	const codeChallenge = params.get("code_challenge");
	if (!cliCallback || !state || !codeChallenge) return null;
	try {
		const url = new URL(cliCallback);
		if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") return null;
	} catch {
		return null;
	}
	return { cliCallback, state, codeChallenge };
}

function getValidRedirect(): string | null {
	const params = new URLSearchParams(window.location.search);
	const redirect = params.get("redirect");
	if (!redirect) return null;
	if (!redirect.startsWith("/") || redirect.startsWith("//")) return null;
	return redirect;
}

function App() {
	const { data: session, isPending } = authClient.useSession();
	const [page, setPage] = useState<Page>("login");
	const [cliRedirecting, setCliRedirecting] = useState(false);
	const cliParams = getCliParams();
	const { resolvedTheme } = useTheme();
	const logoSrc =
		resolvedTheme === "dark" ? "/logo-light.svg" : "/logo-dark.svg";

	useEffect(() => {
		if (!session || !cliParams || cliRedirecting) return;
		setCliRedirecting(true);

		fetch("/api/cli-token", {
			method: "POST",
			credentials: "include",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				cliCallback: cliParams.cliCallback,
				state: cliParams.state,
				codeChallenge: cliParams.codeChallenge,
			}),
		})
			.then(async (res) => {
				const data = (await res.json()) as { code?: string; error?: string };
				if (!res.ok || !data.code) {
					throw new Error(data.error ?? "Failed to create CLI auth code");
				}
				return data.code;
			})
			.then((code) => {
				const redirectUrl = `${cliParams.cliCallback}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(cliParams.state)}`;
				window.location.replace(redirectUrl);
			})
			.catch((error) => {
				console.error("CLI login handoff failed", error);
				setCliRedirecting(false);
			});
	}, [session, cliParams, cliRedirecting]);

	if (isPending) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	if (cliRedirecting) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<p className="text-muted-foreground">Completing CLI login...</p>
			</div>
		);
	}

	if (!session) {
		return (
			<div className="flex min-h-screen flex-col items-center justify-center gap-6">
				<img src={logoSrc} alt="Rudel" className="h-10 w-10" />
				{page === "login" ? (
					<LoginForm onSwitchToSignup={() => setPage("signup")} />
				) : (
					<SignupForm onSwitchToLogin={() => setPage("login")} />
				)}
			</div>
		);
	}

	return (
		<Routes>
			<Route
				path="/"
				element={<Navigate to={getValidRedirect() || "/dashboard"} replace />}
			/>
			<Route
				path="/invitation/:invitationId"
				element={<AcceptInvitationPage />}
			/>
			<Route path="/dashboard" element={<DashboardLayout />}>
				<Route index element={<OverviewPage />} />
				<Route path="developers" element={<DevelopersListPage />} />
				<Route path="developers/:userId" element={<DeveloperDetailPage />} />
				<Route path="projects" element={<ProjectsListPage />} />
				<Route path="projects/:projectPath" element={<ProjectDetailPage />} />
				<Route path="sessions" element={<SessionsListPage />} />
				<Route path="sessions/:sessionId" element={<SessionDetailPage />} />
				<Route path="roi" element={<ROIPage />} />
				<Route path="errors" element={<ErrorsPage />} />
				<Route path="learnings" element={<LearningsPage />} />
				<Route path="profile" element={<ProfilePage />} />
				<Route path="invitations" element={<InvitationsPage />} />
				<Route path="organization" element={<OrganizationPage />} />
				<Route path="organization/new" element={<CreateOrgPage />} />
			</Route>
			<Route path="*" element={<Navigate to="/dashboard" replace />} />
		</Routes>
	);
}

export default App;
