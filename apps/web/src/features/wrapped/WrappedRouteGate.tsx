import {
	WRAPPED_ARCHETYPE_GATE_THRESHOLDS,
	type WrappedV1ArchetypeGate,
} from "@rudel/api-routes";
import { type ReactNode, startTransition, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useIsMobile } from "@/app/hooks/use-mobile";
import {
	getWrappedShareIdFromSearch,
	WRAPPED_ROUTE_CARD_PROFILE_FLOW,
	WRAPPED_ROUTE_DESKTOP_READY_FLOW,
	WRAPPED_ROUTE_FLOW_QUERY_PARAM,
	WRAPPED_ROUTE_SESSIONS_LANDED_FLOW,
} from "@/app/routes";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import {
	type AppSession,
	getSessionUserEmail,
	getSessionUserId,
	getSessionUserName,
} from "@/features/auth/auth-route-utils";
import { useCliSetupStatus } from "@/features/get-started/use-cli-setup-status";
import { useSetupProgress } from "@/features/get-started/use-setup-progress";
import {
	STEP_PREVIEW_QUERY_PARAM_PREFIX,
	STEP_QUERY_PARAM,
} from "@/features/wrapped/onboarding/config";
import { WrappedRouteStageShell } from "@/features/wrapped/route-stage-shell";
import { WrappedTeamCardPage } from "@/features/wrapped/team-card/page";
import { WrappedCardProfileStep } from "@/features/wrapped/WrappedCardProfileStep";
import { WrappedDesktopResumePromptPage } from "@/features/wrapped/WrappedDesktopResumePromptPage";
import { WrappedGuestPage } from "@/features/wrapped/WrappedGuestPage";
import { WrappedPublicPage } from "@/features/wrapped/WrappedPublicPage";
import {
	WrappedSetupCompletePage,
	type WrappedSetupSessionReadinessState,
} from "@/features/wrapped/WrappedSetupCompletePage";
import { WrappedSetupPage } from "@/features/wrapped/WrappedSetupPage";
import {
	buildWrappedCardProfileCompletedSnapshot,
	isWrappedCardProfileCompletedForUser,
	readWrappedGuestPreviewSnapshot,
	updateWrappedGuestPreviewProfile,
	type WrappedGuestPreviewProfile,
	type WrappedGuestPreviewProfileUpdates,
	writeWrappedGuestPreviewSnapshot,
} from "@/features/wrapped/wrapped-guest-preview";
import {
	hasCompletedWrappedSetup,
	markWrappedSetupCompleted,
} from "@/features/wrapped/wrapped-setup-state";
import { useEffectOnceWhen } from "@/hooks/useEffectOnceWhen";
import { useMountEffect } from "@/hooks/useMountEffect";
import { orpc } from "@/lib/orpc";

interface WrappedRouteGateProps {
	isPending: boolean;
	publicId: string | null;
	session: AppSession | null;
}

type WrappedRouteFlowStage =
	| "card-profile"
	| "desktop-ready"
	| "sessions-landed"
	| "story";

const WRAPPED_SETUP_AUTH_STEP_ID = "install-and-login";
const WRAPPED_SETUP_UPLOAD_STEP_ID = "enable-auto-upload";
const WRAPPED_SETUP_NO_COMPLETED_STEP_IDS = [] as const;
const WRAPPED_SETUP_AUTH_COMPLETED_STEP_IDS = [
	WRAPPED_SETUP_AUTH_STEP_ID,
] as const;
const WRAPPED_SETUP_ALL_COMPLETED_STEP_IDS = [
	WRAPPED_SETUP_AUTH_STEP_ID,
	WRAPPED_SETUP_UPLOAD_STEP_ID,
] as const;

