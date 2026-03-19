import { Building2, Check, Loader2, Mail, X } from "lucide-react";
import { useState } from "react";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { PageHeader } from "@/components/analytics/PageHeader";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useUiControlTracking } from "@/hooks/useDashboardAnalytics";
import { useTrackDashboardView } from "@/hooks/useTrackDashboardView";
import { useUserInvitations } from "@/hooks/useUserInvitations";
import { authClient } from "@/lib/auth-client";

export function InvitationsPage() {
	const { invitations, isLoading, invalidate } = useUserInvitations();
	const { switchOrg } = useOrganization();
	const [processingId, setProcessingId] = useState<string | null>(null);
	const { trackUiControl } = useUiControlTracking();

	useTrackDashboardView({
		isLoading,
		hasData: invitations.length > 0,
	});

	const handleAccept = async (invitationId: string) => {
		trackUiControl({
			controlName: "invitation_accept",
			controlType: "button",
			interactionType: "click",
			value: invitationId,
		});
		setProcessingId(invitationId);
		const res = await authClient.organization.acceptInvitation({
			invitationId,
		});
		if (res.data) {
			await switchOrg(res.data.member.organizationId);
		}
		invalidate();
		setProcessingId(null);
	};

	const handleDecline = async (invitationId: string) => {
		trackUiControl({
			controlName: "invitation_decline",
			controlType: "button",
			interactionType: "click",
			value: invitationId,
		});
		setProcessingId(invitationId);
		await authClient.organization.rejectInvitation({ invitationId });
		invalidate();
		setProcessingId(null);
	};

	if (isLoading) {
		return (
			<div className="px-8 py-6">
				<PageHeader
					title="Invitations"
					description="Pending invitations to join organizations"
				/>
				<AnalyticsCard>
					<div className="flex items-center justify-center py-12 text-muted gap-2">
						<Loader2 className="h-4 w-4 animate-spin" />
						<span>Loading invitations...</span>
					</div>
				</AnalyticsCard>
			</div>
		);
	}

	return (
		<div className="px-8 py-6">
			<PageHeader
				title="Invitations"
				description="Pending invitations to join organizations"
			/>

			{invitations.length === 0 ? (
				<AnalyticsCard>
					<div className="text-center py-12">
						<div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-hover">
							<Mail className="h-6 w-6 text-muted" />
						</div>
						<p className="text-lg font-medium text-foreground mb-1">
							No pending invitations
						</p>
						<p className="text-sm text-muted">
							When someone invites you to an organization, it will appear here.
						</p>
					</div>
				</AnalyticsCard>
			) : (
				<div className="space-y-4">
					{invitations.map((invitation) => {
						const isProcessing = processingId === invitation.id;
						return (
							<AnalyticsCard key={invitation.id}>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-4">
										<div className="flex h-10 w-10 items-center justify-center rounded-full bg-hover">
											<Building2 className="h-5 w-5 text-accent" />
										</div>
										<div>
											<p className="text-sm font-semibold text-heading">
												{invitation.organizationName}
											</p>
											<div className="flex items-center gap-2 mt-0.5">
												<span className="inline-flex items-center rounded-full bg-hover px-2 py-0.5 text-xs font-medium text-subheading">
													{invitation.role}
												</span>
												<span className="text-xs text-muted">
													Invited{" "}
													{new Date(invitation.createdAt).toLocaleDateString()}
												</span>
											</div>
										</div>
									</div>
									<div className="flex items-center gap-2">
										<Button
											variant="outline"
											size="sm"
											onClick={() => handleDecline(invitation.id)}
											disabled={isProcessing}
										>
											{isProcessing ? (
												<Loader2 className="h-4 w-4 mr-1 animate-spin" />
											) : (
												<X className="h-4 w-4 mr-1" />
											)}
											Decline
										</Button>
										<Button
											size="sm"
											onClick={() => handleAccept(invitation.id)}
											disabled={isProcessing}
										>
											{isProcessing ? (
												<Loader2 className="h-4 w-4 mr-1 animate-spin" />
											) : (
												<Check className="h-4 w-4 mr-1" />
											)}
											Accept
										</Button>
									</div>
								</div>
							</AnalyticsCard>
						);
					})}
				</div>
			)}
		</div>
	);
}
