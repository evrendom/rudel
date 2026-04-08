import { LogOutIcon } from "lucide-react";
import { Button } from "@/app/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";

export function ProfileActionsCard({
	isSigningOut,
	onSignOut,
}: {
	isSigningOut: boolean;
	onSignOut: () => void;
}) {
	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<CardTitle>Session</CardTitle>
				<CardDescription>
					Sign out from this device without affecting other sessions.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button
					disabled={isSigningOut}
					onClick={onSignOut}
					type="button"
					variant="outline"
				>
					<LogOutIcon data-icon="inline-start" />
					{isSigningOut ? "Signing out…" : "Sign out"}
				</Button>
			</CardContent>
		</Card>
	);
}
