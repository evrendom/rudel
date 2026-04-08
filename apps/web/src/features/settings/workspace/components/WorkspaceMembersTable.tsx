import { Trash2Icon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/app/ui/avatar";
import { Badge } from "@/app/ui/badge";
import { Button } from "@/app/ui/button";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/app/ui/table";

function getInitials(name: string, email: string) {
	const source = name.trim() || email.trim() || "R";

	return source
		.split(" ")
		.map((part) => part[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

export function WorkspaceMembersTable({
	canEdit,
	members,
	onRemove,
	onRoleChange,
	pendingKey,
}: {
	canEdit: boolean;
	members: readonly {
		id: string;
		role: string;
		user: {
			email: string;
			id: string;
			image: string | null;
			name: string;
		};
	}[];
	onRemove: (memberId: string) => void;
	onRoleChange: (memberId: string, role: "member" | "admin") => void;
	pendingKey: string | null;
}) {
	if (members.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				No members are visible for this workspace yet.
			</p>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Member</TableHead>
					<TableHead>Role</TableHead>
					<TableHead className="text-right">Action</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{members.map((member) => {
					const isRemovePending = pendingKey === `remove:${member.id}`;
					const isRolePending = pendingKey === `role:${member.id}`;

					return (
						<TableRow key={member.id}>
							<TableCell>
								<div className="flex items-center gap-3">
									<Avatar>
										{member.user.image ? (
											<AvatarImage
												alt={member.user.name}
												src={member.user.image}
											/>
										) : null}
										<AvatarFallback>
											{getInitials(member.user.name, member.user.email)}
										</AvatarFallback>
									</Avatar>
									<div className="flex min-w-0 flex-col">
										<span className="truncate font-medium text-foreground">
											{member.user.name}
										</span>
										<span className="truncate text-xs text-muted-foreground">
											{member.user.email}
										</span>
									</div>
								</div>
							</TableCell>
							<TableCell>
								{member.role === "owner" ? (
									<Badge>Owner</Badge>
								) : canEdit ? (
									<div className="flex items-center gap-2">
										<Select
											disabled={Boolean(pendingKey)}
											onValueChange={(value) => {
												if (value === "member" || value === "admin") {
													onRoleChange(member.id, value);
												}
											}}
											value={member.role}
										>
											<SelectTrigger className="min-w-28" size="sm">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													<SelectItem value="member">Member</SelectItem>
													<SelectItem value="admin">Admin</SelectItem>
												</SelectGroup>
											</SelectContent>
										</Select>
										{isRolePending ? (
											<span className="text-xs text-muted-foreground">
												Saving…
											</span>
										) : null}
									</div>
								) : (
									<Badge className="capitalize" variant="secondary">
										{member.role}
									</Badge>
								)}
							</TableCell>
							<TableCell className="text-right">
								{canEdit && member.role !== "owner" ? (
									<Button
										disabled={Boolean(pendingKey)}
										onClick={() => onRemove(member.id)}
										size="sm"
										type="button"
										variant="outline"
									>
										<Trash2Icon data-icon="inline-start" />
										{isRemovePending ? "Removing…" : "Remove"}
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
