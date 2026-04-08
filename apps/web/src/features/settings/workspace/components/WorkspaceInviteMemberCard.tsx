import {
	CheckIcon,
	CopyIcon,
	MailIcon,
	UserPlusIcon,
	XIcon,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/app/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";
import { Field, FieldLabel } from "@/app/ui/field";
import { Input } from "@/app/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/ui/select";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { authClient } from "@/lib/auth-client";

export function WorkspaceInviteMemberCard({
	canManage,
	onInvalidate,
}: {
	canManage: boolean;
	onInvalidate: () => void;
}) {
	const { trackOrganizationAction } = useAnalyticsTracking({
		pageName: "organization",
	});
	const [copiedInviteLink, setCopiedInviteLink] = useState(false);
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteLink, setInviteLink] = useState<string | null>(null);
	const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
	const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
	const [isInviting, setIsInviting] = useState(false);

	async function inviteMember(event: FormEvent) {
		event.preventDefault();
		const email = inviteEmail.trim();
		if (!email) {
			return;
		}

		trackOrganizationAction({
			actionName: "invite_member",
			sourceComponent: "workspace_invite_member_card",
			targetRole: inviteRole,
			targetType: "invitation",
		});
		setIsInviting(true);
		const response = await authClient.organization.inviteMember({
			email,
			role: inviteRole,
		});
		setIsInviting(false);

		if (response.error) {
			toast.error(response.error.message ?? "Failed to invite member");
			return;
		}

		if (response.data) {
			setInviteLink(`${window.location.origin}/invitation/${response.data.id}`);
			setInvitedEmail(email);
			setInviteEmail("");
			setCopiedInviteLink(false);
			onInvalidate();
		}
	}

	async function copyInviteLink() {
		if (!inviteLink) {
			return;
		}

		trackOrganizationAction({
			actionName: "copy_invite_link",
			sourceComponent: "workspace_invite_member_card",
			targetType: "invitation",
		});

		try {
			await navigator.clipboard.writeText(inviteLink);
			setCopiedInviteLink(true);
			toast.success("Invite link copied");
		} catch {
			toast.error("Failed to copy invite link");
		}
	}

	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<div className="flex items-start gap-3">
					<div className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
						<UserPlusIcon />
					</div>
					<div className="flex min-w-0 flex-1 flex-col gap-1">
						<CardTitle>Invite member</CardTitle>
						<CardDescription>
							Send a role-scoped invitation link to a teammate.
						</CardDescription>
					</div>
				</div>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				{!canManage ? (
					<p className="text-sm text-muted-foreground">
						Only admins and owners can invite new members.
					</p>
				) : null}
				<form
					className="flex flex-col gap-3"
					onSubmit={(event) => void inviteMember(event)}
				>
					<Field className="gap-2">
						<FieldLabel htmlFor="invite-email">Email</FieldLabel>
						<Input
							disabled={!canManage || isInviting}
							id="invite-email"
							onChange={(event) => {
								setInviteEmail(event.target.value);
								if (inviteLink) {
									setInviteLink(null);
									setInvitedEmail(null);
								}
							}}
							placeholder="teammate@company.com"
							type="email"
							value={inviteEmail}
						/>
					</Field>
					<Field className="gap-2">
						<FieldLabel htmlFor="invite-role">Role</FieldLabel>
						<Select
							disabled={!canManage || isInviting}
							onValueChange={(value) => {
								if (value === "member" || value === "admin") {
									setInviteRole(value);
								}
							}}
							value={inviteRole}
						>
							<SelectTrigger
								className="w-full justify-between"
								id="invite-role"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									<SelectItem value="member">Member</SelectItem>
									<SelectItem value="admin">Admin</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
					<Button
						disabled={
							!canManage || isInviting || inviteEmail.trim().length === 0
						}
						type="submit"
					>
						<MailIcon data-icon="inline-start" />
						{isInviting ? "Sending invite…" : "Send invite"}
					</Button>
				</form>

				{inviteLink ? (
					<Card
						size="sm"
						className="bg-muted/20 shadow-none ring-1 ring-border/60"
					>
						<CardContent className="flex flex-col gap-3">
							<div className="flex flex-col gap-1">
								<span className="font-medium text-foreground">
									Invite ready
								</span>
								<span className="text-sm text-muted-foreground">
									{invitedEmail
										? `Share this link with ${invitedEmail}.`
										: "Share this link with the invited member."}
								</span>
							</div>
							<div className="rounded-lg bg-background px-3 py-2 text-sm text-muted-foreground ring-1 ring-border/60">
								{inviteLink}
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									onClick={() => void copyInviteLink()}
									size="sm"
									type="button"
									variant="outline"
								>
									{copiedInviteLink ? (
										<CheckIcon data-icon="inline-start" />
									) : (
										<CopyIcon data-icon="inline-start" />
									)}
									{copiedInviteLink ? "Copied" : "Copy link"}
								</Button>
								<Button
									onClick={() => {
										setCopiedInviteLink(false);
										setInviteLink(null);
										setInvitedEmail(null);
									}}
									size="sm"
									type="button"
									variant="outline"
								>
									<XIcon data-icon="inline-start" />
									Dismiss
								</Button>
							</div>
						</CardContent>
					</Card>
				) : null}
			</CardContent>
		</Card>
	);
}
