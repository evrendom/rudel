import { useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useAnalyticsTracking } from "../hooks/useDashboardAnalytics";
import { USER_INVITATIONS_KEY } from "../hooks/useUserInvitations";
import { authClient } from "../lib/auth-client";

export function AcceptInvitationPage() {
	const { invitationId } = useParams<{ invitationId: string }>();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data: session, isPending: sessionLoading } = authClient.useSession();
	const { trackAuthenticationAction } = useAnalyticsTracking({
		pageName: "accept_invitation",
	});
	const [status, setStatus] = useState<
		"loading" | "accepting" | "accepted" | "error"
	>("loading");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (sessionLoading || !invitationId) return;

		if (!session) {
			const returnUrl = `/invitation/${invitationId}`;
			window.location.href = `/?redirect=${encodeURIComponent(returnUrl)}`;
			return;
		}

		setStatus("loading");
	}, [session, sessionLoading, invitationId]);

	const handleAccept = async () => {
		if (!invitationId) return;
		trackAuthenticationAction({
			actionName: "accept_invitation",
			sourceComponent: "accept_invitation_page",
			authMethod: "invitation",
			targetId: invitationId,
			userId:
				session?.user && "id" in session.user
					? String(session.user.id)
					: undefined,
		});
		setStatus("accepting");
		setError(null);

		const res = await authClient.organization.acceptInvitation({
			invitationId,
		});

		if (res.error) {
			setError(res.error.message ?? "Failed to accept invitation");
			setStatus("error");
			return;
		}

		if (res.data) {
			await authClient.organization.setActive({
				organizationId: res.data.member.organizationId,
			});
		}

		setStatus("accepted");
		queryClient.invalidateQueries({ queryKey: USER_INVITATIONS_KEY });
		setTimeout(() => navigate("/dashboard"), 1500);
	};

	const handleReject = async () => {
		if (!invitationId) return;
		trackAuthenticationAction({
			actionName: "decline_invitation",
			sourceComponent: "accept_invitation_page",
			authMethod: "invitation",
			targetId: invitationId,
			userId:
				session?.user && "id" in session.user
					? String(session.user.id)
					: undefined,
		});
		await authClient.organization.rejectInvitation({ invitationId });
		navigate("/dashboard");
	};

	if (sessionLoading) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<Loader2 className="h-6 w-6 animate-spin text-muted" />
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 text-center">
				<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-hover">
					{status === "accepted" ? (
						<Check className="h-6 w-6 text-status-success-icon" />
					) : (
						<Building2 className="h-6 w-6 text-accent" />
					)}
				</div>

				{status === "accepted" ? (
					<>
						<h1 className="text-lg font-semibold text-heading mb-2">
							Welcome to the team!
						</h1>
						<p className="text-sm text-muted">Redirecting to dashboard...</p>
					</>
				) : (
					<>
						<h1 className="text-lg font-semibold text-heading mb-2">
							You've been invited
						</h1>
						<p className="text-sm text-muted mb-6">
							Accept this invitation to join the organization.
						</p>

						{error && <p className="text-sm text-red-500 mb-4">{error}</p>}

						<div className="flex gap-3 justify-center">
							<Button
								variant="outline"
								size="sm"
								onClick={handleReject}
								disabled={status === "accepting"}
							>
								<X className="h-4 w-4 mr-1" />
								Decline
							</Button>
							<Button
								size="sm"
								onClick={handleAccept}
								disabled={status === "accepting"}
							>
								{status === "accepting" ? (
									<Loader2 className="h-4 w-4 mr-1 animate-spin" />
								) : (
									<Check className="h-4 w-4 mr-1" />
								)}
								Accept
							</Button>
						</div>
					</>
				)}
			</div>
		</div>
	);
}