export function WrappedRouteGate(props: WrappedRouteGateProps) {
	const { isPending, publicId, session } = props;
	const location = useLocation();
	const [searchParams, setSearchParams] = useSearchParams();
	const isMobile = useIsMobile();
	const {
		trackWrappedActivationCompleted,
		trackWrappedOnboardingStarted,
		trackWrappedProfileCompleted,
		trackWrappedReferredSignupCompleted,
	} = useAnalyticsTracking({
		// The analytics contract still calls the public surface "wrapped_share".
		// Keep that stable until the event schema is renamed on the backend too.
		pageName: publicId ? "wrapped_share" : "wrapped_team_card",
	});
	const shareId = getWrappedShareIdFromSearch(location.search);
	const wrappedLoopEntrySource = shareId ? "share_redirect" : "direct";
	const sessionUserId = getSessionUserId(session);
	const sessionUserEmail = getSessionUserEmail(session);
	const setupProgress = useSetupProgress({
		enabled: !publicId && !!session,
	});
	const shouldQueryWrappedArchetypeGate =
		!publicId &&
		!!session &&
		setupProgress.hasUploadedSessions &&
		setupProgress.totalSessionCount >=
			WRAPPED_ARCHETYPE_GATE_THRESHOLDS.min_total_sessions;
	const cliSetupStatus = useCliSetupStatus({
		enabled: !publicId && !!session,
	});
	const [completedSetupUserIds, setCompletedSetupUserIds] = useState<
		Record<string, true>
	>({});
	const [usersSeenBelowMinimumSessions, setUsersSeenBelowMinimumSessions] =
		useState<Record<string, true>>({});
	const [completedCardProfileUserIds, setCompletedCardProfileUserIds] =
		useState<Record<string, true>>({});
	const [guestPreviewSnapshot, setGuestPreviewSnapshot] = useState(() =>
		readWrappedGuestPreviewSnapshot(),
	);
	const defaultCardProfile = buildWrappedSessionPreviewProfile(session);
	const [editableCardProfile, setEditableCardProfile] =
		useState<WrappedGuestPreviewProfile | null>(() =>
			hydrateWrappedCardProfileFromSession(
				guestPreviewSnapshot?.profile ?? null,
				defaultCardProfile,
			),
		);
	const forcedFlowStage = getWrappedRouteFlowStage(
		searchParams.get(WRAPPED_ROUTE_FLOW_QUERY_PARAM),
	);
	const isWrappedNewUserFlow =
		forcedFlowStage === WRAPPED_ROUTE_CARD_PROFILE_FLOW;

	const hasCompletedSetup =
		sessionUserId === null
			? false
			: completedSetupUserIds[sessionUserId] === true ||
				hasCompletedWrappedSetup(sessionUserId);
	const hasCompletedCardProfile =
		sessionUserId !== null &&
		(completedCardProfileUserIds[sessionUserId] === true ||
			isWrappedCardProfileCompletedForUser(
				guestPreviewSnapshot,
				sessionUserId,
			));
	const isKnownWrappedNewUser =
		isWrappedNewUserFlow ||
		(sessionUserId !== null &&
			completedCardProfileUserIds[sessionUserId] === true);
	const hasCompletedCardProfileWithImage =
		sessionUserId !== null &&
		(completedCardProfileUserIds[sessionUserId] === true ||
			(isWrappedCardProfileCompletedForUser(
				guestPreviewSnapshot,
				sessionUserId,
			) &&
				hasWrappedCardProfileImage(guestPreviewSnapshot?.profile ?? null)));
	const activeCardProfile = hydrateWrappedCardProfileFromSession(
		editableCardProfile,
		defaultCardProfile,
	);
	const hasActiveCardProfileImage =
		hasWrappedCardProfileImage(activeCardProfile);
	const hasSessionUserImage = getSessionUserImage(session) !== null;
	const needsCardProfileBeforeSetup =
		!publicId &&
		!isPending &&
		!!session &&
		sessionUserId !== null &&
		activeCardProfile !== null &&
		!hasSessionUserImage &&
		!hasCompletedCardProfileWithImage;
	const shouldShowCardProfileStep =
		!publicId &&
		!isPending &&
		!!session &&
		sessionUserId !== null &&
		(forcedFlowStage === WRAPPED_ROUTE_CARD_PROFILE_FLOW ||
			needsCardProfileBeforeSetup) &&
		activeCardProfile !== null;
	const shouldBacktrackToCardProfile =
		forcedFlowStage === WRAPPED_ROUTE_DESKTOP_READY_FLOW &&
		hasCompletedCardProfile;
	const shouldForceSessionsLanded =
		forcedFlowStage === "sessions-landed" && setupProgress.hasUploadedSessions;
	const shouldForceDesktopReady =
		forcedFlowStage === WRAPPED_ROUTE_DESKTOP_READY_FLOW;
	const hasMinimumSetupProgressSessionCount =
		setupProgress.totalSessionCount >=
		WRAPPED_ARCHETYPE_GATE_THRESHOLDS.min_total_sessions;
	const hasSeenBelowMinimumSessions =
		sessionUserId !== null &&
		usersSeenBelowMinimumSessions[sessionUserId] === true;
	const hasReachedMinimumAfterMissing =
		setupProgress.hasUploadedSessions &&
		hasMinimumSetupProgressSessionCount &&
		hasSeenBelowMinimumSessions;
	const signedInMobileHandoffEmail = isMobile ? sessionUserEmail : undefined;

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

	function handleSetupComplete(isWrappedArchetypeGateEligible: boolean) {
		if (!isWrappedArchetypeGateEligible) {
			return;
		}

		if (!sessionUserId) {
			return;
		}

		markWrappedSetupCompleted(sessionUserId);
		setCompletedSetupUserIds((currentState) => ({
			...currentState,
			[sessionUserId]: true,
		}));
		trackWrappedActivationCompleted({
			activationState: "setup_completed",
			entrySource: wrappedLoopEntrySource,
			isNewUser: isKnownWrappedNewUser,
			resolvedEntryRoute: location.pathname,
			sourceComponent: "wrapped_route_gate",
			sourceShareId: shareId ?? undefined,
		});
		startWrappedStoryFromBeginning();
	}

	function handleSetupContinue() {
		if (!setupProgress.hasUploadedSessions) {
			return;
		}

		setWrappedRouteFlowStage("sessions-landed");
	}

	function updateEditableCardProfile(
		updates: WrappedGuestPreviewProfileUpdates,
	) {
		setEditableCardProfile((currentProfile) =>
			updateWrappedGuestPreviewProfile({
				currentProfile: currentProfile ?? defaultCardProfile,
				fallbackValue: "you",
				updates,
			}),
		);
	}

	function completeCardProfile() {
		if (!sessionUserId || !activeCardProfile) {
			return;
		}

		const completedSnapshot = buildWrappedCardProfileCompletedSnapshot({
			profile: activeCardProfile,
			userId: sessionUserId,
		});
		writeWrappedGuestPreviewSnapshot(completedSnapshot);
		setGuestPreviewSnapshot(completedSnapshot);
		setCompletedCardProfileUserIds((currentState) => ({
			...currentState,
			[sessionUserId]: true,
		}));
		trackWrappedProfileCompleted({
			activationState: "profile_completed",
			entrySource: wrappedLoopEntrySource,
			isNewUser: true,
			resolvedEntryRoute: location.pathname,
			sourceComponent: "wrapped_route_gate",
			sourceShareId: shareId ?? undefined,
		});
		setWrappedRouteFlowStage(WRAPPED_ROUTE_DESKTOP_READY_FLOW);
	}

	useMountEffect(() => {
		document.body.classList.add("mymind-wrapped-body");

		return () => {
			document.body.classList.remove("mymind-wrapped-body");
		};
	});

	useEffectOnceWhen({
		effect: () => {
			if (!shareId) {
				return;
			}

			trackWrappedReferredSignupCompleted({
				activationState: "signup_completed",
				entrySource: "share_redirect",
				isNewUser: true,
				resolvedEntryRoute: location.pathname,
				sourceComponent: "wrapped_route_gate",
				sourceShareId: shareId,
			});
		},
		isReady:
			!publicId &&
			!isPending &&
			!!session &&
			sessionUserId !== null &&
			shareId !== null &&
			isWrappedNewUserFlow,
		key: `${shareId ?? "none"}:${sessionUserId ?? "anonymous"}`,
	});

	useEffectOnceWhen({
		effect: () => {
			trackWrappedOnboardingStarted({
				activationState: setupProgress.hasUploadedSessions
					? "sessions_ready"
					: "upload_required",
				entrySource: wrappedLoopEntrySource,
				isNewUser: isKnownWrappedNewUser,
				resolvedEntryRoute: location.pathname,
				sourceComponent: "wrapped_route_gate",
				sourceShareId: shareId ?? undefined,
			});
		},
		isReady: !publicId && !isPending && !!session && !setupProgress.isLoading,
		key: shareId ?? sessionUserId,
	});

	useEffectOnceWhen({
		effect: () => {
			if (sessionUserId === null) {
				return;
			}

			setUsersSeenBelowMinimumSessions((currentState) => ({
				...currentState,
				[sessionUserId]: true,
			}));
		},
		isReady:
			sessionUserId !== null &&
			setupProgress.hasUploadedSessions &&
			!hasMinimumSetupProgressSessionCount,
		key: sessionUserId,
	});

	function renderRouteContent(archetypeGateState: WrappedArchetypeGateState) {
		const sessionGateState = getWrappedRouteSessionGateState({
			archetypeGate: archetypeGateState.archetypeGate,
			hasReachedMinimumAfterMissing,
			isArchetypeGateLoading: archetypeGateState.isLoading,
			setupProgressHasUploadedSessions: setupProgress.hasUploadedSessions,
			setupProgressTotalSessionCount: setupProgress.totalSessionCount,
		});
		const canContinueToWrappedStory = sessionGateState.canContinueToStory;
		const shouldWaitForWrappedStoryData =
			setupProgress.hasUploadedSessions &&
			sessionGateState.isWaitingForStoryData;
		const shouldHoldForMinimumSessions =
			setupProgress.hasUploadedSessions &&
			!sessionGateState.hasMinimumSessionCount;
		const shouldForceStory =
			forcedFlowStage === "story" &&
			setupProgress.hasUploadedSessions &&
			canContinueToWrappedStory;

		let content: ReactNode;

		if (publicId) {
			content = <WrappedPublicPage publicId={publicId} />;
		} else if (isPending) {
			content = (
				<WrappedRouteLoadingState body="Checking your account before loading wrapped..." />
			);
		} else if (!session) {
			content = <WrappedGuestPage />;
		} else if (shouldShowCardProfileStep) {
			content = (
				<WrappedCardProfileStep
					backLabel="Back to setup"
					displayName={activeCardProfile.displayName}
					imageUrl={activeCardProfile.imageUrl}
					isComplete={
						activeCardProfile.displayName.trim().length > 0 &&
						(!needsCardProfileBeforeSetup || hasActiveCardProfileImage)
					}
					onBack={() =>
						setWrappedRouteFlowStage(WRAPPED_ROUTE_DESKTOP_READY_FLOW)
					}
					onContinue={completeCardProfile}
					onDisplayNameChange={(displayName) =>
						updateEditableCardProfile({ displayName })
					}
					onImageChange={(imageUrl) => updateEditableCardProfile({ imageUrl })}
					previewProfile={activeCardProfile}
				/>
			);
		} else if (signedInMobileHandoffEmail) {
			content = (
				<WrappedDesktopResumePromptPage
					email={signedInMobileHandoffEmail}
					shareId={shareId}
				/>
			);
		} else if (shouldForceDesktopReady) {
			content = (
				<WrappedUploadSetupPage
					hasCompletedCliLogin={
						cliSetupStatus.hasCliLogin || setupProgress.hasUploadedSessions
					}
					isUploadComplete={setupProgress.hasUploadedSessions}
					onBackToCardProfile={
						shouldBacktrackToCardProfile
							? () => setWrappedRouteFlowStage(WRAPPED_ROUTE_CARD_PROFILE_FLOW)
							: undefined
					}
					onContinue={handleSetupContinue}
				/>
			);
		} else if (shouldWaitForWrappedStoryData) {
			content = <WrappedRouteLoadingState body="Preparing your wrapped..." />;
		} else if (sessionUserId && shouldForceSessionsLanded) {
			content = (
				<WrappedSetupCompletePage
					canContinueToStory={canContinueToWrappedStory}
					defaultUploadMoreVisible={sessionGateState.defaultUploadMoreVisible}
					minimumSessionCount={sessionGateState.minimumSessionCount}
					onBack={() => setWrappedRouteFlowStage("desktop-ready")}
					onContinue={() => handleSetupComplete(canContinueToWrappedStory)}
					sessionReadinessState={sessionGateState.sessionReadinessState}
					totalSessionCount={sessionGateState.totalSessionCount}
					userId={sessionUserId}
				/>
			);
		} else if (sessionUserId && shouldHoldForMinimumSessions) {
			content = (
				<WrappedSetupCompletePage
					canContinueToStory={canContinueToWrappedStory}
					defaultUploadMoreVisible={sessionGateState.defaultUploadMoreVisible}
					minimumSessionCount={sessionGateState.minimumSessionCount}
					onBack={() => setWrappedRouteFlowStage("desktop-ready")}
					onContinue={() => handleSetupComplete(canContinueToWrappedStory)}
					sessionReadinessState={sessionGateState.sessionReadinessState}
					totalSessionCount={sessionGateState.totalSessionCount}
					userId={sessionUserId}
				/>
			);
		} else if (
			sessionUserId &&
			sessionGateState.hasReachedMinimumAfterMissing
		) {
			content = (
				<WrappedSetupCompletePage
					canContinueToStory={canContinueToWrappedStory}
					defaultUploadMoreVisible={false}
					minimumSessionCount={sessionGateState.minimumSessionCount}
					onBack={() => setWrappedRouteFlowStage("desktop-ready")}
					onContinue={() => handleSetupComplete(canContinueToWrappedStory)}
					sessionReadinessState={sessionGateState.sessionReadinessState}
					totalSessionCount={sessionGateState.totalSessionCount}
					userId={sessionUserId}
				/>
			);
		} else if (
			shouldForceStory ||
			(setupProgress.hasUploadedSessions &&
				hasCompletedSetup &&
				canContinueToWrappedStory)
		) {
			content = (
				<WrappedTeamCardPage
					onBackFromFirstStep={() =>
						setWrappedRouteFlowStage("sessions-landed")
					}
				/>
			);
		} else {
			content = (
				<WrappedUploadSetupPage
					hasCompletedCliLogin={
						cliSetupStatus.hasCliLogin || setupProgress.hasUploadedSessions
					}
					isUploadComplete={setupProgress.hasUploadedSessions}
					onBackToCardProfile={
						shouldBacktrackToCardProfile
							? () => setWrappedRouteFlowStage(WRAPPED_ROUTE_CARD_PROFILE_FLOW)
							: undefined
					}
					onContinue={handleSetupContinue}
				/>
			);
		}

		return content;
	}

	if (shouldQueryWrappedArchetypeGate) {
		return (
			<WrappedArchetypeGateQuery>
				{(archetypeGateState) => renderRouteContent(archetypeGateState)}
			</WrappedArchetypeGateQuery>
		);
	}

	return renderRouteContent({ archetypeGate: null, isLoading: false });
}

