import { useState } from "react";
import { toast } from "sonner";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { WorkspaceMembersTable } from "@/features/settings/workspace/components/WorkspaceMembersTable";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { authClient } from "@/lib/auth-client";

export function WorkspaceMembersCard({
	canManage,
	members,
	onInvalidate,
}: {
	canManage: boolean;
	members: readonly {
		id: string;
		role: string;
		user: {
			email: string;
			id: string;
			image: string | null;
			name: string;
		};
	}[];
	onInvalidate: () => void;
}) {
	const { trackOrganizationAction } = useAnalyticsTracking({
		pageName: "organization",
	});
	const [pendingMemberKey, setPendingMemberKey] = useState<string | null>(null);

	async function removeMember(memberId: string) {
		setPendingMemberKey(`remove:${memberId}`);
		trackOrganizationAction({
			actionName: "remove_member",
			sourceComponent: "workspace_members_card",
			targetId: memberId,
			targetType: "member",
		});

		try {
			await authClient.organization.removeMember({ memberIdOrEmail: memberId });
			onInvalidate();
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "Failed to remove member",
			);
		} finally {
			setPendingMemberKey(null);
		}
	}

	async function updateRole(memberId: string, role: "member" | "admin") {
		setPendingMemberKey(`role:${memberId}`);
		trackOrganizationAction({
			actionName: "update_member_role",
			sourceComponent: "workspace_members_card",
			targetId: memberId,
			targetRole: role,
			targetType: "member",
		});

		try {
			await authClient.organization.updateMemberRole({ memberId, role });
			onInvalidate();
		} catch (cause) {
			toast.error(
				cause instanceof Error ? cause.message : "Failed to update member role",
			);
		} finally {
			setPendingMemberKey(null);
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
					canEdit={canManage}
					members={members}
					onRemove={(memberId) => void removeMember(memberId)}
					onRoleChange={(memberId, role) => void updateRole(memberId, role)}
					pendingKey={pendingMemberKey}
				/>
			</CardContent>
		</Card>
	);
}
