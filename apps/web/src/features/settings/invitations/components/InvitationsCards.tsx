import { Badge } from "@/app/ui/badge";
import { Button } from "@/app/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { Building2Icon, CheckIcon, XIcon } from "lucide-react";

function formatDate(value: string | Date) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "Unknown date";
	}

	return date.toLocaleDateString();
}

export function InvitationsCards({
	invitations,
	processingId,
	onAccept,
	onDecline,
}: {
	invitations: readonly {
		id: string;
		organizationName: string;
		role: string;
		createdAt: string | Date;
	}[];
	processingId: string | null;
	onAccept: (invitationId: string) => void;
	onDecline: (invitationId: string) => void;
}) {
	return (
		<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
			{invitations.map((invitation) => {
				const isProcessing = processingId === invitation.id;

				return (
					<Card
						key={invitation.id}
						size="sm"
						className="bg-card/95 shadow-none ring-1 ring-border/60"
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
								<Badge variant="outline" className="capitalize">
									{invitation.role}
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="flex flex-wrap gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => onDecline(invitation.id)}
								disabled={isProcessing}
							>
								<XIcon data-icon="inline-start" />
								{isProcessing ? "Working…" : "Decline"}
							</Button>
							<Button
								type="button"
								size="sm"
								onClick={() => onAccept(invitation.id)}
								disabled={isProcessing}
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
