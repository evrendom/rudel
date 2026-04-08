import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/app/ui/avatar";
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
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/ui/select";
import { Trash2Icon } from "lucide-react";

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
	members,
	canEdit,
	pendingKey,
	onRoleChange,
	onRemove,
}: {
	members: readonly {
		id: string;
		role: string;
		user: {
			id: string;
			name: string;
			email: string;
			image: string | null;
		};
	}[];
	canEdit: boolean;
	pendingKey: string | null;
	onRoleChange: (memberId: string, role: "member" | "admin") => void;
	onRemove: (memberId: string) => void;
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
					const roleKey = `role:${member.id}`;
					const removeKey = `remove:${member.id}`;
					const isRolePending = pendingKey === roleKey;
					const isRemovePending = pendingKey === removeKey;

					return (
						<TableRow key={member.id}>
							<TableCell>
								<div className="flex items-center gap-3">
									<Avatar>
										{member.user.image ? (
											<AvatarImage src={member.user.image} alt={member.user.name} />
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
									<Select
										value={member.role}
										onValueChange={(value) =>
											onRoleChange(member.id, value as "member" | "admin")
										}
										disabled={Boolean(pendingKey)}
									>
										<SelectTrigger size="sm" className="min-w-28">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												<SelectItem value="member">Member</SelectItem>
												<SelectItem value="admin">Admin</SelectItem>
											</SelectGroup>
										</SelectContent>
									</Select>
								) : (
									<Badge variant="secondary" className="capitalize">
										{member.role}
									</Badge>
								)}
								{isRolePending ? (
									<span className="ml-2 text-xs text-muted-foreground">
										Saving…
									</span>
								) : null}
							</TableCell>
							<TableCell className="text-right">
								{canEdit && member.role !== "owner" ? (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => onRemove(member.id)}
										disabled={Boolean(pendingKey)}
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
