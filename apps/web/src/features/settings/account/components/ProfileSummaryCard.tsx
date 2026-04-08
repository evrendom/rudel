import { Avatar, AvatarFallback, AvatarImage } from "@/app/ui/avatar";
import { Badge } from "@/app/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";

function getInitials(name: string, email: string) {
	const source = name.trim() || email.trim() || "R";

	return source
		.split(" ")
		.map((part) => part[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

export function ProfileSummaryCard({
	email,
	image,
	name,
}: {
	email: string;
	image: string | null;
	name: string;
}) {
	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<CardTitle>Profile</CardTitle>
				<CardDescription>
					Your account identity in this workspace.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex items-center gap-4">
				<Avatar size="lg">
					{image ? <AvatarImage alt={name} src={image} /> : null}
					<AvatarFallback>{getInitials(name, email)}</AvatarFallback>
				</Avatar>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<span className="truncate font-medium text-foreground">{name}</span>
					<span className="truncate text-sm text-muted-foreground">
						{email}
					</span>
				</div>
				<Badge variant="secondary">Active</Badge>
			</CardContent>
		</Card>
	);
}
