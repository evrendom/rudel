import { useState } from "react";
import { toast } from "sonner";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { WorkspaceOutgoingInvitationsTable } from "@/features/settings/workspace/components/WorkspaceOutgoingInvitationsTable";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { authClient } from "@/lib/auth-client";

export function WorkspaceOutgoingInvitationsCard({
	canCancel,
	invitations,
	onInvalidate,
}: {
	canCancel: boolean;
	invitations: readonly {
		createdAt?: string;
		email: string;
		id: string;
		role: string | null;
		status: string;
	}[];
	onInvalidate: () => void;
}) {
	const { trackOrganizationAction } = useAnalyticsTracking({
		pageName: "organization",
	});
	const [pendingInvitationId, setPendingInvitationId] = useState<string | null>(
		null,
	);

	async function cancelInvitation(invitationId: string) {
		setPendingInvitationId(invitationId);
		trackOrganizationAction({
			actionName: "cancel_invitation",
			sourceComponent: "workspace_outgoing_invitations_card",
			targetId: invitationId,
			targetType: "invitation",
		});

		try {
			await authClient.organization.cancelInvitation({ invitationId });
			onInvalidate();
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "Failed to cancel invitation",
			);
		} finally {
			setPendingInvitationId(null);
		}
	}

	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<CardTitle>Outgoing invitations</CardTitle>
				<CardDescription>
					Pending invitations that haven&apos;t been accepted yet.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<WorkspaceOutgoingInvitationsTable
					canCancel={canCancel}
					invitations={invitations}
					onCancel={(invitationId) => void cancelInvitation(invitationId)}
					pendingInvitationId={pendingInvitationId}
				/>
			</CardContent>
		</Card>
	);
}
