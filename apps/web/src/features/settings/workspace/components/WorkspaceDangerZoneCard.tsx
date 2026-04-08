import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { Button } from "@/app/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { DeleteWorkspaceDialog } from "@/features/settings/workspace/components/DeleteWorkspaceDialog";
import { authClient } from "@/lib/auth-client";

export function WorkspaceDangerZoneCard({
	organization,
	organizations,
	canManage,
}: {
	organization: { id: string; name: string };
	organizations: readonly { id: string; name: string }[];
	canManage: boolean;
}) {
	const navigate = useNavigate();
	const { trackOrganizationAction } = useAnalyticsTracking({
		pageName: "organization",
	});
	const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

	return (
		<>
			<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
				<CardHeader>
					<CardTitle>Danger zone</CardTitle>
					<CardDescription>
						Delete this workspace when you no longer need any of its data or
						member access.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-wrap items-center gap-3">
					{organizations.length <= 1 ? (
						<Button type="button" variant="destructive" disabled>
							Delete workspace
						</Button>
					) : (
						<Button
							type="button"
							variant="destructive"
							onClick={() => {
								trackOrganizationAction({
									actionName: "open_delete_organization",
									targetType: "organization",
									sourceComponent: "workspace_settings_section",
									targetId: organization.id,
								});
								setIsDeleteDialogOpen(true);
							}}
							disabled={!canManage}
						>
							Delete workspace
						</Button>
					)}
					{organizations.length <= 1 ? (
						<span className="text-sm text-muted-foreground">
							You can&apos;t delete your only workspace.
						</span>
					) : null}
				</CardContent>
			</Card>

			<DeleteWorkspaceDialog
				open={isDeleteDialogOpen}
				onOpenChange={setIsDeleteDialogOpen}
				organization={organization}
				onDeleted={async () => {
					setIsDeleteDialogOpen(false);
					const otherOrganization = organizations.find(
						(candidate) => candidate.id !== organization.id,
					);
					if (otherOrganization) {
						await authClient.organization.setActive({
							organizationId: otherOrganization.id,
						});
					}
					for (const key of Object.keys(authClient.$store.atoms)) {
						if (key.startsWith("$")) {
							authClient.$store.notify(key);
						}
					}
					navigate(appRoutes.dashboard());
				}}
			/>
		</>
	);
}
