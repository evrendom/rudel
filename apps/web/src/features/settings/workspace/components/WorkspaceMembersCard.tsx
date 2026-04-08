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
import { WorkspaceMembersTable } from "@/features/settings/workspace/components/WorkspaceMembersTable"

export function WorkspaceMembersCard({
	members,
	canManage,
	onInvalidate,
}: {
	members: readonly {
		id: string
		role: string
		user: {
			id: string
			name: string
			email: string
			image: string | null
		}
	}[]
	canManage: boolean
	onInvalidate: () => void
}) {
	const { trackOrganizationAction } = useAnalyticsTracking({
		pageName: "organization",
	})
	const [pendingMemberKey, setPendingMemberKey] = useState<string | null>(null)

	const removeMember = async (memberId: string) => {
		setPendingMemberKey(`remove:${memberId}`)
		trackOrganizationAction({
			actionName: "remove_member",
			targetType: "member",
			sourceComponent: "workspace_settings_section",
			targetId: memberId,
		})

		try {
			await authClient.organization.removeMember({ memberIdOrEmail: memberId })
			onInvalidate()
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "Failed to remove member",
			)
		} finally {
			setPendingMemberKey(null)
		}
	}

	const updateRole = async (memberId: string, role: "member" | "admin") => {
		setPendingMemberKey(`role:${memberId}`)
		trackOrganizationAction({
			actionName: "update_member_role",
			targetType: "member",
			sourceComponent: "workspace_settings_section",
			targetId: memberId,
			targetRole: role,
		})

		try {
			await authClient.organization.updateMemberRole({ memberId, role })
			onInvalidate()
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "Failed to update member role",
			)
		} finally {
			setPendingMemberKey(null)
		}
	}

	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<CardTitle>Members</CardTitle>
				<CardDescription>
					Everyone who currently has access to this workspace.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<WorkspaceMembersTable
					members={members}
					canEdit={canManage}
					pendingKey={pendingMemberKey}
					onRoleChange={(memberId, role) => void updateRole(memberId, role)}
					onRemove={(memberId) => void removeMember(memberId)}
				/>
			</CardContent>
		</Card>
	)
}
