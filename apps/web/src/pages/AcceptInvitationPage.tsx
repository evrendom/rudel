import { useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
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
		<div className="flex min-h-screen items-center justify-center px-4 py-10">
			<Card className="w-full max-w-md">
				<CardContent className="space-y-6 px-8 py-8 text-center">
					<div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
						{status === "accepted" ? (
							<Check className="h-6 w-6 text-status-success-icon" />
						) : (
							<Building2 className="h-6 w-6 text-accent" />
						)}
					</div>

					{status === "accepted" ? (
						<>
							<h1 className="font-heading text-2xl font-medium text-heading">
								Welcome to the team!
							</h1>
							<p className="text-sm text-muted-foreground">
								Redirecting to dashboard...
							</p>
						</>
					) : (
						<>
							<div className="space-y-2">
								<h1 className="font-heading text-2xl font-medium text-heading">
									You've been invited
								</h1>
								<p className="text-sm text-muted-foreground">
									Accept this invitation to join the organization.
								</p>
							</div>

							{error ? (
								<p className="rounded-3xl border border-status-error-border bg-status-error-bg px-4 py-3 text-sm text-status-error-text">
									{error}
								</p>
							) : null}

							<div className="flex justify-center gap-3">
								<Button
									variant="outline"
									size="sm"
									onClick={handleReject}
									disabled={status === "accepting"}
								>
									<X className="mr-1 h-4 w-4" />
									Decline
								</Button>
								<Button
									size="sm"
									onClick={handleAccept}
									disabled={status === "accepting"}
								>
									{status === "accepting" ? (
										<Loader2 className="mr-1 h-4 w-4 animate-spin" />
									) : (
										<Check className="mr-1 h-4 w-4" />
									)}
									Accept
								</Button>
							</div>
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