interface WrappedArchetypeGateState {
	archetypeGate: WrappedV1ArchetypeGate | null;
	isLoading: boolean;
}

function WrappedArchetypeGateQuery(props: {
	children: (state: WrappedArchetypeGateState) => ReactNode;
}) {
	const wrappedV1Query = useAnalyticsQuery({
		...orpc.analytics.wrapped.v1.queryOptions({}),
		enabled: true,
	});

	return props.children({
		archetypeGate: wrappedV1Query.data?.archetype_gate ?? null,
		isLoading: wrappedV1Query.isLoading,
	});
}

function buildWrappedSessionPreviewProfile(
	session: AppSession | null,
): WrappedGuestPreviewProfile | null {
	const displayName =
		getMeaningfulSessionDisplayName(getSessionUserName(session)) ??
		getEmailHandle(getSessionUserEmail(session)) ??
		"you";
	const username = getWrappedSessionProfileUsername({
		email: getSessionUserEmail(session),
		name: displayName,
		userId: getSessionUserId(session),
	});

	if (!username) {
		return null;
	}

	return {
		displayName,
		followerCount: null,
		imageUrl: getSessionUserImage(session),
		source: "local",
		username,
		verified: false,
	};
}

function hydrateWrappedCardProfileFromSession(
	profile: WrappedGuestPreviewProfile | null,
	defaultProfile: WrappedGuestPreviewProfile | null,
): WrappedGuestPreviewProfile | null {
	if (!profile) {
		return defaultProfile;
	}

	if (!defaultProfile) {
		return profile;
	}

	return {
		...profile,
		imageUrl: profile.imageUrl ?? defaultProfile.imageUrl,
	};
}

