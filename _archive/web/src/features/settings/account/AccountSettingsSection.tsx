import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { appRoutes } from "@/app/routes";
import { Card, CardContent } from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";
import {
	type PageMetric,
	type PageSection,
	PageViewTrackingMount,
} from "@/features/analytics/tracking/PageViewTrackingMount";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { AccountDangerZoneCard } from "@/features/settings/account/components/AccountDangerZoneCard";
import { ProfileLinkedAccountsCard } from "@/features/settings/account/components/ProfileLinkedAccountsCard";
import { ProfileOverviewCard } from "@/features/settings/account/components/ProfileOverviewCard";
import { useAccountSettingsData } from "@/features/settings/account/use-account-settings-data";
import { useInvitationsSettingsData } from "@/features/settings/invitations/use-invitations-settings-data";
import { WorkspaceIncomingInvitationsCard } from "@/features/settings/workspace/components/WorkspaceIncomingInvitationsCard";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { authClient, signOut } from "@/lib/auth-client";

export function AccountSettingsSection() {
	const navigate = useNavigate();
	const data = useAccountSettingsData();
	const invitationsData = useInvitationsSettingsData();
	const { actions } = useOrganization();
	const { trackAuthenticationAction } = useAnalyticsTracking();
	const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
	const [processingInvitationId, setProcessingInvitationId] = useState<
		string | null
	>(null);
	const [isSigningOut, setIsSigningOut] = useState(false);

	const handleLinkProvider = (provider: "google" | "github") => {
		trackAuthenticationAction({
			actionName: "link_provider",
			sourceComponent: "account_settings_section",
			targetId: provider,
			authMethod: provider,
		});
		setLinkingProvider(provider);
		authClient.linkSocial({
			provider,
			callbackURL: `${window.location.origin}${appRoutes.settingsAccount()}`,
		});
	};

	const handleSignOut = async () => {
		trackAuthenticationAction({
			actionName: "sign_out",
			sourceComponent: "account_settings_section",
			authMethod: "session",
		});
		setIsSigningOut(true);
		try {
			await signOut();
			navigate("/");
		} catch (cause) {
			setIsSigningOut(false);
			toast.error(
				cause instanceof Error ? cause.message : "Failed to sign out",
			);
		}
	};
	const handleAcceptInvitation = async (invitationId: string) => {
		trackAuthenticationAction({
			actionName: "accept_invitation",
			sourceComponent: "account_settings_section",
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
			invitationsData.invalidate();
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "Failed to accept invitation",
			);
		} finally {
			setProcessingInvitationId(null);
		}
	};

	const handleAccountDeleted = async () => {
		try {
			await signOut();
		} catch (error) {
			void error;
		}
		navigate("/");
		toast.success("Account deleted");
	};

	const handleDeclineInvitation = async (invitationId: string) => {
		trackAuthenticationAction({
			actionName: "decline_invitation",
			sourceComponent: "account_settings_section",
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
			id: "linked_accounts",
			value: data.linkedProviders.size,
		},
		{
			id: "pending_workspace_invitations",
			value: invitationsData.count,
		},
	];
	const trackingSections: PageSection[] = [
		{
			id: "profile_summary",
			state: data.state.hasData ? "populated" : "empty",
		},
		{
			id: "linked_accounts",
			state: data.state.isPending
				? "hidden"
				: data.linkedProviders.size > 0
					? "populated"
					: "empty",
			itemCount: data.linkedProviders.size,
		},
		{
			id: "workspace_invitations",
			state: invitationsData.state.isPending
				? "hidden"
				: invitationsData.state.hasData
					? "populated"
					: "empty",
			itemCount: invitationsData.count,
		},
		{
			id: "account_deletion",
			state: data.state.hasData ? "populated" : "hidden",
		},
	];

	return (
		<>
			<PageViewTrackingMount
				isLoading={data.state.isPending || invitationsData.state.isPending}
				hasData={data.state.hasData}
				metrics={trackingMetrics}
				sections={trackingSections}
			/>
			{data.state.isPending ? (
				<div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[1.05fr_1fr]">
					<Card
						size="sm"
						className="bg-card/95 shadow-none ring-1 ring-border/60"
					>
						<CardContent className="flex flex-col gap-4">
							<div className="flex items-center gap-4">
								<Skeleton className="size-10 rounded-full" />
								<div className="flex flex-1 flex-col gap-2">
									<Skeleton className="h-4 w-32 rounded-md" />
									<Skeleton className="h-3 w-40 rounded-md" />
								</div>
							</div>
							<Skeleton className="h-9 w-full rounded-md" />
							<Skeleton className="h-8 w-28 rounded-md" />
						</CardContent>
					</Card>
					<Card
						size="sm"
						className="bg-card/95 shadow-none ring-1 ring-border/60"
					>
						<CardContent className="flex flex-col gap-3">
							{["provider-1", "provider-2", "provider-3"].map((key) => (
								<div key={key} className="flex items-center justify-between">
									<div className="flex flex-col gap-2">
										<Skeleton className="h-4 w-28 rounded-md" />
										<Skeleton className="h-3 w-40 rounded-md" />
									</div>
									<Skeleton className="h-7 w-20 rounded-md" />
								</div>
							))}
						</CardContent>
					</Card>
				</div>
			) : (
				<div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[1.05fr_1fr]">
					<ProfileOverviewCard
						name={data.user.name}
						email={data.user.email}
						image={data.user.image}
						isSigningOut={isSigningOut}
						onSignOut={() => void handleSignOut()}
					/>
					<ProfileLinkedAccountsCard
						isPending={data.state.isPending}
						linkedProviders={data.linkedProviders}
						linkingProvider={linkingProvider}
						onLinkProvider={handleLinkProvider}
					/>
				</div>
			)}
			<div
				id="workspace-invitations"
				className="mt-4 px-4 lg:px-6 scroll-mt-24"
			>
				<WorkspaceIncomingInvitationsCard
					title="Workspace invitations"
					description="Accept or decline workspace invites sent to your account."
					invitations={invitationsData.invitations}
					isPending={invitationsData.state.isPending}
					processingId={processingInvitationId}
					onAccept={(invitationId) => void handleAcceptInvitation(invitationId)}
					onDecline={(invitationId) =>
						void handleDeclineInvitation(invitationId)
					}
				/>
			</div>
			{data.state.hasData ? (
				<div id="delete-account" className="mt-4 px-4 lg:px-6 scroll-mt-24">
					<AccountDangerZoneCard
						user={{ email: data.user.email, name: data.user.name }}
						onDeleted={handleAccountDeleted}
					/>
				</div>
			) : null}
		</>
	);
}
