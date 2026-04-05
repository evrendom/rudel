import type { LucideIcon } from "lucide-react";
import { GithubIcon, Loader2Icon, MailIcon } from "lucide-react";
import { Badge } from "@/app/ui/badge";
import { Button } from "@/app/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/ui/card";

const providerDefinitions: Array<{
	id: "google" | "github";
	label: string;
	icon: LucideIcon;
}> = [
	{ id: "google", label: "Google", icon: MailIcon },
	{ id: "github", label: "GitHub", icon: GithubIcon },
];

export function ProfileLinkedAccountsCard({
	isPending,
	linkedProviders,
	linkingProvider,
	onLinkProvider,
}: {
	isPending: boolean;
	linkedProviders: Set<string>;
	linkingProvider: string | null;
	onLinkProvider: (provider: "google" | "github") => void;
}) {
	return (
		<Card size="sm" className="bg-card/95 shadow-none ring-1 ring-border/60">
			<CardHeader>
				<CardTitle>Linked accounts</CardTitle>
				<CardDescription>
					Keep your sign-in methods available without leaving the dashboard.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				<Card
					size="sm"
					className="bg-muted/20 shadow-none ring-1 ring-border/60"
				>
					<CardContent className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							<MailIcon className="text-muted-foreground" />
							<div className="flex flex-col gap-1">
								<span className="font-medium">Email &amp; password</span>
								<span className="text-xs text-muted-foreground">
									Primary credential access
								</span>
							</div>
						</div>
						<Badge variant={linkedProviders.has("credential") ? "secondary" : "outline"}>
							{linkedProviders.has("credential") ? "Connected" : "Not linked"}
						</Badge>
					</CardContent>
				</Card>

				{providerDefinitions.map((provider) => {
					const Icon = provider.icon;
					const isLinked = linkedProviders.has(provider.id);
					const isLinking = linkingProvider === provider.id;

					return (
						<Card
							key={provider.id}
							size="sm"
							className="bg-muted/20 shadow-none ring-1 ring-border/60"
						>
							<CardContent className="flex items-center justify-between gap-3">
								<div className="flex items-center gap-3">
									<Icon className="text-muted-foreground" />
									<div className="flex flex-col gap-1">
										<span className="font-medium">{provider.label}</span>
										<span className="text-xs text-muted-foreground">
											{isLinked ? "Already linked" : "Available to connect"}
										</span>
									</div>
								</div>
								{isLinked ? (
									<Badge variant="secondary">Connected</Badge>
								) : (
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => onLinkProvider(provider.id)}
										disabled={isPending || linkingProvider !== null}
									>
										{isLinking ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
										Link
									</Button>
								)}
							</CardContent>
						</Card>
					);
				})}
			</CardContent>
		</Card>
	);
}
