import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/app/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/app/ui/dialog";
import { Field, FieldLabel } from "@/app/ui/field";
import { Input } from "@/app/ui/input";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { client } from "@/lib/orpc";

function DeleteWorkspaceDialogBody({
	onDeleted,
	onOpenChange,
	organization,
}: {
	onOpenChange: (open: boolean) => void;
	organization: { id: string; name: string };
	onDeleted: () => Promise<void>;
}) {
	const { trackOrganizationAction } = useAnalyticsTracking({
		organizationId: organization.id,
	});
	const { data: sessionCount, isLoading } = useQuery({
		queryKey: ["org-session-count", organization.id],
		queryFn: async () => {
			const response = await client.getOrganizationSessionCount({
				organizationId: organization.id,
			});
			return response.count;
		},
	});
	const [confirmName, setConfirmName] = useState("");
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const canDelete =
		confirmName.trim().toLowerCase() ===
			organization.name.trim().toLowerCase() && !isDeleting;

	const handleDelete = async () => {
		trackOrganizationAction({
			actionName: "delete_organization",
			targetType: "organization",
			sourceComponent: "delete_workspace_dialog",
			targetId: organization.id,
		});
		setIsDeleting(true);
		setError(null);

		try {
			await client.deleteOrganization({
				organizationId: organization.id,
			});
			await onDeleted();
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Failed to delete workspace",
			);
			setIsDeleting(false);
		}
	};

	return (
		<DialogContent>
			<DialogHeader>
				<DialogTitle className="flex items-center gap-2">
					<AlertTriangleIcon className="text-destructive" />
					Delete workspace
				</DialogTitle>
				<DialogDescription>
					This permanently deletes <strong>{organization.name}</strong> and
					removes access for every member.
				</DialogDescription>
			</DialogHeader>

			<div className="flex flex-col gap-4">
				{isLoading ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2Icon className="animate-spin" />
						Checking workspace data…
					</div>
				) : (
					<p className="text-sm text-muted-foreground">
						{sessionCount && sessionCount > 0
							? `${sessionCount} sessions are attached to this workspace and will be removed.`
							: "No session data is attached to this workspace."}
					</p>
				)}

				<Field className="gap-2">
					<FieldLabel htmlFor="delete-workspace-confirm">
						Type {organization.name} to confirm
					</FieldLabel>
					<Input
						id="delete-workspace-confirm"
						value={confirmName}
						onChange={(event) => setConfirmName(event.target.value)}
						placeholder={organization.name}
					/>
				</Field>

				{error ? <p className="text-sm text-destructive">{error}</p> : null}
			</div>

			<DialogFooter>
				<Button
					type="button"
					variant="outline"
					onClick={() => onOpenChange(false)}
					disabled={isDeleting}
				>
					Cancel
				</Button>
				<Button
					type="button"
					variant="destructive"
					onClick={handleDelete}
					disabled={!canDelete}
				>
					{isDeleting ? (
						<Loader2Icon data-icon="inline-start" className="animate-spin" />
					) : null}
					Delete workspace
				</Button>
			</DialogFooter>
		</DialogContent>
	);
}

export function DeleteWorkspaceDialog({
	open,
	onOpenChange,
	organization,
	onDeleted,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organization: { id: string; name: string };
	onDeleted: () => Promise<void>;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			{open ? (
				<DeleteWorkspaceDialogBody
					onDeleted={onDeleted}
					onOpenChange={onOpenChange}
					organization={organization}
				/>
			) : null}
		</Dialog>
	);
}
