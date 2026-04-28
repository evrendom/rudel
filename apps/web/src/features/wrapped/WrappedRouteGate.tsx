import { type ReactNode, startTransition, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/app/hooks/use-mobile";
import {
	getWrappedShareIdFromSearch,
	WRAPPED_ROUTE_FLOW_QUERY_PARAM,
	WRAPPED_ROUTE_SESSIONS_LANDED_FLOW,
} from "@/app/routes";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import {
	type AppSession,
	getSessionUserEmail,
	getSessionUserId,
} from "@/features/auth/auth-route-utils";
import { useSetupProgress } from "@/features/get-started/use-setup-progress";
import {
	STEP_PREVIEW_QUERY_PARAM_PREFIX,
	STEP_QUERY_PARAM,
} from "@/features/wrapped/onboarding/config";
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

type WrappedRouteFlowStage = "desktop-ready" | "sessions-landed" | "story";

const WRAPPED_SETUP_UPLOAD_STEP_ID = "enable-auto-upload";
const WRAPPED_SETUP_AUTH_COMPLETED_STEP_IDS = ["install-and-login"] as const;
const WRAPPED_SETUP_ALL_COMPLETED_STEP_IDS = [
	"install-and-login",
	"enable-auto-upload",
] as const;
const WRAPPED_SETUP_UPLOAD_COMPLETE_HOLD_MS = 900;

export function WrappedRouteGate(props: WrappedRouteGateProps) {
	const { isPending, publicId, session } = props;
	const location = useLocation();
	const [searchParams, setSearchParams] = useSearchParams();
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
	const [uploadSetupSeenUserIds, setUploadSetupSeenUserIds] = useState<
		Record<string, true>
	>({});
	const [uploadCompletionShownUserIds, setUploadCompletionShownUserIds] =
		useState<Record<string, true>>({});
	const uploadCompletionTimeoutRef = useRef<number | null>(null);
	const forcedFlowStage = getWrappedRouteFlowStage(
		searchParams.get(WRAPPED_ROUTE_FLOW_QUERY_PARAM),
	);
	const hasCompletedSetup =
		sessionUserId === null
			? false
			: completedSetupUserIds[sessionUserId] === true ||
				hasCompletedWrappedSetup(sessionUserId);
	const hasSeenUploadSetup =
		sessionUserId === null
			? false
			: uploadSetupSeenUserIds[sessionUserId] === true;
	const hasShownUploadCompletion =
		sessionUserId === null
			? false
			: uploadCompletionShownUserIds[sessionUserId] === true;
	const shouldShowUploadCompletionStep =
		sessionUserId !== null &&
		setupProgress.hasUploadedSessions &&
		!hasCompletedSetup &&
		hasSeenUploadSetup &&
		!hasShownUploadCompletion &&
		forcedFlowStage !== "story";
	const shouldForceSessionsLanded =
		forcedFlowStage === "sessions-landed" && setupProgress.hasUploadedSessions;
	const shouldForceDesktopReady =
		forcedFlowStage === "desktop-ready" && setupProgress.hasUploadedSessions;
	const shouldForceStory =
		forcedFlowStage === "story" && setupProgress.hasUploadedSessions;

	function setWrappedRouteFlowStage(nextStage: WrappedRouteFlowStage) {
		startTransition(() => {
			setSearchParams(
				(previousSearchParams) => {
					const nextSearchParams = new URLSearchParams(previousSearchParams);
					nextSearchParams.set(WRAPPED_ROUTE_FLOW_QUERY_PARAM, nextStage);
					return nextSearchParams;
				},
				{ replace: nextStage === "sessions-landed" },
			);
		});
	}

	function startWrappedStoryFromBeginning() {
		startTransition(() => {
			setSearchParams(
				(previousSearchParams) => {
					const nextSearchParams = new URLSearchParams(previousSearchParams);
					nextSearchParams.set(WRAPPED_ROUTE_FLOW_QUERY_PARAM, "story");
					nextSearchParams.delete(STEP_QUERY_PARAM);

					for (const key of Array.from(nextSearchParams.keys())) {
						if (key.startsWith(STEP_PREVIEW_QUERY_PARAM_PREFIX)) {
							nextSearchParams.delete(key);
						}
					}

					return nextSearchParams;
				},
				{ replace: false },
			);
		});
	}

	function handleSetupComplete() {
		if (!sessionUserId) {
			return;
		}

		markWrappedSetupCompleted(sessionUserId);
		setCompletedSetupUserIds((currentState) => ({
			...currentState,
			[sessionUserId]: true,
		}));
		startWrappedStoryFromBeginning();
	}

	useMountEffect(() => {
		document.body.classList.add("mymind-wrapped-body");

		return () => {
			if (uploadCompletionTimeoutRef.current !== null) {
				window.clearTimeout(uploadCompletionTimeoutRef.current);
			}
			document.body.classList.remove("mymind-wrapped-body");
		};
	});

	useEffectOnceWhen({
		effect: () => {
			if (!sessionUserId) {
				return;
			}

			setUploadSetupSeenUserIds((currentState) => ({
				...currentState,
				[sessionUserId]: true,
			}));
		},
		isReady:
			!publicId &&
			!isPending &&
			!!sessionUserId &&
			!!session &&
			!setupProgress.isLoading &&
			!setupProgress.hasUploadedSessions &&
			!(isMobile && sessionUserEmail),
		key: sessionUserId,
	});

	useEffectOnceWhen({
		effect: () => {
			if (!sessionUserId) {
				return;
			}

			uploadCompletionTimeoutRef.current = window.setTimeout(() => {
				uploadCompletionTimeoutRef.current = null;
				setUploadCompletionShownUserIds((currentState) => ({
					...currentState,
					[sessionUserId]: true,
				}));
				setWrappedRouteFlowStage("sessions-landed");
			}, WRAPPED_SETUP_UPLOAD_COMPLETE_HOLD_MS);
		},
		isReady: shouldShowUploadCompletionStep,
		key:
			sessionUserId === null
				? null
				: `${sessionUserId}:wrapped-upload-complete`,
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

	useEffectOnceWhen({
		effect: () => {
			if (forcedFlowStage !== null) {
				return;
			}

			setWrappedRouteFlowStage("sessions-landed");
		},
		isReady:
			!publicId &&
			!isPending &&
			!!sessionUserId &&
			setupProgress.hasUploadedSessions &&
			!hasCompletedSetup &&
			!shouldShowUploadCompletionStep,
		key: sessionUserId,
	});

	let content: ReactNode;

	if (publicId) {
		content = <WrappedPublicPage publicId={publicId} />;
	} else if (isPending) {
		content = (
			<WrappedRouteLoadingState body="Checking your account before loading wrapped..." />
		);
	} else if (!session) {
		content = <WrappedGuestPage />;
	} else if (shouldForceDesktopReady) {
		content = <WrappedUploadSetupPage />;
	} else if (shouldShowUploadCompletionStep) {
		content = <WrappedUploadSetupPage isUploadComplete />;
	} else if (
		sessionUserId &&
		(shouldForceSessionsLanded ||
			(setupProgress.hasUploadedSessions &&
				sessionUserId &&
				!hasCompletedSetup))
	) {
		content = (
			<WrappedSetupCompletePage
				onBack={() => setWrappedRouteFlowStage("desktop-ready")}
				onContinue={handleSetupComplete}
				totalSessionCount={setupProgress.totalSessionCount}
				userId={sessionUserId}
			/>
		);
	} else if (shouldForceStory || setupProgress.hasUploadedSessions) {
		content = (
			<WrappedTeamCardPage
				onBackFromFirstStep={() => setWrappedRouteFlowStage("sessions-landed")}
			/>
		);
	} else if (isMobile && sessionUserEmail) {
		content = (
			<WrappedDesktopResumePromptPage
				email={sessionUserEmail}
				shareId={shareId}
			/>
		);
	} else {
		content = <WrappedUploadSetupPage />;
	}

	return content;
}

function WrappedUploadSetupPage(props: { isUploadComplete?: boolean }) {
	return (
		<WrappedSetupPage
			completedStepIdsOverride={
				props.isUploadComplete
					? WRAPPED_SETUP_ALL_COMPLETED_STEP_IDS
					: WRAPPED_SETUP_AUTH_COMPLETED_STEP_IDS
			}
			currentStepIdOverride={
				props.isUploadComplete ? null : WRAPPED_SETUP_UPLOAD_STEP_ID
			}
		/>
	);
}

function getWrappedRouteFlowStage(
	flowStage: string | null,
): WrappedRouteFlowStage | null {
	return flowStage === "desktop-ready" ||
		flowStage === WRAPPED_ROUTE_SESSIONS_LANDED_FLOW ||
		flowStage === "story"
		? flowStage
		: null;
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
