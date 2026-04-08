"use client";

import { LogOutIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/app/ui/avatar";
import { Button } from "@/app/ui/button";
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

export function ProfileOverviewCard({
	email,
	image,
	isSigningOut,
	name,
	onSignOut,
}: {
	email: string;
	image: string | null;
	isSigningOut: boolean;
	name: string;
	onSignOut: () => void;
}) {
	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<CardTitle>Profile</CardTitle>
				<CardDescription>
					Your account identity and session access for this browser.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<div className="flex items-center gap-4">
					<Avatar size="lg">
						{image ? <AvatarImage src={image} alt={name} /> : null}
						<AvatarFallback>{getInitials(name, email)}</AvatarFallback>
					</Avatar>
					<div className="min-w-0">
						<p className="truncate font-medium text-foreground">{name}</p>
						<p className="truncate text-sm text-muted-foreground">{email}</p>
					</div>
				</div>

				<div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex flex-col gap-1">
						<p className="font-medium text-foreground">Session</p>
						<p className="text-sm text-muted-foreground">
							Sign out from this device without affecting other sessions.
						</p>
					</div>
					<Button
						type="button"
						variant="outline"
						onClick={onSignOut}
						disabled={isSigningOut}
					>
						<LogOutIcon data-icon="inline-start" />
						{isSigningOut ? "Signing out…" : "Sign out"}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
