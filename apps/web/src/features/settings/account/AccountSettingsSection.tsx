import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { appRoutes } from "@/app/routes";
import { Card, CardContent } from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";
import { PageViewTrackingMount } from "@/features/analytics/tracking/PageViewTrackingMount";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { ProfileLinkedAccountsCard } from "@/features/settings/account/components/ProfileLinkedAccountsCard";
import { ProfileOverviewCard } from "@/features/settings/account/components/ProfileOverviewCard";
import { useAccountSettingsData } from "@/features/settings/account/use-account-settings-data";
import { authClient, signOut } from "@/lib/auth-client";

export function AccountSettingsSection() {
	const navigate = useNavigate();
	const data = useAccountSettingsData();
	const { trackAuthenticationAction } = useAnalyticsTracking();
	const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
	const [isSigningOut, setIsSigningOut] = useState(false);

	const handleLinkProvider = (provider: "google" | "github") => {
		trackAuthenticationAction({
			actionName: "link_provider",
			sourceComponent: "account_settings_section",
			targetId: provider,
			authMethod: provider,
		});
		setLinkingProvider(provider);
		authClient.linkSocial({
			provider,
			callbackURL: `${window.location.origin}${appRoutes.settingsAccount()}`,
		});
	};

	const handleSignOut = async () => {
		trackAuthenticationAction({
			actionName: "sign_out",
			sourceComponent: "account_settings_section",
			authMethod: "session",
		});
		setIsSigningOut(true);
		try {
			await signOut();
			navigate("/");
		} catch (cause) {
			setIsSigningOut(false);
			toast.error(
				cause instanceof Error ? cause.message : "Failed to sign out",
			);
		}
	};

	return (
		<>
			<PageViewTrackingMount
				isLoading={data.state.isPending}
				hasData={data.state.hasData}
				metrics={[
					{
						id: "linked_accounts",
						value: data.linkedProviders.size,
					},
				]}
				sections={[
					{
						id: "profile_summary",
						state: data.state.hasData ? "populated" : "empty",
					},
					{
						id: "linked_accounts",
						state: data.state.isPending
							? "hidden"
							: data.linkedProviders.size > 0
								? "populated"
								: "empty",
						itemCount: data.linkedProviders.size,
					},
				]}
			/>
			{data.state.isPending ? (
				<div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[1.05fr_1fr]">
					<Card
						size="sm"
						className="bg-card/95 shadow-none ring-1 ring-border/60"
					>
						<CardContent className="flex flex-col gap-4">
							<div className="flex items-center gap-4">
								<Skeleton className="size-10 rounded-full" />
								<div className="flex flex-1 flex-col gap-2">
									<Skeleton className="h-4 w-32 rounded-md" />
									<Skeleton className="h-3 w-40 rounded-md" />
								</div>
							</div>
							<Skeleton className="h-9 w-full rounded-md" />
							<Skeleton className="h-8 w-28 rounded-md" />
						</CardContent>
					</Card>
					<Card
						size="sm"
						className="bg-card/95 shadow-none ring-1 ring-border/60"
					>
						<CardContent className="flex flex-col gap-3">
							{["provider-1", "provider-2", "provider-3"].map((key) => (
								<div key={key} className="flex items-center justify-between">
									<div className="flex flex-col gap-2">
										<Skeleton className="h-4 w-28 rounded-md" />
										<Skeleton className="h-3 w-40 rounded-md" />
									</div>
									<Skeleton className="h-7 w-20 rounded-md" />
								</div>
							))}
						</CardContent>
					</Card>
				</div>
			) : (
				<div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[1.05fr_1fr]">
					<ProfileOverviewCard
						name={data.user.name}
						email={data.user.email}
						image={data.user.image}
						isSigningOut={isSigningOut}
						onSignOut={() => void handleSignOut()}
					/>
					<ProfileLinkedAccountsCard
						isPending={data.state.isPending}
						linkedProviders={data.linkedProviders}
						linkingProvider={linkingProvider}
						onLinkProvider={handleLinkProvider}
					/>
				</div>
			)}
		</>
	);
}
