import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { openChatwoot } from "@/lib/chatwoot";

export function WorkspaceDangerZoneCard() {
	const supportLink = (
		import.meta.env.VITE_CHATWOOT_BASE_URL ?? "https://app.chatwoot.com"
	).trim();
	const inlineLinkClassName = "underline underline-offset-4 hover:text-primary";

	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<CardTitle className="text-destructive">Delete workspace</CardTitle>
				<CardDescription>
					Workspace deletion is handled by support. Contact us if you&apos;d
					like this workspace and its data removed.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-muted-foreground">
					Shoot us a message via the{" "}
					<a
						href={supportLink}
						className={inlineLinkClassName}
						onClick={(event) => {
							event.preventDefault();
							void openChatwoot();
						}}
					>
						support chat
					</a>
					. (you&apos;ll write with someone out of the team, not some AI bot).
					Or email{" "}
					<a href="mailto:evren@rudel.ai" className={inlineLinkClassName}>
						evren@rudel.ai
					</a>
					.
				</p>
			</CardContent>
		</Card>
	);
}
