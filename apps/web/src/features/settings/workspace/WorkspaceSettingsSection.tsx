import { PlusIcon } from "lucide-react"
import { Link } from "react-router-dom"
import {
	PageViewTrackingMount,
	type PageMetric,
	type PageSection,
} from "@/features/analytics/tracking/PageViewTrackingMount"
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking"
import { appRoutes } from "@/app/routes"
import { Badge } from "@/app/ui/badge"
import { buttonVariants } from "@/app/ui/button"
import { Card, CardContent } from "@/app/ui/card"
import { Skeleton } from "@/app/ui/skeleton"
import { SettingsSectionIntro } from "@/features/settings/components/SettingsSectionIntro"
import { useWorkspaceSettingsData } from "@/features/settings/workspace/use-workspace-settings-data"
import { WorkspaceDangerZoneCard } from "@/features/settings/workspace/components/WorkspaceDangerZoneCard"
import { WorkspaceEmptyStateCard } from "@/features/settings/workspace/components/WorkspaceEmptyStateCard"
import { WorkspaceIdentityCard } from "@/features/settings/workspace/components/WorkspaceIdentityCard"
import { WorkspaceInviteMemberCard } from "@/features/settings/workspace/components/WorkspaceInviteMemberCard"
import { WorkspaceMembersCard } from "@/features/settings/workspace/components/WorkspaceMembersCard"
import { WorkspaceOutgoingInvitationsCard } from "@/features/settings/workspace/components/WorkspaceOutgoingInvitationsCard"
import { WorkspaceSummaryStrip } from "@/features/settings/workspace/components/WorkspaceSummaryStrip"

export function WorkspaceSettingsSection() {
	const data = useWorkspaceSettingsData()
	const { trackNavigation } = useAnalyticsTracking({
		pageName: "organization",
		organizationId: data.activeOrg?.id ?? null,
	})
	const memberCount = data.fullOrg?.members.length ?? 0
	const pendingInvitationCount = data.pendingInvitations.length
	const trackingMetrics: PageMetric[] = [
		{
			id: "members",
			value: memberCount,
		},
		{
			id: "pending_invitations",
			value: pendingInvitationCount,
		},
	]
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
				: pendingInvitationCount > 0
					? "populated"
					: "empty",
			itemCount: pendingInvitationCount,
		},
	]

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
						description="Create a workspace to manage members and invitations here."
						action={<Badge variant="outline">Workspace</Badge>}
					/>
				</div>

				<div className="px-4 lg:px-6">
					<WorkspaceEmptyStateCard />
				</div>
			</>
		)
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
					description="Manage the active workspace, members, and outgoing invitations."
					action={
						<Link
							to={appRoutes.settingsCreateWorkspace()}
							className={buttonVariants({ variant: "outline", size: "sm" })}
							onClick={() =>
								trackNavigation({
									navType: "organization_page",
									sourceComponent: "workspace_settings_section",
									targetPath: appRoutes.settingsCreateWorkspace(),
									targetType: "page",
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
				<div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-2">
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
				<div className="px-4 lg:px-6">
					<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
						<CardContent className="text-sm text-muted-foreground">
							Organization data couldn&apos;t be loaded right now.
						</CardContent>
					</Card>
				</div>
			) : null}

			{!data.state.isPending && !data.state.isError && data.activeOrg ? (
				<>
					<div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[1.05fr_1fr]">
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

					<div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[1.5fr_1fr]">
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

					<div className="px-4 lg:px-6">
						<WorkspaceDangerZoneCard
							organization={data.activeOrg}
							organizations={data.organizations}
							canManage={data.canManage}
						/>
					</div>
				</>
			) : null}
		</>
	)
}
