import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useIsMobile } from "@/app/hooks/use-mobile";
import { getWrappedShareIdFromSearch } from "@/app/routes";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import {
	type AppSession,
	getSessionUserEmail,
} from "@/features/auth/auth-route-utils";
import { GuestApp } from "@/features/auth/GuestApp";
import { DesktopResumePromptPage } from "@/features/get-started/DesktopResumePromptPage";
import { useSetupProgress } from "@/features/get-started/use-setup-progress";
import { useEffectOnceWhen } from "@/hooks/useEffectOnceWhen";
import { WrappedSetupPage } from "@/features/wrapped/WrappedSetupPage";
import { WrappedPublicPage } from "@/features/wrapped/WrappedPublicPage";
import { WrappedTeamCardPage } from "@/features/wrapped/team-card/page";

interface WrappedRouteGateProps {
	isPending: boolean;
	publicId: string | null;
	session: AppSession | null;
}

type SetupStage = "setup" | "waiting";

export function WrappedRouteGate(props: WrappedRouteGateProps) {
	const { isPending, publicId, session } = props;
	const location = useLocation();
	const isMobile = useIsMobile();
	const [setupStage, setSetupStage] = useState<SetupStage>("setup");
	const { trackUtilityUsed } = useAnalyticsTracking({
		// The analytics contract still calls the public surface "wrapped_share".
		// Keep that stable until the event schema is renamed on the backend too.
		pageName: publicId ? "wrapped_share" : "wrapped_team_card",
	});
	const shareId = getWrappedShareIdFromSearch(location.search);
	const sessionUserEmail = getSessionUserEmail(session);
	const setupProgress = useSetupProgress({
		enabled: !publicId && !!session,
	});

	useEffectOnceWhen({
		effect: () => {
			trackUtilityUsed({
				entrySource: "share_redirect",
				resolvedEntryRoute: location.pathname,
				shareId: shareId ?? undefined,
				sourceComponent: "wrapped_route_gate",
				targetId: shareId ?? undefined,
				utilityName: "onboardingStartedFromShare",
				utilityState: setupProgress.hasUploadedSessions
					? "sessionsReady"
					: "uploadRequired",
			});
		},
		isReady:
			!publicId &&
			!isPending &&
			!!session &&
			!!shareId &&
			!setupProgress.isLoading,
		key: shareId,
	});

	if (publicId) {
		return <WrappedPublicPage publicId={publicId} />;
	}

	if (isPending) {
		return <WrappedRouteLoadingState body="Checking your account before loading wrapped…" />;
	}

	if (!session) {
		return (
			<GuestApp
				description="Create an account or sign in first. Once you are in, this same route will take you through upload, waiting, and the wrapped story."
				eyebrow="Geneva Wrapped"
				showLogo={false}
				title="Sign in to start your wrapped"
			/>
		);
	}

	if (setupProgress.hasUploadedSessions) {
		return <WrappedTeamCardPage />;
	}

	if (setupProgress.isLoading) {
		return <WrappedSetupPage mode="checking" />;
	}

	if (isMobile && sessionUserEmail) {
		return <DesktopResumePromptPage email={sessionUserEmail} shareId={shareId} />;
	}

	if (setupStage === "waiting") {
		return (
			<WrappedSetupPage
				mode="waiting"
				onBackToSetup={() => setSetupStage("setup")}
			/>
		);
	}

	return (
		<WrappedSetupPage
			mode="setup"
			onWaitForFirstSession={() => setSetupStage("waiting")}
		/>
	);
}

function WrappedRouteLoadingState(props: { body: string }) {
	return (
		<div className="flex min-h-screen items-center bg-background px-4 py-6 sm:px-6 lg:px-8">
			<div className="mx-auto w-full max-w-2xl space-y-3 text-center">
				<p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
					Geneva Wrapped
				</p>
				<h1 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
					Loading wrapped
				</h1>
				<p className="text-sm leading-6 text-muted-foreground sm:text-[0.9375rem]">
					{props.body}
				</p>
			</div>
		</div>
	);
}
