import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { appRoutes } from "@/app/routes";
import { buttonVariants } from "@/app/ui/button";
import { Card, CardContent } from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";
import {
	type PageMetric,
	type PageSection,
	PageViewTrackingMount,
} from "@/features/analytics/tracking/PageViewTrackingMount";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { SettingsSectionIntro } from "@/features/settings/components/SettingsSectionIntro";
import { useInvitationsSettingsData } from "@/features/settings/invitations/use-invitations-settings-data";
import { CreateWorkspaceCard } from "@/features/settings/workspace/components/CreateWorkspaceCard";
import { WorkspaceDangerZoneCard } from "@/features/settings/workspace/components/WorkspaceDangerZoneCard";
import { WorkspaceEmptyStateCard } from "@/features/settings/workspace/components/WorkspaceEmptyStateCard";
import { WorkspaceIdentityCard } from "@/features/settings/workspace/components/WorkspaceIdentityCard";
import { WorkspaceIncomingInvitationsCard } from "@/features/settings/workspace/components/WorkspaceIncomingInvitationsCard";
import { WorkspaceInviteMemberCard } from "@/features/settings/workspace/components/WorkspaceInviteMemberCard";
import { WorkspaceMembersCard } from "@/features/settings/workspace/components/WorkspaceMembersCard";
import { WorkspaceOutgoingInvitationsCard } from "@/features/settings/workspace/components/WorkspaceOutgoingInvitationsCard";
import { WorkspaceSummaryStrip } from "@/features/settings/workspace/components/WorkspaceSummaryStrip";
import { useWorkspaceSettingsData } from "@/features/settings/workspace/use-workspace-settings-data";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { authClient } from "@/lib/auth-client";

