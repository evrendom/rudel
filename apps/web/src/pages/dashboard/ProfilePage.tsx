import { Github, Loader2, LogOut, Mail, User } from "lucide-react";
import { useState } from "react";
import { AnalyticsCard } from "../../components/analytics/AnalyticsCard";
import { PageHeader } from "../../components/analytics/PageHeader";
import { Button } from "../../components/ui/button";
import { useAccounts } from "../../hooks/useAccounts";
import { useUiControlTracking } from "../../hooks/useDashboardAnalytics";
import { useTrackDashboardView } from "../../hooks/useTrackDashboardView";
import { authClient, signOut } from "../../lib/auth-client";

const providers = [
	{ id: "google", label: "Google", icon: Mail },
	{ id: "github", label: "GitHub", icon: Github },
] as const;

export function ProfilePage() {
	const { data: session } = authClient.useSession();
	const { accounts, isLoading: loading } = useAccounts();
	const [linkingProvider, setLinkingProvider] = useState<string | null>(null);
	const { trackUiControl } = useUiControlTracking();

	const linkedProviders = new Set(accounts.map((a) => a.providerId));

	useTrackDashboardView({
		isLoading: loading,
		hasData: true,
	});

	return (
		<div className="px-8 py-6">
			<PageHeader
				title="Profile"
				description="Manage your account and linked providers"
			/>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<AnalyticsCard>
					<div className="flex items-center gap-4 mb-6">
						{session?.user.image ? (
							<img
								src={session.user.image}
								alt=""
								className="h-12 w-12 rounded-full"
							/>
						) : (
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-hover">
								<User className="h-6 w-6 text-muted" />
							</div>
						)}
						<div>
							<h2 className="text-lg font-semibold text-heading">
								{session?.user.name}
							</h2>
							<p className="text-sm text-muted">{session?.user.email}</p>
						</div>
					</div>

					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							trackUiControl({
								controlName: "profile_sign_out",
								controlType: "button",
								interactionType: "click",
							});
							signOut();
						}}
					>
						<LogOut className="h-4 w-4 mr-2" />
						Sign out
					</Button>
				</AnalyticsCard>

				<AnalyticsCard>
					<h2 className="text-lg font-semibold text-heading mb-4">
						Linked Accounts
					</h2>

					{loading ? (
						<p className="text-sm text-muted">Loading accounts...</p>
					) : (
						<div className="flex flex-col gap-3">
							{linkedProviders.has("credential") && (
								<div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
									<div className="flex items-center gap-3">
										<Mail className="h-4 w-4 text-muted" />
										<span className="text-sm font-medium text-subheading">
											Email & Password
										</span>
									</div>
									<span className="text-xs font-medium text-status-success-icon">
										Connected
									</span>
								</div>
							)}

							{providers.map((provider) => {
								const isLinked = linkedProviders.has(provider.id);
								const Icon = provider.icon;

								return (
									<div
										key={provider.id}
										className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
									>
										<div className="flex items-center gap-3">
											<Icon className="h-4 w-4 text-muted" />
											<span className="text-sm font-medium text-subheading">
												{provider.label}
											</span>
										</div>
										{isLinked ? (
											<span className="text-xs font-medium text-status-success-icon">
												Connected
											</span>
										) : (
											<Button
												variant="outline"
												size="xs"
												disabled={linkingProvider !== null}
												onClick={() => {
													trackUiControl({
														controlName: "profile_link_provider",
														controlType: "button",
														interactionType: "click",
														value: provider.id,
													});
													setLinkingProvider(provider.id);
													authClient.linkSocial({
														provider: provider.id,
														callbackURL: `${window.location.origin}/dashboard/profile`,
													});
												}}
											>
												{linkingProvider === provider.id && (
													<Loader2 className="h-3 w-3 animate-spin" />
												)}
												Link
											</Button>
										)}
									</div>
								);
							})}
						</div>
					)}
				</AnalyticsCard>
			</div>
		</div>
	);
}
