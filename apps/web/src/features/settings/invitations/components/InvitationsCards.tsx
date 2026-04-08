import { Building2Icon, CheckIcon, XIcon } from "lucide-react";
import { Badge } from "@/app/ui/badge";
import { Button } from "@/app/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";

function formatDate(value: Date | string) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "Unknown date";
	}

	return date.toLocaleDateString();
}

export function InvitationsCards({
	invitations,
	onAccept,
	onDecline,
	processingId,
}: {
	invitations: readonly {
		createdAt: Date | string;
		id: string;
		organizationName: string;
		role: string;
	}[];
	onAccept: (invitationId: string) => void;
	onDecline: (invitationId: string) => void;
	processingId: string | null;
}) {
	return (
		<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
			{invitations.map((invitation) => {
				const isProcessing = processingId === invitation.id;

				return (
					<Card
						className="bg-card/95 shadow-none ring-1 ring-border/60"
						key={invitation.id}
						size="sm"
					>
						<CardHeader className="gap-3">
							<div className="flex items-start gap-3">
								<div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
									<Building2Icon />
								</div>
								<div className="min-w-0 flex-1">
									<CardTitle className="truncate">
										{invitation.organizationName}
									</CardTitle>
									<CardDescription>
										Invited {formatDate(invitation.createdAt)}
									</CardDescription>
								</div>
								<Badge className="capitalize" variant="outline">
									{invitation.role}
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="flex flex-wrap gap-2">
							<Button
								disabled={isProcessing}
								onClick={() => onDecline(invitation.id)}
								size="sm"
								type="button"
								variant="outline"
							>
								<XIcon data-icon="inline-start" />
								{isProcessing ? "Working…" : "Decline"}
							</Button>
							<Button
								disabled={isProcessing}
								onClick={() => onAccept(invitation.id)}
								size="sm"
								type="button"
							>
								<CheckIcon data-icon="inline-start" />
								{isProcessing ? "Working…" : "Accept"}
							</Button>
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
