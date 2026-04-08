import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardContent } from "@/app/ui/card";
import { Skeleton } from "@/app/ui/skeleton";
import { ProfileActionsCard } from "@/features/settings/account/components/ProfileActionsCard";
import { ProfileLinkedAccountsCard } from "@/features/settings/account/components/ProfileLinkedAccountsCard";
import { ProfileSummaryCard } from "@/features/settings/account/components/ProfileSummaryCard";
import { useAccountSettingsData } from "@/features/settings/account/use-account-settings-data";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import {
	type DashboardMetric,
	type DashboardSection,
	useTrackDashboardView,
} from "@/hooks/useTrackDashboardView";
import { authClient, signOut } from "@/lib/auth-client";

export function AccountSettingsSection() {
	const navigate = useNavigate();
	const data = useAccountSettingsData();
	const { trackAuthenticationAction } = useAnalyticsTracking({
		pageName: "profile",
	});
	const [isSigningOut, setIsSigningOut] = useState(false);
	const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
	const metrics: DashboardMetric[] = [
		{
			id: "linked_accounts",
			value: data.linkedProviders.size,
		},
	];
	const sections: DashboardSection[] = [
		{
			id: "profile_summary",
			state: data.state.hasData ? "populated" : "empty",
		},
		{
			id: "profile_actions",
			state: data.state.isPending ? "hidden" : "populated",
		},
		{
			id: "linked_accounts",
			itemCount: data.linkedProviders.size,
			state: data.state.isPending
				? "hidden"
				: data.linkedProviders.size > 0
					? "populated"
					: "empty",
		},
	];

	useTrackDashboardView({
		hasData: data.state.hasData,
		isLoading: data.state.isPending,
		metrics,
		sections,
	});

	function handleLinkProvider(provider: "google" | "github") {
		trackAuthenticationAction({
			actionName: "link_provider",
			authMethod: provider,
			sourceComponent: "account_settings_section",
			targetId: provider,
		});
		setLinkingProvider(provider);
		authClient.linkSocial({
			callbackURL: `${window.location.origin}/dashboard/profile`,
			provider,
		});
	}

	async function handleSignOut() {
		trackAuthenticationAction({
			actionName: "sign_out",
			authMethod: "session",
			sourceComponent: "account_settings_section",
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
	}

	if (data.state.isPending) {
		return (
			<div className="grid gap-4 px-4 py-4 lg:px-6 xl:grid-cols-[1.05fr_1fr]">
				<div className="flex flex-col gap-4">
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
						</CardContent>
					</Card>
					<Card
						size="sm"
						className="bg-card/95 shadow-none ring-1 ring-border/60"
					>
						<CardContent className="flex flex-col gap-3">
							<Skeleton className="h-9 w-32 rounded-md" />
						</CardContent>
					</Card>
				</div>
				<Card
					size="sm"
					className="bg-card/95 shadow-none ring-1 ring-border/60"
				>
					<CardContent className="flex flex-col gap-3">
						{["provider-1", "provider-2", "provider-3"].map((key) => (
							<div className="flex items-center justify-between" key={key}>
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
		);
	}

	return (
		<div className="grid gap-4 px-4 py-4 lg:px-6 xl:grid-cols-[1.05fr_1fr]">
			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-1">
					<h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
						Account settings
					</h1>
					<p className="max-w-2xl text-sm text-muted-foreground">
						Manage your profile identity and linked sign-in methods.
					</p>
				</div>

				<ProfileSummaryCard
					email={data.user.email}
					image={data.user.image}
					name={data.user.name}
				/>
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
	);
}
