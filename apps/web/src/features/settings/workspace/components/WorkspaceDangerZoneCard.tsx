import { AlertTriangleIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/app/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { DeleteWorkspaceDialog } from "@/features/settings/workspace/components/DeleteWorkspaceDialog";
import { useOrganization } from "@/features/workspace/organization/useOrganization";
import { refreshAuthClientState } from "@/lib/auth-client";

export function WorkspaceDangerZoneCard({
	canManage,
	organization,
}: {
	canManage: boolean;
	organization: { id: string; name: string };
}) {
	const { state, actions } = useOrganization();
	const [open, setOpen] = useState(false);

	const handleDeleted = async () => {
		const nextOrg = state.organizations.find((o) => o.id !== organization.id);
		if (nextOrg) {
			await actions.switchOrganization(nextOrg.id);
		}
		refreshAuthClientState();
		setOpen(false);
		toast.success(`Workspace "${organization.name}" deleted`);
	};

	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<CardTitle className="text-destructive">Delete workspace</CardTitle>
				<CardDescription>
					Permanently delete this workspace and remove access for every member.
					Session data is removed too. This cannot be undone.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button
					type="button"
					variant="destructive"
					onClick={() => setOpen(true)}
					disabled={!canManage}
				>
					<AlertTriangleIcon data-icon="inline-start" />
					Delete workspace
				</Button>
			</CardContent>
			<DeleteWorkspaceDialog
				open={open}
				onOpenChange={setOpen}
				organization={organization}
				onDeleted={handleDeleted}
			/>
		</Card>
	);
}
