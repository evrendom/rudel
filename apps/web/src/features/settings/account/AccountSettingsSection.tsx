import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { PageViewTrackingMount } from "@/features/analytics/tracking/PageViewTrackingMount";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { authClient, signOut } from "@/lib/auth-client";
import { appRoutes } from "@/app/routes";
import { ProfileActionsCard } from "@/features/settings/account/components/ProfileActionsCard";
import { ProfileAppearanceCard } from "@/features/settings/account/components/ProfileAppearanceCard";
import { ProfileLinkedAccountsCard } from "@/features/settings/account/components/ProfileLinkedAccountsCard";
import { ProfileSummaryCard } from "@/features/settings/account/components/ProfileSummaryCard";
import { Badge } from "@/app/ui/badge";
import { Card, CardContent } from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";
import { useAccountSettingsData } from "@/features/settings/account/use-account-settings-data";
import { SettingsSectionIntro } from "@/features/settings/components/SettingsSectionIntro";

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
			<div className="px-4 lg:px-6">
				<SettingsSectionIntro
					title="Account"
					description="Account identity and connected providers inside the redesign."
					action={<Badge variant="outline">Account</Badge>}
				/>
			</div>

			{data.state.isPending ? (
				<div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[1.1fr_1.4fr]">
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
				<div className="grid gap-4 px-4 lg:px-6 xl:grid-cols-[1.1fr_1.4fr]">
					<div className="flex flex-col gap-4">
						<ProfileSummaryCard
							name={data.user.name}
							email={data.user.email}
							image={data.user.image}
						/>
						<ProfileAppearanceCard />
						<ProfileActionsCard
							isSigningOut={isSigningOut}
							onSignOut={() => void handleSignOut()}
						/>
					</div>
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
