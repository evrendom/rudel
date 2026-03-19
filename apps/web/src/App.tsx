import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginForm } from "./components/auth/login-form";
import { SignupForm } from "./components/auth/signup-form";
import { Button } from "./components/ui/button";
import { useUiControlTracking } from "./hooks/useDashboardAnalytics";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { authClient } from "./lib/auth-client";
import {
	identifyProductAnalyticsUser,
	resetProductAnalytics,
} from "./lib/product-analytics";
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

function getDeviceUserCode(): string | null {
	const params = new URLSearchParams(window.location.search);
	return params.get("user_code");
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
	const { trackUiControl } = useUiControlTracking({ pageName: "device_login" });
	const [page, setPage] = useState<Page>("login");
	const [deviceProcessing, setDeviceProcessing] = useState(false);
	const [deviceApproved, setDeviceApproved] = useState(false);
	const [deviceDenied, setDeviceDenied] = useState(false);
	const [deviceError, setDeviceError] = useState<string | null>(null);
	const deviceUserCode = getDeviceUserCode();
	const { resolvedTheme } = useTheme();
	const logoSrc =
		resolvedTheme === "dark" ? "/logo-light.svg" : "/logo-dark.svg";

	useEffect(() => {
		const userId =
			session?.user &&
			"id" in session.user &&
			typeof session.user.id === "string"
				? session.user.id
				: null;
		const email =
			session?.user &&
			"email" in session.user &&
			typeof session.user.email === "string"
				? session.user.email
				: undefined;
		const name =
			session?.user &&
			"name" in session.user &&
			typeof session.user.name === "string"
				? session.user.name
				: undefined;

		if (userId) {
			identifyProductAnalyticsUser(userId, {
				email,
				name,
			});
			return;
		}

		resetProductAnalytics();
	}, [session]);

	async function submitDeviceDecision(action: "approve" | "deny") {
		if (!deviceUserCode || deviceProcessing) return;
		const userId =
			session?.user &&
			"id" in session.user &&
			typeof session.user.id === "string"
				? session.user.id
				: undefined;
		trackUiControl({
			controlName: `device_login_${action}`,
			controlType: "button",
			interactionType: "click",
			userId,
			value: deviceUserCode,
		});
		setDeviceProcessing(true);
		setDeviceError(null);
		try {
			const response = await fetch(`/api/auth/device/${action}`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ userCode: deviceUserCode }),
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as {
					error_description?: string;
					message?: string;
				} | null;
				throw new Error(
					body?.error_description ??
						body?.message ??
						`Failed to ${action} CLI device login`,
				);
			}
			if (action === "approve") {
				setDeviceApproved(true);
			} else {
				setDeviceDenied(true);
			}
		} catch (err) {
			setDeviceError(
				err instanceof Error ? err.message : "Failed to process device login",
			);
		} finally {
			setDeviceProcessing(false);
		}
	}

	if (isPending) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	if (deviceUserCode) {
		if (deviceProcessing) {
			return (
				<div className="flex min-h-screen items-center justify-center">
					<p className="text-muted-foreground">Processing CLI login...</p>
				</div>
			);
		}

		if (deviceApproved) {
			return (
				<div className="flex min-h-screen flex-col items-center justify-center gap-2">
					<p className="text-xl font-semibold">CLI login approved</p>
					<p className="text-muted-foreground">
						Return to your terminal to continue.
					</p>
				</div>
			);
		}

		if (deviceDenied) {
			return (
				<div className="flex min-h-screen flex-col items-center justify-center gap-2">
					<p className="text-xl font-semibold">CLI login denied</p>
					<p className="text-muted-foreground">
						This authorization request was not approved.
					</p>
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
			<div className="flex min-h-screen flex-col items-center justify-center gap-4">
				<p className="text-xl font-semibold">Authorize CLI login</p>
				<p className="text-muted-foreground">
					User code: <span className="font-mono">{deviceUserCode}</span>
				</p>
				{deviceError ? (
					<p className="text-destructive">{deviceError}</p>
				) : (
					<p className="text-muted-foreground">
						Approve this request only if it was initiated by you from the CLI.
					</p>
				)}
				<div className="flex gap-2">
					<Button onClick={() => submitDeviceDecision("approve")}>
						Approve
					</Button>
					<Button
						variant="outline"
						onClick={() => submitDeviceDecision("deny")}
					>
						Deny
					</Button>
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