export function WorkspaceSettingsSection() {
	const data = useWorkspaceSettingsData();
	const invitationsData = useInvitationsSettingsData();
	const { actions } = useOrganization();
	const { trackAuthenticationAction, trackNavigation } = useAnalyticsTracking({
		pageName: "organization",
		organizationId: data.activeOrg?.id ?? null,
	});
	const [processingInvitationId, setProcessingInvitationId] = useState<
		string | null
	>(null);
	const memberCount = data.fullOrg?.members.length ?? 0;
	const pendingOutgoingInvitationCount = data.pendingInvitations.length;
	const pendingIncomingInvitationCount = invitationsData.count;

	const handleAcceptInvitation = async (invitationId: string) => {
		trackAuthenticationAction({
			actionName: "accept_invitation",
			sourceComponent: "workspace_settings_section",
			authMethod: "invitation",
			targetId: invitationId,
		});
		setProcessingInvitationId(invitationId);

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
			invitationsData.invalidate();
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "Failed to accept invitation",
			);
		} finally {
			setProcessingInvitationId(null);
		}
	};

	const handleDeclineInvitation = async (invitationId: string) => {
		trackAuthenticationAction({
			actionName: "decline_invitation",
			sourceComponent: "workspace_settings_section",
			authMethod: "invitation",
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
	};

	const trackingMetrics: PageMetric[] = [
		{
			id: "members",
			value: memberCount,
		},
		{
			id: "pending_outgoing_invitations",
			value: pendingOutgoingInvitationCount,
		},
		{
			id: "pending_incoming_invitations",
			value: pendingIncomingInvitationCount,
		},
	];
	const trackingSections: PageSection[] = [
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

	if (!data.state.hasOrganization) {
		return (
			<>
				<PageViewTrackingMount
					isLoading={data.state.isPending}
					isError={data.state.isError}
					hasData={data.state.hasOrganization}
					metrics={trackingMetrics}
					sections={trackingSections}
				/>
				<div className="px-4 lg:px-6">
					<SettingsSectionIntro
						title="Workspace"
						description="Create your first workspace, or accept an invite to join one that already exists."
						action={
							<Link
								to="#new-workspace"
								className={buttonVariants({ variant: "outline", size: "sm" })}
								onClick={() =>
									trackNavigation({
										navType: "organization_page",
										sourceComponent: "workspace_settings_section",
										targetPath: `${appRoutes.settingsWorkspace()}#new-workspace`,
										targetType: "section",
										toPageName: "organization_create",
									})
								}
							>
								<PlusIcon data-icon="inline-start" />
								Create workspace
							</Link>
						}
					/>
				</div>

				<div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[19fr_21fr]">
					<WorkspaceEmptyStateCard />
					<div id="new-workspace" className="scroll-mt-24">
						<CreateWorkspaceCard
							title="Create your first workspace"
							description="Start a workspace for your team, client, or project."
						/>
					</div>
				</div>

				<div
					id="incoming-invitations"
					className="mt-4 px-4 lg:px-6 scroll-mt-24"
				>
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
			</>
		);
	}

	return (
		<>
			<PageViewTrackingMount
				isLoading={data.state.isPending}
				isError={data.state.isError}
				hasData={data.state.hasOrganization}
				metrics={trackingMetrics}
				sections={trackingSections}
			/>
			<div className="px-4 lg:px-6">
				<SettingsSectionIntro
					title="Workspace"
					description="Manage the active workspace, team access, and any other workspace invitations tied to your account."
					action={
						<Link
							to="#new-workspace"
							className={buttonVariants({ variant: "outline", size: "sm" })}
							onClick={() =>
								trackNavigation({
									navType: "organization_page",
									sourceComponent: "workspace_settings_section",
									targetPath: `${appRoutes.settingsWorkspace()}#new-workspace`,
									targetType: "section",
									toPageName: "organization_create",
								})
							}
						>
							<PlusIcon data-icon="inline-start" />
							Create workspace
						</Link>
					}
				/>
			</div>

			<div className="px-4 lg:px-6">
				<WorkspaceSummaryStrip
					tiles={data.summaryTiles}
					isPending={data.state.isPending}
					isError={Boolean(data.state.isError)}
				/>
			</div>

			{data.state.isPending ? (
				<div className="mt-4 grid gap-4 px-4 lg:px-6 xl:grid-cols-2">
					{["org-loading-1", "org-loading-2"].map((key) => (
						<Card
							key={key}
							size="sm"
							className="bg-card/95 shadow-none ring-1 ring-border/60"
						>
							<CardContent className="flex flex-col gap-4">
								<Skeleton className="h-5 w-40 rounded-md" />
								<div className="flex flex-col gap-2">
									<Skeleton className="h-8 w-full rounded-md" />
									<Skeleton className="h-8 w-full rounded-md" />
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			) : null}

			{!data.state.isPending && data.state.isError ? (
				<div className="mt-4 px-4 lg:px-6">
					<Card
						size="sm"
						className="bg-card/95 shadow-none ring-1 ring-border/60"
					>
						<CardContent className="text-sm text-muted-foreground">
							Organization data couldn&apos;t be loaded right now.
						</CardContent>
					</Card>
				</div>
			) : null}

			{!data.state.isPending && !data.state.isError && data.activeOrg ? (
				<>
					<div className="mt-4 grid gap-4 px-4 lg:px-6 xl:grid-cols-[21fr_19fr]">
						<WorkspaceIdentityCard
							organization={data.activeOrg}
							canManage={data.canManage}
							onInvalidate={data.invalidate}
						/>
						<WorkspaceInviteMemberCard
							canManage={data.canManage}
							onInvalidate={data.invalidate}
						/>
					</div>

					<div className="mt-4 grid gap-4 px-4 lg:px-6 xl:grid-cols-[3fr_2fr]">
						<WorkspaceMembersCard
							members={data.fullOrg?.members ?? []}
							canManage={data.canManage}
							onInvalidate={data.invalidate}
						/>
						<WorkspaceOutgoingInvitationsCard
							invitations={data.pendingInvitations}
							canCancel={data.canManage}
							onInvalidate={data.invalidate}
						/>
					</div>

					<div className="mt-4 grid gap-4 px-4 lg:px-6 xl:grid-cols-[3fr_2fr]">
						<div id="incoming-invitations" className="scroll-mt-24">
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

						<div id="new-workspace" className="scroll-mt-24">
							<CreateWorkspaceCard title="Create another workspace" />
						</div>
					</div>

					<div className="mt-4 px-4 lg:px-6">
						<WorkspaceDangerZoneCard
							organization={data.activeOrg}
							organizations={data.organizations}
							canManage={data.canManage}
						/>
					</div>
				</>
			) : null}
		</>
	);
}