function getSessionUserImage(session: AppSession | null | undefined) {
	return session?.user &&
		"image" in session.user &&
		typeof session.user.image === "string" &&
		session.user.image.trim().length > 0
		? session.user.image.trim()
		: null;
}

function hasWrappedCardProfileImage(
	profile: WrappedGuestPreviewProfile | null,
) {
	return typeof profile?.imageUrl === "string" && profile.imageUrl.length > 0;
}

function getEmailHandle(email: string | undefined) {
	if (!email) {
		return undefined;
	}

	const [emailHandle] = email.split("@");
	return emailHandle?.trim() || undefined;
}

function getMeaningfulSessionDisplayName(value: string | undefined) {
	const trimmedValue = value?.trim();
	return trimmedValue && trimmedValue.toLowerCase() !== "operator"
		? trimmedValue
		: undefined;
}

function getWrappedSessionProfileUsername(input: {
	email: string | undefined;
	name: string;
	userId: string | null;
}) {
	const candidates = [
		input.userId ?? "",
		getEmailHandle(input.email) ?? "",
		input.name,
		"you",
	];

	for (const candidate of candidates) {
		const username = candidate.replace(/[^A-Za-z0-9_]+/gu, "_").slice(0, 15);
		if (/^[A-Za-z0-9_]{1,15}$/u.test(username)) {
			return username;
		}
	}

	return null;
}

