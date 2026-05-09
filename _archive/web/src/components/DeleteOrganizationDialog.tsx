import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { client } from "../lib/orpc";
import { Button } from "./ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";

interface DeleteOrganizationDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organization: { id: string; name: string };
	onDeleted: () => void;
}

export function DeleteOrganizationDialog({
	open,
	onOpenChange,
	organization,
	onDeleted,
}: DeleteOrganizationDialogProps) {
	const { trackOrganizationAction } = useAnalyticsTracking({
		organizationId: organization.id,
	});
	const { data: sessionCountData, isLoading: loading } = useQuery({
		queryKey: ["org-session-count", organization.id],
		queryFn: async () => {
			const res = await client.getOrganizationSessionCount({
				organizationId: organization.id,
			});
			return res.count;
		},
		enabled: open,
	});
	const sessionCount = sessionCountData ?? null;
	const [confirmName, setConfirmName] = useState("");
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) {
			setConfirmName("");
			setDeleting(false);
			setError(null);
		}
	}, [open]);

	const nameMatches =
		confirmName.toLowerCase() === organization.name.toLowerCase();
	const canDelete = nameMatches && !deleting;

	const handleDelete = async () => {
		trackOrganizationAction({
			actionName: "delete_organization",
			targetType: "organization",
			sourceComponent: "delete_organization_dialog",
			targetId: organization.id,
		});
		setDeleting(true);
		setError(null);
		try {
			await client.deleteOrganization({
				organizationId: organization.id,
			});
			onDeleted();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to delete organization",
			);
			setDeleting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AlertTriangle className="h-5 w-5 text-red-500" />
						Delete Organization
					</DialogTitle>
					<DialogDescription>
						This action cannot be undone. This will permanently delete{" "}
						<strong>{organization.name}</strong> and remove all member access.
					</DialogDescription>
				</DialogHeader>

				{loading ? (
					<div className="flex items-center justify-center py-8">
						<Loader2 className="h-6 w-6 animate-spin text-muted" />
					</div>
				) : (
					<div className="flex flex-col gap-4">
						{sessionCount !== null && sessionCount > 0 ? (
							<p className="text-sm text-foreground">
								This will permanently delete{" "}
								<strong>
									{sessionCount} session{sessionCount !== 1 ? "s" : ""}
								</strong>{" "}
								associated with this organization.
							</p>
						) : (
							<p className="text-sm text-muted">
								This organization has no session data.
							</p>
						)}

						<div className="flex flex-col gap-2">
							<label htmlFor="confirm-name" className="text-sm text-foreground">
								Type <strong>{organization.name}</strong> to confirm:
							</label>
							<Input
								id="confirm-name"
								value={confirmName}
								onChange={(e) => setConfirmName(e.target.value)}
								placeholder={organization.name}
							/>
						</div>

						{error && <p className="text-sm text-red-500">{error}</p>}
					</div>
				)}

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => {
							trackOrganizationAction({
								actionName: "cancel_delete_organization",
								targetType: "organization",
								sourceComponent: "delete_organization_dialog",
								targetId: organization.id,
							});
							onOpenChange(false);
						}}
						disabled={deleting}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleDelete}
						disabled={!canDelete}
					>
						{deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
						Delete Organization
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
