import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/app/ui/avatar";
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
	name,
	email,
	image,
}: {
	name: string;
	email: string;
	image: string | null;
}) {
	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<CardTitle>Profile</CardTitle>
				<CardDescription>Your account identity in the workspace.</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex items-center gap-4">
					<Avatar size="lg">
						{image ? <AvatarImage src={image} alt={name} /> : null}
						<AvatarFallback>{getInitials(name, email)}</AvatarFallback>
					</Avatar>
					<div className="flex min-w-0 flex-col gap-1">
						<span className="truncate font-medium text-foreground">{name}</span>
						<span className="truncate text-sm text-muted-foreground">{email}</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