function WrappedUploadSetupPage(props: {
	hasCompletedCliLogin?: boolean;
	isUploadComplete?: boolean;
	onBackToCardProfile?: () => void;
	onContinue?: () => void;
}) {
	const completedStepIdsOverride = props.isUploadComplete
		? WRAPPED_SETUP_ALL_COMPLETED_STEP_IDS
		: props.hasCompletedCliLogin
			? WRAPPED_SETUP_AUTH_COMPLETED_STEP_IDS
			: WRAPPED_SETUP_NO_COMPLETED_STEP_IDS;
	const currentStepIdOverride = props.isUploadComplete
		? null
		: props.hasCompletedCliLogin
			? WRAPPED_SETUP_UPLOAD_STEP_ID
			: WRAPPED_SETUP_AUTH_STEP_ID;

	return (
		<WrappedSetupPage
			backLabel="Back to card setup"
			completedStepIdsOverride={completedStepIdsOverride}
			currentStepIdOverride={currentStepIdOverride}
			onBack={props.onBackToCardProfile}
			onContinue={props.onContinue}
		/>
	);
}

function getWrappedRouteFlowStage(
	flowStage: string | null,
): WrappedRouteFlowStage | null {
	return flowStage === WRAPPED_ROUTE_CARD_PROFILE_FLOW ||
		flowStage === WRAPPED_ROUTE_DESKTOP_READY_FLOW ||
		flowStage === WRAPPED_ROUTE_SESSIONS_LANDED_FLOW ||
		flowStage === "story"
		? flowStage
		: null;
}

