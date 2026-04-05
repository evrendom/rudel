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
				<CardTitle>Account actions</CardTitle>
				<CardDescription>Session-level actions for this browser.</CardDescription>
			</CardHeader>
			<CardContent>
				<Button
					type="button"
					variant="outline"
					onClick={onSignOut}
					disabled={isSigningOut}
				>
					<LogOutIcon data-icon="inline-start" />
					{isSigningOut ? "Signing out…" : "Sign out"}
				</Button>
			</CardContent>
		</Card>
	);
}
