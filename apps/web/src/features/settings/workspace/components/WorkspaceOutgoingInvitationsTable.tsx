import { XIcon } from "lucide-react";
import { Badge } from "@/app/ui/badge";
import { Button } from "@/app/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/app/ui/table";

function formatDate(value?: string) {
	if (!value) {
		return "—";
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return "—";
	}

	return date.toLocaleDateString();
}

export function WorkspaceOutgoingInvitationsTable({
	canCancel,
	invitations,
	onCancel,
	pendingInvitationId,
}: {
	canCancel: boolean;
	invitations: readonly {
		createdAt?: string;
		email: string;
		id: string;
		role: string | null;
		status: string;
	}[];
	onCancel: (invitationId: string) => void;
	pendingInvitationId: string | null;
}) {
	if (invitations.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No outgoing invitations are pending.
			</p>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Email</TableHead>
					<TableHead>Role</TableHead>
					<TableHead>Sent</TableHead>
					<TableHead className="text-right">Action</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{invitations.map((invitation) => {
					const isPending = pendingInvitationId === invitation.id;

					return (
						<TableRow key={invitation.id}>
							<TableCell className="font-medium">{invitation.email}</TableCell>
							<TableCell>
								{invitation.role ? (
									<Badge className="capitalize" variant="secondary">
										{invitation.role}
									</Badge>
								) : (
									<span className="text-sm text-muted-foreground">—</span>
								)}
							</TableCell>
							<TableCell className="text-muted-foreground">
								{formatDate(invitation.createdAt)}
							</TableCell>
							<TableCell className="text-right">
								{canCancel ? (
									<Button
										disabled={pendingInvitationId !== null}
										onClick={() => onCancel(invitation.id)}
										size="sm"
										type="button"
										variant="outline"
									>
										<XIcon data-icon="inline-start" />
										{isPending ? "Canceling…" : "Cancel"}
									</Button>
								) : (
									<span className="text-sm text-muted-foreground">—</span>
								)}
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}