function getWrappedRouteSessionGateState(input: {
	archetypeGate: WrappedV1ArchetypeGate | null;
	hasReachedMinimumAfterMissing: boolean;
	isArchetypeGateLoading: boolean;
	setupProgressHasUploadedSessions: boolean;
	setupProgressTotalSessionCount: number;
}) {
	const minimumSessionCount =
		input.archetypeGate?.thresholds.min_total_sessions ??
		WRAPPED_ARCHETYPE_GATE_THRESHOLDS.min_total_sessions;
	const totalSessionCount =
		input.archetypeGate?.values.total_sessions ??
		input.setupProgressTotalSessionCount;
	const hasMinimumArchetypeSessionCount =
		totalSessionCount >= minimumSessionCount;
	const isWaitingForStoryData =
		hasMinimumArchetypeSessionCount &&
		(input.isArchetypeGateLoading ||
			input.archetypeGate === null ||
			input.archetypeGate.reason === "processing_archetype");
	const canContinueToStory =
		hasMinimumArchetypeSessionCount && !isWaitingForStoryData;

	return {
		canContinueToStory,
		defaultUploadMoreVisible:
			input.setupProgressHasUploadedSessions &&
			!canContinueToStory &&
			!isWaitingForStoryData &&
			!hasMinimumArchetypeSessionCount,
		hasReachedMinimumAfterMissing:
			canContinueToStory && input.hasReachedMinimumAfterMissing,
		hasMinimumSessionCount: hasMinimumArchetypeSessionCount,
		isWaitingForStoryData,
		minimumSessionCount,
		sessionReadinessState: getWrappedSetupSessionReadinessState({
			hasMinimumArchetypeSessionCount,
			hasReachedMinimumAfterMissing:
				canContinueToStory && input.hasReachedMinimumAfterMissing,
		}),
		totalSessionCount,
	};
}

function getWrappedSetupSessionReadinessState(input: {
	hasMinimumArchetypeSessionCount: boolean;
	hasReachedMinimumAfterMissing: boolean;
}): WrappedSetupSessionReadinessState {
	if (!input.hasMinimumArchetypeSessionCount) {
		return "missing";
	}

	return input.hasReachedMinimumAfterMissing
		? "enough-uploaded"
		: "enough-landed";
}

function WrappedRouteLoadingState(props: { body: string }) {
	return (
		<WrappedRouteStageShell
			progressStepId="account-check"
			stageClassName="mymind-wrapped-entry-stage--route-loading"
			stage={
				<div
					aria-busy="true"
					aria-live="polite"
					className="mymind-wrapped-route-loading"
				>
					<h1 className="sr-only">Loading wrapped</h1>
					<img
						alt="Rudel"
						className="mymind-wrapped-route-loading__logo"
						src="/favicon-light.svg"
					/>
					<p className="mymind-wrapped-route-loading__copy">{props.body}</p>
				</div>
			}
		/>
	);
}
