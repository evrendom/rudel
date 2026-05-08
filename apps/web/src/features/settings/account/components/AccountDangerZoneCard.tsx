import { useState } from "react";
import { Button } from "@/app/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

export function AccountDangerZoneCard({
	user,
	onDeleted,
}: {
	user: { email: string; name: string };
	onDeleted: () => Promise<void>;
}) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
				<CardHeader>
					<CardTitle className="text-destructive">Delete account</CardTitle>
					<CardDescription>
						Permanently delete your account and all related data from our
						database. This cannot be undone.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex justify-end">
					<Button
						type="button"
						variant="destructive"
						onClick={() => setOpen(true)}
					>
						Delete account
					</Button>
				</CardContent>
			</Card>

			<DeleteAccountDialog
				open={open}
				onOpenChange={setOpen}
				user={user}
				onDeleted={onDeleted}
			/>
		</>
	);
}
