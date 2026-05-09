import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { client } from "../../lib/orpc";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";

interface DeleteUserDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	user: { id: string; name: string; email: string } | null;
	onDeleted: () => void;
}

export function DeleteUserDialog({
	open,
	onOpenChange,
	user: targetUser,
	onDeleted,
}: DeleteUserDialogProps) {
	const [confirmEmail, setConfirmEmail] = useState("");
	const [deleting, setDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) {
			setConfirmEmail("");
			setDeleting(false);
			setError(null);
		}
	}, [open]);

	if (!targetUser) return null;

	const emailMatches =
		confirmEmail.toLowerCase() === targetUser.email.toLowerCase();
	const canDelete = emailMatches && !deleting;

	const handleDelete = async () => {
		setDeleting(true);
		setError(null);
		try {
			await client.admin.deleteUser({ userId: targetUser.id });
			onDeleted();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete user");
			setDeleting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<AlertTriangle className="h-5 w-5 text-red-500" />
						Delete User
					</DialogTitle>
					<DialogDescription>
						This action cannot be undone. This will permanently delete the user{" "}
						<strong>{targetUser.name}</strong> ({targetUser.email}) and all
						their data.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<p className="text-sm text-foreground">
						This will delete the user's account, all their organization
						memberships, and any organizations where they are the sole member.
					</p>

					<div className="flex flex-col gap-2">
						<label htmlFor="confirm-email" className="text-sm text-foreground">
							Type <strong>{targetUser.email}</strong> to confirm:
						</label>
						<Input
							id="confirm-email"
							value={confirmEmail}
							onChange={(e) => setConfirmEmail(e.target.value)}
							placeholder={targetUser.email}
						/>
					</div>

					{error && <p className="text-sm text-red-500">{error}</p>}
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
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
						Delete User
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
