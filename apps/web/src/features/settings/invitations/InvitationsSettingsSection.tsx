import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";
import { useOrganization } from "@/contexts/OrganizationContext";
import { InvitationsCards } from "@/features/settings/invitations/components/InvitationsCards";
import { useInvitationsSettingsData } from "@/features/settings/invitations/use-invitations-settings-data";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import {
	type DashboardMetric,
	type DashboardSection,
	useTrackDashboardView,
} from "@/hooks/useTrackDashboardView";
import { authClient } from "@/lib/auth-client";

const invitationSkeletonKeys = [
	"invitation-skeleton-1",
	"invitation-skeleton-2",
	"invitation-skeleton-3",
] as const;

export function InvitationsSettingsSection() {
	const data = useInvitationsSettingsData();
	const { switchOrg } = useOrganization();
	const { trackAuthenticationAction } = useAnalyticsTracking({
		pageName: "invitations",
	});
	const [processingId, setProcessingId] = useState<string | null>(null);
	const metrics: DashboardMetric[] = [
		{ id: "pending_invitations", value: data.count },
	];
	const sections: DashboardSection[] = [
		{
			id: "incoming_invitations",
			itemCount: data.count,
			state: data.state.isPending
				? "hidden"
				: data.state.hasData
					? "populated"
					: "empty",
		},
	];

	useTrackDashboardView({
		hasData: data.state.hasData,
		isLoading: data.state.isPending,
		metrics,
		sections,
	});

	async function handleAccept(invitationId: string) {
		trackAuthenticationAction({
			actionName: "accept_invitation",
			authMethod: "invitation",
			sourceComponent: "invitations_settings_section",
			targetId: invitationId,
		});
		setProcessingId(invitationId);

		try {
			const response = await authClient.organization.acceptInvitation({
				invitationId,
			});
			if (response.data) {
				await switchOrg(response.data.member.organizationId);
			}
			data.invalidate();
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "Failed to accept invitation",
			);
		} finally {
			setProcessingId(null);
		}
	}

	async function handleDecline(invitationId: string) {
		trackAuthenticationAction({
			actionName: "decline_invitation",
			authMethod: "invitation",
			sourceComponent: "invitations_settings_section",
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
	}

	return (
		<div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
					Invitations
				</h1>
				<p className="max-w-2xl text-sm text-muted-foreground">
					Review pending workspace invitations and accept or decline them from
					one place.
				</p>
			</div>

			{data.state.isPending ? (
				<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
					{invitationSkeletonKeys.map((key) => (
						<Card
							className="bg-card/95 shadow-none ring-1 ring-border/60"
							key={key}
							size="sm"
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
					className="bg-card/95 shadow-none ring-1 ring-border/60"
					size="sm"
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
					onAccept={(invitationId) => void handleAccept(invitationId)}
					onDecline={(invitationId) => void handleDecline(invitationId)}
					processingId={processingId}
				/>
			) : null}
		</div>
	);
}
