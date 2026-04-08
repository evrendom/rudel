import { PlusIcon } from "lucide-react";
import { buttonVariants } from "@/app/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";

export function WorkspaceEmptyStateCard() {
	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<CardTitle>No workspace selected</CardTitle>
				<CardDescription>
					You can create a workspace here or accept an invitation to join one
					that already exists.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<a className={buttonVariants({ size: "sm" })} href="#new-workspace">
					<PlusIcon data-icon="inline-start" />
					Create workspace
				</a>
			</CardContent>
		</Card>
	);
}
