import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useIsMobile } from "@/app/hooks/use-mobile";
import { getWrappedShareIdFromSearch } from "@/app/routes";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import {
	type AppSession,
	getSessionUserEmail,
} from "@/features/auth/auth-route-utils";
import { useSetupProgress } from "@/features/get-started/use-setup-progress";
import { WrappedRouteStageShell } from "@/features/wrapped/route-stage-shell";
import { WrappedTeamCardPage } from "@/features/wrapped/team-card/page";
import { WrappedDesktopResumePromptPage } from "@/features/wrapped/WrappedDesktopResumePromptPage";
import { WrappedGuestPage } from "@/features/wrapped/WrappedGuestPage";
import { WrappedPublicPage } from "@/features/wrapped/WrappedPublicPage";
import { WrappedSetupPage } from "@/features/wrapped/WrappedSetupPage";
import { useEffectOnceWhen } from "@/hooks/useEffectOnceWhen";
import { useMountEffect } from "@/hooks/useMountEffect";

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

	useMountEffect(() => {
		document.body.classList.add("mymind-wrapped-body");

		return () => {
			document.body.classList.remove("mymind-wrapped-body");
		};
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
		return (
			<WrappedRouteLoadingState body="Checking your account before loading wrapped..." />
		);
	}

	if (!session) {
		return <WrappedGuestPage />;
	}

	if (setupProgress.hasUploadedSessions) {
		return <WrappedTeamCardPage />;
	}

	if (setupProgress.isLoading) {
		return <WrappedSetupPage mode="checking" />;
	}

	if (isMobile && sessionUserEmail) {
		return (
			<WrappedDesktopResumePromptPage
				email={sessionUserEmail}
				shareId={shareId}
			/>
		);
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
		<WrappedRouteStageShell
			description={props.body}
			eyebrow="Account"
			stage={
				<div className="mymind-wrapped-entry-card mymind-wrapped-entry-card--status">
					<div className="mymind-wrapped-entry-card__status-dot" />
					<p className="mymind-wrapped-entry-card__status-copy">
						Holding the route while auth, uploads, and share continuation are
						resolved.
					</p>
				</div>
			}
			status="Geneva Wrapped"
			title="Loading wrapped"
		/>
	);
}
