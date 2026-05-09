import { Badge } from "@/app/ui/badge";
import { Button } from "@/app/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";

function formatDate(value: string | Date) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "Unknown date";
	}

	return date.toLocaleDateString();
}

export function WorkspaceIncomingInvitationsCard({
	description = "Accept or decline invites from other workspaces without leaving settings.",
	invitations,
	isPending,
	onAccept,
	onDecline,
	processingId,
	title = "Pending invitations",
}: {
	description?: string;
	invitations: readonly {
		createdAt: string | Date;
		id: string;
		organizationName: string;
		role: string;
	}[];
	isPending: boolean;
	onAccept: (invitationId: string) => void;
	onDecline: (invitationId: string) => void;
	processingId: string | null;
	title?: string;
}) {
	const invitationCount = invitations.length;

	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
				<CardAction>
					<Badge variant={invitationCount > 0 ? "secondary" : "outline"}>
						{invitationCount} pending
					</Badge>
				</CardAction>
			</CardHeader>
			<CardContent>
				{isPending ? (
					<div className="flex flex-col divide-y divide-border/60">
						{["incoming-invite-1", "incoming-invite-2"].map((key) => (
							<div
								key={key}
								className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0"
							>
								<div className="flex flex-col gap-2">
									<Skeleton className="h-4 w-36 rounded-md" />
									<Skeleton className="h-4 w-28 rounded-md" />
								</div>
								<div className="flex gap-2">
									<Skeleton className="h-8 w-20 rounded-md" />
									<Skeleton className="h-8 w-20 rounded-md" />
								</div>
							</div>
						))}
					</div>
				) : null}

				{!isPending && invitationCount === 0 ? (
					<p className="text-sm text-muted-foreground">
						No pending invitations right now.
					</p>
				) : null}

				{!isPending && invitationCount > 0 ? (
					<ul className="flex flex-col divide-y divide-border/60">
						{invitations.map((invitation) => {
							const isProcessing = processingId === invitation.id;

							return (
								<li
									key={invitation.id}
									className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0"
								>
									<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
										<div className="min-w-0">
											<p className="truncate font-medium text-foreground">
												{invitation.organizationName}
											</p>
											<p className="text-sm text-muted-foreground">
												Invited {formatDate(invitation.createdAt)}
											</p>
										</div>
										<Badge variant="outline" className="w-fit capitalize">
											{invitation.role}
										</Badge>
									</div>
									<div className="flex flex-wrap gap-2">
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={() => onDecline(invitation.id)}
											disabled={isProcessing}
										>
											{isProcessing ? "Working…" : "Decline"}
										</Button>
										<Button
											type="button"
											size="sm"
											onClick={() => onAccept(invitation.id)}
											disabled={isProcessing}
										>
											{isProcessing ? "Working…" : "Accept"}
										</Button>
									</div>
								</li>
							);
						})}
					</ul>
				) : null}
			</CardContent>
		</Card>
	);
}
