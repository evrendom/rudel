import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";
import { PageViewTrackingMount } from "@/features/analytics/tracking/PageViewTrackingMount";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { InvitationsCards } from "@/features/settings/invitations/components/InvitationsCards";
import { useInvitationsSettingsData } from "@/features/settings/invitations/use-invitations-settings-data";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { authClient } from "@/lib/auth-client";

const invitationSkeletonKeys = [
	"invitation-skeleton-1",
	"invitation-skeleton-2",
	"invitation-skeleton-3",
] as const;

export function InvitationsSettingsSection() {
	const data = useInvitationsSettingsData();
	const { actions } = useOrganization();
	const { trackAuthenticationAction } = useAnalyticsTracking({
		pageName: "invitations",
	});
	const [processingId, setProcessingId] = useState<string | null>(null);

	const handleAccept = async (invitationId: string) => {
		trackAuthenticationAction({
			actionName: "accept_invitation",
			sourceComponent: "invitations_settings_section",
			authMethod: "invitation",
			targetId: invitationId,
		});
		setProcessingId(invitationId);

		try {
			const response = await authClient.organization.acceptInvitation({
				invitationId,
			});
			if (response.data) {
				try {
					await actions.switchOrganization(response.data.member.organizationId);
				} catch (cause) {
					toast.error(
						cause instanceof Error
							? cause.message
							: "Invitation accepted but workspace switch failed",
					);
				}
			}
			data.invalidate();
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "Failed to accept invitation",
			);
		} finally {
			setProcessingId(null);
		}
	};

	const handleDecline = async (invitationId: string) => {
		trackAuthenticationAction({
			actionName: "decline_invitation",
			sourceComponent: "invitations_settings_section",
			authMethod: "invitation",
			targetId: invitationId,
		});
		setProcessingId(invitationId);

		try {
			await authClient.organization.rejectInvitation({ invitationId });
			data.invalidate();
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "Failed to decline invitation",
			);
		} finally {
			setProcessingId(null);
		}
	};

	return (
		<>
			<PageViewTrackingMount
				isLoading={data.state.isPending}
				hasData={data.state.hasData}
				metrics={[{ id: "pending_invitations", value: data.count }]}
				sections={[
					{
						id: "incoming_invitations",
						state: data.state.isPending
							? "hidden"
							: data.state.hasData
								? "populated"
								: "empty",
						itemCount: data.count,
					},
				]}
			/>
			<div className="px-4 lg:px-6">
				{data.state.isPending ? (
					<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
						{invitationSkeletonKeys.map((key) => (
							<Card
								key={key}
								size="sm"
								className="bg-card/95 shadow-none ring-1 ring-border/60"
							>
								<CardContent className="flex flex-col gap-4">
									<div className="flex items-start gap-3">
										<Skeleton className="size-10 rounded-xl" />
										<div className="flex flex-1 flex-col gap-2">
											<Skeleton className="h-4 w-36 rounded-md" />
											<Skeleton className="h-3 w-28 rounded-md" />
										</div>
										<Skeleton className="h-5 w-16 rounded-full" />
									</div>
									<div className="flex gap-2">
										<Skeleton className="h-7 w-20 rounded-md" />
										<Skeleton className="h-7 w-20 rounded-md" />
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				) : null}

				{!data.state.isPending && !data.state.hasData ? (
					<Card
						size="sm"
						className="bg-card/95 shadow-none ring-1 ring-border/60"
					>
						<CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
							<p className="font-medium text-foreground">
								No pending invitations
							</p>
							<p>When another workspace invites you, it will show up here.</p>
						</CardContent>
					</Card>
				) : null}

				{!data.state.isPending && data.state.hasData ? (
					<InvitationsCards
						invitations={data.invitations}
						processingId={processingId}
						onAccept={(invitationId) => void handleAccept(invitationId)}
						onDecline={(invitationId) => void handleDecline(invitationId)}
					/>
				) : null}
			</div>
		</>
	);
}
