import { Card, CardContent } from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";
import {
	type PageViewMetric,
	type PageViewSection,
	useTrackProductPageView,
} from "@/features/analytics/tracking/useTrackProductPageView";
import { CreateWorkspaceCard } from "@/features/settings/workspace/components/CreateWorkspaceCard";
import { WorkspaceDangerZoneCard } from "@/features/settings/workspace/components/WorkspaceDangerZoneCard";
import { WorkspaceEmptyStateCard } from "@/features/settings/workspace/components/WorkspaceEmptyStateCard";
import { WorkspaceIdentityCard } from "@/features/settings/workspace/components/WorkspaceIdentityCard";
import { WorkspaceSummaryStrip } from "@/features/settings/workspace/components/WorkspaceSummaryStrip";
import { useWorkspaceSettingsData } from "@/features/settings/workspace/use-workspace-settings-data";

export function WorkspaceSettingsSection() {
	const data = useWorkspaceSettingsData();
	const memberCount = data.fullOrg?.members.length ?? 0;
	const pendingOutgoingInvitationCount = data.pendingInvitations.length;
	const trackingMetrics: PageViewMetric[] = [
		{
			id: "members",
			value: memberCount,
		},
		{
			id: "pending_outgoing_invitations",
			value: pendingOutgoingInvitationCount,
		},
	];
	const trackingSections: PageViewSection[] = [
		{
			id: "organization_identity",
			state: data.state.hasOrganization ? "populated" : "empty",
		},
		{
			id: "workspace_creation",
			state: "populated",
		},
		{
			id: "workspace_deletion",
			state: data.state.hasOrganization ? "populated" : "hidden",
		},
	];

	useTrackProductPageView({
		isLoading: data.state.isPending,
		isError: data.state.isError,
		hasData: data.state.hasOrganization,
		metrics: trackingMetrics,
		sections: trackingSections,
	});

	if (!data.state.hasOrganization) {
		return (
			<div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[19fr_21fr]">
				<WorkspaceEmptyStateCard />
				<div id="new-workspace" className="scroll-mt-24">
					<CreateWorkspaceCard
						title="Create your first workspace"
						description="Start a workspace for your team, client, or project."
					/>
				</div>
			</div>
		);
	}

	return (
		<>
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
						<div id="new-workspace" className="scroll-mt-24">
							<CreateWorkspaceCard title="Create another workspace" />
						</div>
					</div>

					<div className="mt-4 px-4 lg:px-6">
						<WorkspaceDangerZoneCard />
					</div>
				</>
			) : null}
		</>
	);
}
