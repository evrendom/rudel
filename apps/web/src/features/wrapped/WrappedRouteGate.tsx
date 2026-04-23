import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useIsMobile } from "@/app/hooks/use-mobile";
import { getWrappedShareIdFromSearch } from "@/app/routes";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import {
	type AppSession,
	getSessionUserEmail,
	getSessionUserId,
} from "@/features/auth/auth-route-utils";
import { useSetupProgress } from "@/features/get-started/use-setup-progress";
import { WrappedRouteStageShell } from "@/features/wrapped/route-stage-shell";
import { WrappedTeamCardPage } from "@/features/wrapped/team-card/page";
import { WrappedDesktopResumePromptPage } from "@/features/wrapped/WrappedDesktopResumePromptPage";
import { WrappedGuestPage } from "@/features/wrapped/WrappedGuestPage";
import { WrappedPublicPage } from "@/features/wrapped/WrappedPublicPage";
import { WrappedSetupCompletePage } from "@/features/wrapped/WrappedSetupCompletePage";
import { WrappedSetupPage } from "@/features/wrapped/WrappedSetupPage";
import {
	hasCompletedWrappedSetup,
	markWrappedSetupCompleted,
} from "@/features/wrapped/wrapped-setup-state";
import { useEffectOnceWhen } from "@/hooks/useEffectOnceWhen";
import { useMountEffect } from "@/hooks/useMountEffect";

interface WrappedRouteGateProps {
	isPending: boolean;
	publicId: string | null;
	session: AppSession | null;
}

export function WrappedRouteGate(props: WrappedRouteGateProps) {
	const { isPending, publicId, session } = props;
	const location = useLocation();
	const isMobile = useIsMobile();
	const { trackUtilityUsed } = useAnalyticsTracking({
		// The analytics contract still calls the public surface "wrapped_share".
		// Keep that stable until the event schema is renamed on the backend too.
		pageName: publicId ? "wrapped_share" : "wrapped_team_card",
	});
	const shareId = getWrappedShareIdFromSearch(location.search);
	const sessionUserId = getSessionUserId(session);
	const sessionUserEmail = getSessionUserEmail(session);
	const setupProgress = useSetupProgress({
		enabled: !publicId && !!session,
	});
	const [completedSetupUserIds, setCompletedSetupUserIds] = useState<
		Record<string, true>
	>({});
	const hasCompletedSetup =
		sessionUserId === null
			? false
			: completedSetupUserIds[sessionUserId] === true ||
				hasCompletedWrappedSetup(sessionUserId);

	function handleSetupComplete() {
		if (!sessionUserId) {
			return;
		}

		markWrappedSetupCompleted(sessionUserId);
		setCompletedSetupUserIds((currentState) => ({
			...currentState,
			[sessionUserId]: true,
		}));
	}

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

	if (setupProgress.isLoading) {
		return <WrappedSetupLoadingState />;
	}

	if (
		setupProgress.hasUploadedSessions &&
		sessionUserId &&
		!hasCompletedSetup
	) {
		return (
			<WrappedSetupCompletePage
				onContinue={handleSetupComplete}
				totalSessionCount={setupProgress.totalSessionCount}
				userId={sessionUserId}
			/>
		);
	}

	if (setupProgress.hasUploadedSessions) {
		return <WrappedTeamCardPage />;
	}

	if (isMobile && sessionUserEmail) {
		return (
			<WrappedDesktopResumePromptPage
				email={sessionUserEmail}
				shareId={shareId}
			/>
		);
	}

	return <WrappedSetupPage />;
}

function WrappedRouteLoadingState(props: { body: string }) {
	return (
		<WrappedRouteStageShell
			description={props.body}
			progressStepId="account-check"
			stage={
				<div className="mymind-wrapped-entry-card mymind-wrapped-entry-card--status">
					<div className="mymind-wrapped-entry-card__status-dot" />
					<p className="mymind-wrapped-entry-card__status-copy">
						Holding the route while auth, uploads, and share continuation are
						resolved.
					</p>
				</div>
			}
			title="Loading wrapped"
		/>
	);
}

function WrappedSetupLoadingState() {
	return (
		<WrappedRouteStageShell
			description="Checking whether your first Rudel sessions are already ready."
			progressStepId="desktop-ready"
			stage={
				<div className="mymind-wrapped-entry-card mymind-wrapped-entry-card--status">
					<div className="mymind-wrapped-entry-card__status-dot" />
					<p className="mymind-wrapped-entry-card__status-copy">
						Looking for uploaded sessions and any in-flight desktop handoff.
					</p>
				</div>
			}
			title="Checking your sessions"
		/>
	);
}
