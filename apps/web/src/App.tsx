import { useTheme } from "next-themes";
import { useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginForm } from "./components/auth/login-form";
import { Button } from "./components/ui/button";
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
type CliParams = {
	cliCallback: string;
	state: string;
	codeChallenge: string;
};

function getCliParams(): CliParams | null {
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

function clearCliParamsFromLocation() {
	const url = new URL(window.location.href);
	url.searchParams.delete("cli_callback");
	url.searchParams.delete("state");
	url.searchParams.delete("code_challenge");
	window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

function formatCliCallback(cliCallback: string): string {
	try {
		const url = new URL(cliCallback);
		return `${url.hostname}:${url.port || "80"}${url.pathname}`;
	} catch {
		return cliCallback;
	}
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
	const [cliParams, setCliParams] = useState<CliParams | null>(() =>
		getCliParams(),
	);
	const [cliRedirecting, setCliRedirecting] = useState(false);
	const [cliError, setCliError] = useState<string | null>(null);
	const { resolvedTheme } = useTheme();
	const logoSrc =
		resolvedTheme === "dark" ? "/logo-light.svg" : "/logo-dark.svg";
	const redirectPath = getValidRedirect() || "/dashboard";

	async function startCliLogin() {
		if (!cliParams || cliRedirecting) return;
		setCliRedirecting(true);
		setCliError(null);

		try {
			const response = await fetch("/api/cli-token", {
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
			});
			const data = (await response.json()) as { code?: string; error?: string };
			if (!response.ok || !data.code) {
				throw new Error(data.error ?? "Failed to create CLI auth code");
			}

			const redirectUrl = `${cliParams.cliCallback}?code=${encodeURIComponent(data.code)}&state=${encodeURIComponent(cliParams.state)}`;
			window.location.replace(redirectUrl);
		} catch (error) {
			console.error("CLI login handoff failed", error);
			setCliRedirecting(false);
			setCliError(
				error instanceof Error
					? error.message
					: "Failed to complete CLI login.",
			);
		}
	}

	function cancelCliLogin() {
		clearCliParamsFromLocation();
		setCliParams(null);
		setCliError(null);
		setCliRedirecting(false);
	}

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

	if (session && cliParams) {
		return (
			<div className="flex min-h-screen items-center justify-center px-4">
				<div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-sm">
					<div className="space-y-2">
						<h1 className="text-xl font-semibold">Authorize CLI login</h1>
						<p className="text-sm text-muted-foreground">
							A local Rudel CLI instance is requesting access to your account.
							Only continue if you started `rudel login` in your terminal.
						</p>
					</div>
					<div className="mt-4 rounded-lg border bg-muted/30 p-4 text-sm">
						<p>
							<span className="font-medium">Callback:</span>{" "}
							{formatCliCallback(cliParams.cliCallback)}
						</p>
					</div>
					{cliError ? (
						<p className="mt-4 text-sm text-destructive">{cliError}</p>
					) : null}
					<div className="mt-6 flex flex-col gap-3 sm:flex-row">
						<Button
							type="button"
							onClick={startCliLogin}
							disabled={cliRedirecting}
						>
							Continue CLI Login
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={cancelCliLogin}
							disabled={cliRedirecting}
						>
							Cancel
						</Button>
					</div>
				</div>
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
				element={<Navigate to={redirectPath} replace />}
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
