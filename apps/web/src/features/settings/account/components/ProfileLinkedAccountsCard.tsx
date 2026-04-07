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
					Keep your available sign-in methods connected in one place.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ul className="flex flex-col divide-y divide-border/60">
					<li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex items-start gap-3">
							<MailIcon className="mt-0.5 text-muted-foreground" />
							<div className="flex flex-col gap-1">
								<p className="font-medium text-foreground">
									Email &amp; password
								</p>
								<p className="text-sm text-muted-foreground">
									Primary credential access for this account.
								</p>
							</div>
						</div>
						<Badge
							variant={
								linkedProviders.has("credential") ? "secondary" : "outline"
							}
						>
							{linkedProviders.has("credential") ? "Connected" : "Not linked"}
						</Badge>
					</li>

					{providerDefinitions.map((provider) => {
						const Icon = provider.icon;
						const isLinked = linkedProviders.has(provider.id);
						const isLinking = linkingProvider === provider.id;

						return (
							<li
								key={provider.id}
								className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
							>
								<div className="flex items-start gap-3">
									<Icon className="mt-0.5 text-muted-foreground" />
									<div className="flex flex-col gap-1">
										<p className="font-medium text-foreground">
											{provider.label}
										</p>
										<p className="text-sm text-muted-foreground">
											{isLinked
												? "Already linked to this profile."
												: "Available to connect."}
										</p>
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
										{isLinking ? (
											<Loader2Icon
												data-icon="inline-start"
												className="animate-spin"
											/>
										) : null}
										Link
									</Button>
								)}
							</li>
						);
					})}
				</ul>
			</CardContent>
		</Card>
	);
}
