import { useState } from "react"
import { toast } from "sonner"
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking"
import { authClient } from "@/lib/auth-client"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card"
import { WorkspaceOutgoingInvitationsTable } from "@/features/settings/workspace/components/WorkspaceOutgoingInvitationsTable"

export function WorkspaceOutgoingInvitationsCard({
	invitations,
	canCancel,
	onInvalidate,
}: {
	invitations: readonly {
		id: string
		email: string
		role: string | null
		status: string
		createdAt?: string
	}[]
	canCancel: boolean
	onInvalidate: () => void
}) {
	const { trackOrganizationAction } = useAnalyticsTracking({
		pageName: "organization",
	})
	const [pendingInvitationId, setPendingInvitationId] = useState<string | null>(
		null,
	)

	const cancelInvitation = async (invitationId: string) => {
		setPendingInvitationId(invitationId)
		trackOrganizationAction({
			actionName: "cancel_invitation",
			targetType: "invitation",
			sourceComponent: "workspace_settings_section",
			targetId: invitationId,
		})

		try {
			await authClient.organization.cancelInvitation({ invitationId })
			onInvalidate()
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "Failed to cancel invitation",
			)
		} finally {
			setPendingInvitationId(null)
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
					invitations={invitations}
					canCancel={canCancel}
					pendingInvitationId={pendingInvitationId}
					onCancel={(invitationId) => void cancelInvitation(invitationId)}
				/>
			</CardContent>
		</Card>
	)
}
