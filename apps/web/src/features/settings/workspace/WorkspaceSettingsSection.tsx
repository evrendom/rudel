import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";
import { useInvitationsSettingsData } from "@/features/settings/invitations/use-invitations-settings-data";
import { CreateWorkspaceCard } from "@/features/settings/workspace/components/CreateWorkspaceCard";
import { WorkspaceEmptyStateCard } from "@/features/settings/workspace/components/WorkspaceEmptyStateCard";
import { WorkspaceIdentityCard } from "@/features/settings/workspace/components/WorkspaceIdentityCard";
import { WorkspaceIncomingInvitationsCard } from "@/features/settings/workspace/components/WorkspaceIncomingInvitationsCard";
import { WorkspaceInviteMemberCard } from "@/features/settings/workspace/components/WorkspaceInviteMemberCard";
import { WorkspaceMembersCard } from "@/features/settings/workspace/components/WorkspaceMembersCard";
import { WorkspaceOutgoingInvitationsCard } from "@/features/settings/workspace/components/WorkspaceOutgoingInvitationsCard";
import { WorkspaceSummaryStrip } from "@/features/settings/workspace/components/WorkspaceSummaryStrip";
import { useWorkspaceSettingsData } from "@/features/settings/workspace/use-workspace-settings-data";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import {
	type DashboardMetric,
	type DashboardSection,
	useTrackDashboardView,
} from "@/hooks/useTrackDashboardView";
import { authClient } from "@/lib/auth-client";

export function WorkspaceSettingsSection() {
	const data = useWorkspaceSettingsData();
	const invitationsData = useInvitationsSettingsData();
	const { trackAuthenticationAction } = useAnalyticsTracking({
		organizationId: data.activeOrg?.id ?? null,
		pageName: "organization",
	});
	const [processingInvitationId, setProcessingInvitationId] = useState<
		string | null
	>(null);

	const memberCount = data.fullOrg?.members.length ?? 0;
	const pendingOutgoingInvitationCount = data.pendingInvitations.length;
	const pendingIncomingInvitationCount = invitationsData.count;
	const trackingMetrics: DashboardMetric[] = [
		{ id: "members", value: memberCount },
		{
			id: "pending_outgoing_invitations",
			value: pendingOutgoingInvitationCount,
		},
		{
			id: "pending_incoming_invitations",
			value: pendingIncomingInvitationCount,
		},
	];
	const trackingSections: DashboardSection[] = [
		{
			id: "organization_identity",
			state: data.state.hasOrganization ? "populated" : "empty",
		},
		{
			id: "organization_members",
			state: data.state.isPending
				? "hidden"
				: memberCount > 0
					? "populated"
					: "empty",
			itemCount: memberCount,
		},
		{
			id: "organization_outgoing_invitations",
			state: data.state.isPending
				? "hidden"
				: pendingOutgoingInvitationCount > 0
					? "populated"
					: "empty",
			itemCount: pendingOutgoingInvitationCount,
		},
		{
			id: "incoming_invitations",
			state: invitationsData.state.isPending
				? "hidden"
				: pendingIncomingInvitationCount > 0
					? "populated"
					: "empty",
			itemCount: pendingIncomingInvitationCount,
		},
	];

	useTrackDashboardView({
		isLoading: data.state.isPending || invitationsData.state.isPending,
		hasData: data.state.hasOrganization || pendingIncomingInvitationCount > 0,
		metrics: trackingMetrics,
		sections: trackingSections,
	});

	async function handleAcceptInvitation(invitationId: string) {
		trackAuthenticationAction({
			actionName: "accept_invitation",
			authMethod: "invitation",
			sourceComponent: "workspace_settings_section",
			targetId: invitationId,
		});
		setProcessingInvitationId(invitationId);

		try {
			const response = await authClient.organization.acceptInvitation({
				invitationId,
			});

			if (response.data) {
				await data.switchOrg(response.data.member.organizationId);
			}

			data.invalidate();
			invitationsData.invalidate();
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "Failed to accept invitation",
			);
		} finally {
			setProcessingInvitationId(null);
		}
	}

	async function handleDeclineInvitation(invitationId: string) {
		trackAuthenticationAction({
			actionName: "decline_invitation",
			authMethod: "invitation",
			sourceComponent: "workspace_settings_section",
			targetId: invitationId,
		});
		setProcessingInvitationId(invitationId);

		try {
			await authClient.organization.rejectInvitation({ invitationId });
			invitationsData.invalidate();
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "Failed to decline invitation",
			);
		} finally {
			setProcessingInvitationId(null);
		}
	}

	if (!data.state.hasOrganization) {
		return (
			<div className="grid gap-4 px-4 py-4 lg:px-6 xl:grid-cols-[19fr_21fr]">
				<WorkspaceEmptyStateCard />
				<div id="new-workspace" className="scroll-mt-24">
					<CreateWorkspaceCard
						title="Create your first workspace"
						description="Start a workspace for your team, client, or project."
					/>
				</div>
				<div className="xl:col-span-2" id="incoming-invitations">
					<WorkspaceIncomingInvitationsCard
						invitations={invitationsData.invitations}
						isPending={invitationsData.state.isPending}
						processingId={processingInvitationId}
						onAccept={(invitationId) =>
							void handleAcceptInvitation(invitationId)
						}
						onDecline={(invitationId) =>
							void handleDeclineInvitation(invitationId)
						}
					/>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
			<div className="flex flex-col gap-1">
				<h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
					Workspace settings
				</h1>
				<p className="max-w-3xl text-sm text-muted-foreground">
					Manage the active workspace, invite teammates, and keep membership
					access organized in one place.
				</p>
			</div>

			<WorkspaceSummaryStrip
				tiles={data.summaryTiles}
				isPending={data.state.isPending}
			/>

			{data.state.isPending ? (
				<div className="grid gap-4 xl:grid-cols-2">
					{["workspace-loading-1", "workspace-loading-2"].map((key) => (
						<Card
							key={key}
							size="sm"
							className="bg-card/95 shadow-none ring-1 ring-border/60"
						>
							<CardContent className="flex flex-col gap-4">
								<Skeleton className="h-5 w-40 rounded-md" />
								<div className="flex flex-col gap-2">
									<Skeleton className="h-10 w-full rounded-md" />
									<Skeleton className="h-10 w-full rounded-md" />
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			) : null}

			{!data.state.isPending && data.activeOrg ? (
				<>
					<div className="grid gap-4 xl:grid-cols-[21fr_19fr]">
						<WorkspaceIdentityCard
							canManage={data.canManage}
							onInvalidate={data.invalidate}
							organization={data.activeOrg}
						/>
						<WorkspaceInviteMemberCard
							canManage={data.canManage}
							onInvalidate={data.invalidate}
						/>
					</div>

					<div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
						<WorkspaceMembersCard
							canManage={data.canManage}
							members={data.fullOrg?.members ?? []}
							onInvalidate={data.invalidate}
						/>
						<WorkspaceOutgoingInvitationsCard
							canCancel={data.canManage}
							invitations={data.pendingInvitations}
							onInvalidate={data.invalidate}
						/>
					</div>

					<div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
						<WorkspaceIncomingInvitationsCard
							invitations={invitationsData.invitations}
							isPending={invitationsData.state.isPending}
							processingId={processingInvitationId}
							onAccept={(invitationId) =>
								void handleAcceptInvitation(invitationId)
							}
							onDecline={(invitationId) =>
								void handleDeclineInvitation(invitationId)
							}
						/>
						<CreateWorkspaceCard title="Create another workspace" />
					</div>
				</>
			) : null}
		</div>
	);
}
