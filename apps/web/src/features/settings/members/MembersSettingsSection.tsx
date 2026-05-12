import { Card, CardContent } from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";
import { useTrackProductPageView } from "@/features/analytics/tracking/useTrackProductPageView";
import { buildMembersSettingsTracking } from "@/features/settings/settings-page-tracking";
import { CreateWorkspaceCard } from "@/features/settings/workspace/components/CreateWorkspaceCard";
import { WorkspaceEmptyStateCard } from "@/features/settings/workspace/components/WorkspaceEmptyStateCard";
import { WorkspaceInviteMemberCard } from "@/features/settings/workspace/components/WorkspaceInviteMemberCard";
import { WorkspaceMembersCard } from "@/features/settings/workspace/components/WorkspaceMembersCard";
import { WorkspaceOutgoingInvitationsCard } from "@/features/settings/workspace/components/WorkspaceOutgoingInvitationsCard";
import { useWorkspaceSettingsData } from "@/features/settings/workspace/use-workspace-settings-data";

export function MembersSettingsSection() {
	const data = useWorkspaceSettingsData();
	const memberCount = data.fullOrg?.members.length ?? 0;
	const pendingOutgoingInvitationCount = data.pendingInvitations.length;

	useTrackProductPageView(
		buildMembersSettingsTracking({
			hasOrganization: data.state.hasOrganization,
			hasWorkspaceData: data.state.hasData,
			isPending: data.state.isPending,
			isError: data.state.isError,
			memberCount,
			pendingOutgoingInvitationCount,
			canManage: data.canManage,
		}),
	);

	if (!data.state.hasOrganization) {
		return (
			<div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[19fr_21fr]">
				<WorkspaceEmptyStateCard />
				<div id="new-workspace" className="scroll-mt-24">
					<CreateWorkspaceCard
						title="Create your first workspace"
						description="Start a workspace before inviting members."
					/>
				</div>
			</div>
		);
	}

	return (
		<>
			{data.state.isPending ? (
				<div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[3fr_2fr]">
					{["members-loading", "invite-loading"].map((key) => (
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
				<div className="px-4 lg:px-6">
					<Card
						size="sm"
						className="bg-card/95 shadow-none ring-1 ring-border/60"
					>
						<CardContent className="text-sm text-muted-foreground">
							Member data couldn&apos;t be loaded right now.
						</CardContent>
					</Card>
				</div>
			) : null}

			{!data.state.isPending && !data.state.isError && data.activeOrg ? (
				<>
					<div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[3fr_2fr]">
						<WorkspaceMembersCard
							members={data.fullOrg?.members ?? []}
							canManage={data.canManage}
							onInvalidate={data.invalidate}
						/>
						<WorkspaceInviteMemberCard
							canManage={data.canManage}
							onInvalidate={data.invalidate}
						/>
					</div>

					<div className="mt-4 px-4 lg:px-6">
						<WorkspaceOutgoingInvitationsCard
							invitations={data.pendingInvitations}
							canCancel={data.canManage}
							onInvalidate={data.invalidate}
						/>
					</div>
				</>
			) : null}
		</>
	);
}
