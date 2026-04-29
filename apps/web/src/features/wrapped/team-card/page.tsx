import {
	WRAPPED_SHARE_PAYLOAD_VERSION,
	type WrappedShareAppearance,
} from "@rudel/api-routes";
import { useDialKit } from "dialkit";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	type CSSProperties,
	cloneElement,
	isValidElement,
	type ReactNode,
	startTransition,
	// biome-ignore lint/style/noRestrictedImports: final-card handoff measurement is an imperative storyboard bridge for this wrapped surface.
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { appRoutes, getWrappedShareIdFromSearch } from "@/app/routes";
import { Button } from "@/app/ui/button";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { markWrappedCompleted } from "@/features/wrapped/entry";
import { WrappedTeamCardOnboarding } from "@/features/wrapped/onboarding/shell";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import { useMountEffect } from "@/hooks/useMountEffect";
import { formatCompactWholeCurrency } from "@/lib/format";
import {
	getWrappedArchetypeCardBackgroundValue,
	WRAPPED_ARCHETYPE_CARD_THEMES,
	type WrappedArchetypeCardTheme,
} from "./archetypes";
import { buildWrappedTeamCardBackMetrics } from "./back-metrics";
import {
	WrappedTeamMemberCard,
	type WrappedTeamMemberCardHeaderMetric,
	type WrappedTeamMemberCardStatItem,
	type WrappedTeamMemberCardStatLayerOpacities,
	type WrappedTeamMemberCardTheme,
} from "./card";
import {
	WrappedTeamCardRevealStage,
	WrappedTeamCardShareStage,
} from "./final-stages";
import { createWrappedTeamCardShareActions } from "./share";
import {
	DEFAULT_WRAPPED_SHARE_APPEARANCE,
	resolveWrappedShareAppearance,
} from "./share-appearance";
import { buildWrappedShareSafeRow } from "./share-media";
import { buildWrappedShareSnapshot } from "./share-snapshot";
import {
	useWrappedCardTilt,
	type WrappedCardTiltController,
} from "./tilt/use-card-tilt";
import { useWrappedTeamCardPageData } from "./use-page-data";
import { useWrappedTeamCardShare } from "./use-share";
import { formatShareCardCreatedAt, getWrappedArchetypeIndex } from "./utils";
import "@/features/wrapped/wrapped.css";

type FinalCardStage = "reveal" | "share";
type FinalCardHandoffPhase = "idle" | "preparing" | "shared";
type FinalCardFlightRect = {
	left: number;
	scale: number;
	top: number;
};
type FinalCardFlight = {
	from: FinalCardFlightRect;
	key: number;
	to?: FinalCardFlightRect;
};

const FINAL_CARD_HANDOFF_PREPARE_MS = 96;
const FINAL_CARD_FLIGHT_CARD_WIDTH = 233;
const FINAL_CARD_FLIGHT_DURATION_MS = 720;
const FINAL_CARD_FLIGHT_SETTLE_MS = 90;
const FINAL_CARD_STAGE_PRESENCE_TRANSITION = {
	duration: 0.22,
	ease: [0.22, 1, 0.36, 1] as const,
};
const FINAL_CARD_FLIGHT_TRANSITION = {
	duration: FINAL_CARD_FLIGHT_DURATION_MS / 1_000,
	ease: [0.32, 0.72, 0, 1] as const,
};

const TEAM_CARD_SHELL_STYLE = {
	// Temporary: hide the shell grain on the big wrapped card.
	"--team-lineup-card-grain-opacity": "0",
	"--team-lineup-card-grain-size": "40px",
} as CSSProperties;

export function WrappedTeamCardPage(props: {
	debugControls?: ReactNode;
	onBackFromFirstStep?: () => void;
}) {
	const { debugControls, onBackFromFirstStep } = props;
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { trackUtilityUsed, trackWrappedStoryStarted } = useAnalyticsTracking({
		pageName: "wrapped_team_card",
	});
	const sourceShareId =
		getWrappedShareIdFromSearch(`?${searchParams.toString()}`) ?? undefined;
	const wrappedLoopEntrySource = sourceShareId
		? "share_redirect"
		: "wrapped_team_card";
	const {
		completionUserId,
		liveArchetype,
		onboardingMetrics,
		publicUsername,
		statItems,
		visibleTeamCardRow,
	} = useWrappedTeamCardPageData();
	const tiltController = useWrappedCardTilt();
	// liveArchetype reflects the snapshot-backed classifier output. The dev
	// override is interaction-only state, gated by import.meta.env.DEV, used so
	// QA can preview the full card set without altering the live flow.
	const [devOverrideIndex, setDevOverrideIndex] = useState<number | null>(null);
	const [shareAppearance, setShareAppearance] =
		useState<WrappedShareAppearance>(DEFAULT_WRAPPED_SHARE_APPEARANCE);
	const [shareCardCreatedAt] = useState(() => new Date());
	const shareCardCreatedAtLabel = formatShareCardCreatedAt(shareCardCreatedAt);
	const dialValues = useDialKit("Wrapped Team Card", {
		card: {
			grainOpacity: [0.4, 0, 1, 0.01],
		},
		statLayers: {
			borderOpacity: [1, 0, 1, 0.01],
			fillOpacity: [0, 0, 1, 0.01],
			insetShadowOpacity: [0.66, 0, 1, 0.01],
			shineOpacity: [1, 0, 1, 0.01],
			textureOpacity: [0.81, 0, 1, 0.01],
			topStrokeOpacity: [0, 0, 1, 0.01],
		},
	});
	const activeArchetype: WrappedArchetypeCardTheme =
		devOverrideIndex !== null
			? (WRAPPED_ARCHETYPE_CARD_THEMES[devOverrideIndex] ?? liveArchetype)
			: liveArchetype;

	if (!activeArchetype) {
		throw new Error("Wrapped archetype themes are missing.");
	}

	const activeStepParam = searchParams.get("step");
	const estimatedSpendValue = formatCompactWholeCurrency(
		visibleTeamCardRow.cost,
	);
	const handleContinueToDashboard = () => {
		markWrappedCompleted(completionUserId);
		navigate(appRoutes.dashboard());
	};
	const headerLeftMetric = useMemo<WrappedTeamMemberCardHeaderMetric>(
		() => ({
			title: `${estimatedSpendValue} estimated spend`,
			value: estimatedSpendValue,
		}),
		[estimatedSpendValue],
	);
	const headerRightMetric = useMemo<WrappedTeamMemberCardHeaderMetric>(
		() => ({
			// The card shows only the current product-facing archetype label.
			title: activeArchetype.displayLabel,
			value: activeArchetype.displayLabel,
		}),
		[activeArchetype.displayLabel],
	);
	const statLayerOpacities =
		useMemo<WrappedTeamMemberCardStatLayerOpacities>(() => {
			const baseStatLayerOpacities: WrappedTeamMemberCardStatLayerOpacities = {
				rainbowShineOpacity: dialValues.statLayers.shineOpacity,
				tileBorderOpacity: dialValues.statLayers.borderOpacity,
				tileFillOpacity: dialValues.statLayers.fillOpacity,
				tileInsetShadowOpacity: dialValues.statLayers.insetShadowOpacity,
				tileTopStrokeOpacity: dialValues.statLayers.topStrokeOpacity,
				textureOpacity: dialValues.statLayers.textureOpacity,
			};

			if (activeArchetype.id !== "decimal") {
				return baseStatLayerOpacities;
			}

			// Decimal is a VIP special edition, not part of the classifier-backed
			// taxonomy. It keeps its own visual treatment on purpose.
			return {
				...baseStatLayerOpacities,
				hideTextureImage: true,
				maskTint: "black",
				rainbowShineOpacity: 0,
				textTone: "muted-white",
				tileBaseOpacity: 0,
				tileFillOpacity: 0.05,
				tileFillTint: "black",
				textureOpacity: 0,
				whiteMaskOpacity: 0.05,
			};
		}, [
			activeArchetype.id,
			dialValues.statLayers.borderOpacity,
			dialValues.statLayers.fillOpacity,
			dialValues.statLayers.insetShadowOpacity,
			dialValues.statLayers.shineOpacity,
			dialValues.statLayers.topStrokeOpacity,
			dialValues.statLayers.textureOpacity,
		]);
	useMountEffect(() => {
		trackUtilityUsed({
			sourceComponent: "wrapped_team_card_page",
			utilityName: "wrappedStageViewed",
			utilityState: activeStepParam === "card" ? "cardDirect" : "story",
		});
		trackWrappedStoryStarted({
			activationState: activeStepParam === "card" ? "card_direct" : "story",
			entrySource: wrappedLoopEntrySource,
			sourceComponent: "wrapped_team_card_page",
			sourceShareId,
		});
		document.body.classList.add("mymind-wrapped-body");

		return () => {
			document.body.classList.remove("mymind-wrapped-body");
		};
	});
	return (
		<WrappedTeamCardPageContent
			key={activeStepParam === "card" ? "card" : "not-card"}
			activeArchetype={activeArchetype}
			debugControls={debugControls}
			headerLeftMetric={headerLeftMetric}
			headerRightMetric={headerRightMetric}
			onboardingMetrics={onboardingMetrics}
			onBackFromFirstStep={onBackFromFirstStep}
			onContinueToDashboard={handleContinueToDashboard}
			publicUsername={publicUsername}
			shareAppearance={resolveWrappedShareAppearance(shareAppearance)}
			shareCardCreatedAtLabel={shareCardCreatedAtLabel}
			shellStyle={TEAM_CARD_SHELL_STYLE}
			statItems={statItems}
			statLayerOpacities={statLayerOpacities}
			setDevOverrideIndex={setDevOverrideIndex}
			setShareAppearance={setShareAppearance}
			tiltController={tiltController}
			visibleTeamCardRow={visibleTeamCardRow}
		/>
	);
}

function WrappedTeamCardPageContent(props: {
	activeArchetype: WrappedArchetypeCardTheme;
	debugControls?: ReactNode;
	headerLeftMetric: WrappedTeamMemberCardHeaderMetric;
	headerRightMetric: WrappedTeamMemberCardHeaderMetric;
	onboardingMetrics: WrappedOnboardingMetrics;
	onBackFromFirstStep?: () => void;
	onContinueToDashboard: () => void;
	publicUsername: string | undefined;
	setDevOverrideIndex: (
		nextValue: number | null | ((currentValue: number | null) => number | null),
	) => void;
	setShareAppearance: (
		nextValue:
			| WrappedShareAppearance
			| ((currentValue: WrappedShareAppearance) => WrappedShareAppearance),
	) => void;
	shareAppearance: WrappedShareAppearance;
	shareCardCreatedAtLabel: string;
	shellStyle: CSSProperties;
	statItems: readonly WrappedTeamMemberCardStatItem[];
	statLayerOpacities: WrappedTeamMemberCardStatLayerOpacities;
	tiltController: WrappedCardTiltController;
	visibleTeamCardRow: TeamPageMemberRow;
}) {
	const {
		activeArchetype,
		debugControls,
		headerLeftMetric,
		headerRightMetric,
		onboardingMetrics,
		onBackFromFirstStep,
		onContinueToDashboard,
		publicUsername,
		setDevOverrideIndex,
		setShareAppearance,
		shareAppearance,
		shareCardCreatedAtLabel,
		shellStyle,
		statItems,
		statLayerOpacities,
		tiltController,
		visibleTeamCardRow,
	} = props;
	const sharePostRef = useRef<HTMLDivElement>(null);
	const revealCardHandoffRef = useRef<HTMLDivElement>(null);
	const shareCardHandoffRef = useRef<HTMLDivElement>(null);
	const [finalCardStage, setFinalCardStage] =
		useState<FinalCardStage>("reveal");
	const [finalCardHandoffPhase, setFinalCardHandoffPhase] =
		useState<FinalCardHandoffPhase>("idle");
	const [finalCardFlight, setFinalCardFlight] =
		useState<FinalCardFlight | null>(null);
	const [isRevealSequenceComplete, setIsRevealSequenceComplete] =
		useState(false);
	const [isDownloadPending, setIsDownloadPending] = useState(false);
	const [isSharePending, setIsSharePending] = useState(false);
	const finalCardHandoffTimerRef = useRef<number | null>(null);
	const finalCardFlightTimerRef = useRef<number | null>(null);
	const finalCardFlightMeasureRef = useRef<number | null>(null);
	const [searchParams] = useSearchParams();
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const {
		trackNavigation,
		trackUtilityUsed,
		trackWrappedShareActionTriggered,
		trackWrappedShareCreated,
	} = useAnalyticsTracking({
		pageName: "wrapped_team_card",
	});
	const isCardStep = searchParams.get("step") === "card";
	const sourceShareId =
		getWrappedShareIdFromSearch(`?${searchParams.toString()}`) ?? undefined;
	const wrappedLoopEntrySource = sourceShareId
		? "share_redirect"
		: "wrapped_team_card";
	const showShareStage = finalCardStage === "share";
	const activeArchetypeIndex = getWrappedArchetypeThemeIndex(activeArchetype);
	// The final exported post intentionally uses a stricter media policy than the
	// live card. That keeps image export and public replay reliable without
	// freezing future design changes for the live experience.
	const sharePreviewRow = useMemo(
		() => buildWrappedShareSafeRow(visibleTeamCardRow),
		[visibleTeamCardRow],
	);
	const shareBackMetrics = useMemo(
		() =>
			buildWrappedTeamCardBackMetrics({
				onboardingMetrics,
				row: sharePreviewRow,
				shareCardCreatedAtLabel,
			}),
		[onboardingMetrics, shareCardCreatedAtLabel, sharePreviewRow],
	);
	const shareSnapshot = useMemo(
		() =>
			buildWrappedShareSnapshot({
				appearance: shareAppearance,
				archetypeLabel: activeArchetype.displayLabel,
				backMetrics: shareBackMetrics,
				headerLeftMetric,
				headerRightMetric,
				row: sharePreviewRow,
				shellClassName: activeArchetype.shellClassName,
				statItems,
				theme: activeArchetype.theme,
			}),
		[
			shareAppearance,
			activeArchetype.displayLabel,
			activeArchetype.shellClassName,
			activeArchetype.theme,
			shareBackMetrics,
			headerLeftMetric,
			headerRightMetric,
			sharePreviewRow,
			statItems,
		],
	);
	// Share creation lives behind a hook so the page can stay focused on stage
	// orchestration. The hook owns caching/deduping, while this page only decides
	// when the product has crossed the line from "previewing" to "real share made".
	const { ensureShare, shareUrl, shareUrlLabel } = useWrappedTeamCardShare(
		shareSnapshot,
		{
			// This is the moment a persistent public record exists, not the moment
			// the user merely opened the share UI.
			onShareCreated: (shareRecord) => {
				trackWrappedShareCreated({
					archetypeId: activeArchetype.id,
					entrySource: wrappedLoopEntrySource,
					publicPayloadVersion: WRAPPED_SHARE_PAYLOAD_VERSION,
					shareId: shareRecord.id,
					sourceComponent: "wrapped_team_card_page",
					sourceShareId,
				});
			},
			username: publicUsername,
		},
	);
	// The share action helpers stay presentational from the page's perspective.
	// We pass analytics hooks in, but keep the details of clipboard/native share/
	// download behavior inside the share module.
	const shareActions = createWrappedTeamCardShareActions({
		archetypeLabel: activeArchetype.displayLabel,
		avgSessionMin: onboardingMetrics.avgSessionMin,
		commitRate: onboardingMetrics.commitRate,
		daysSinceFirst: onboardingMetrics.daysSinceFirst,
		distinctProjectCount: onboardingMetrics.distinctProjectCount,
		displayName: visibleTeamCardRow.displayName,
		onShareActionTriggered: (action) => {
			trackWrappedShareActionTriggered({
				activationState: action,
				entrySource: wrappedLoopEntrySource,
				shareAction: action,
				shareDestination: getWrappedShareDestination(action),
				sourceComponent: "wrapped_share_actions",
				sourceShareId,
			});
		},
		resolveShareUrl: async () => {
			const shareRecord = await ensureShare();
			if (typeof window === "undefined") {
				return undefined;
			}

			return new URL(
				appRoutes.wrappedPublic(shareRecord.id),
				window.location.origin,
			).toString();
		},
		row: visibleTeamCardRow,
		shareUrl,
		shareUrlLabel,
		sharePostRef,
		sourceSplit: onboardingMetrics.sourceSplit,
	});

	useMountEffect(() => () => {
		clearFinalCardHandoffTimer(finalCardHandoffTimerRef);
		clearFinalCardHandoffTimer(finalCardFlightTimerRef);
		clearFinalCardHandoffAnimationFrame(finalCardFlightMeasureRef);
	});

	useEffect(() => {
		if (!showShareStage || !finalCardFlight || finalCardFlight.to) {
			return;
		}

		clearFinalCardHandoffAnimationFrame(finalCardFlightMeasureRef);
		finalCardFlightMeasureRef.current = window.requestAnimationFrame(() => {
			const nextRect = getFinalCardFlightRect(shareCardHandoffRef.current);

			if (!nextRect) {
				setFinalCardFlight(null);
				setFinalCardHandoffPhase("idle");
				return;
			}

			setFinalCardFlight((currentFlight) =>
				currentFlight?.key === finalCardFlight.key
					? { ...currentFlight, to: nextRect }
					: currentFlight,
			);
			clearFinalCardHandoffTimer(finalCardFlightTimerRef);
			finalCardFlightTimerRef.current = window.setTimeout(() => {
				setFinalCardFlight(null);
				setFinalCardHandoffPhase("idle");
			}, FINAL_CARD_FLIGHT_DURATION_MS + FINAL_CARD_FLIGHT_SETTLE_MS);
		});

		return () => {
			clearFinalCardHandoffAnimationFrame(finalCardFlightMeasureRef);
		};
	}, [finalCardFlight, showShareStage]);

	function handlePreviewPost() {
		// Once the share stage has user-controlled appearance options, previewing is
		// no longer a stable point to persist a public record. We only create the
		// public share when an actual share action needs the final snapshot.
		trackUtilityUsed({
			sourceComponent: "wrapped_reveal_footer",
			utilityName: "wrappedSharePreviewOpened",
			utilityState: "sharePreview",
		});

		clearFinalCardHandoffTimer(finalCardHandoffTimerRef);
		clearFinalCardHandoffTimer(finalCardFlightTimerRef);
		clearFinalCardHandoffAnimationFrame(finalCardFlightMeasureRef);

		if (reduceMotion) {
			startTransition(() => {
				setFinalCardFlight(null);
				setFinalCardHandoffPhase("idle");
				setFinalCardStage("share");
			});
			return;
		}

		const handoffRect = getFinalCardFlightRect(revealCardHandoffRef.current);
		if (handoffRect) {
			setFinalCardFlight({
				from: handoffRect,
				key: Date.now(),
			});
		}

		setFinalCardHandoffPhase("preparing");
		finalCardHandoffTimerRef.current = window.setTimeout(() => {
			startTransition(() => {
				setFinalCardHandoffPhase("shared");
				setFinalCardStage("share");
			});
		}, FINAL_CARD_HANDOFF_PREPARE_MS);
	}

	function handleContinueToDashboard(
		sourceComponent: "wrapped_reveal_footer" | "wrapped_share_footer",
	) {
		trackNavigation({
			navType: "wrappedContinueToDashboard",
			sourceComponent,
			targetPath: appRoutes.dashboard(),
			targetType: "route",
			toPageName: "overview",
		});
		onContinueToDashboard();
	}

	async function handleDownloadPost() {
		if (isDownloadPending) {
			return;
		}

		setIsDownloadPending(true);

		try {
			await shareActions.handleDownloadPost();
		} finally {
			setIsDownloadPending(false);
		}
	}

	async function handleSharePost() {
		if (isSharePending) {
			return;
		}

		setIsSharePending(true);

		try {
			await shareActions.handleSharePost();
		} finally {
			setIsSharePending(false);
		}
	}

	const finalStage = (
		<AnimatePresence initial={false} mode="popLayout">
			{showShareStage ? (
				<motion.div
					key="share"
					layout
					animate={{ opacity: 1 }}
					className="mymind-wrapped-final-stage-presence"
					exit={getWrappedFinalStagePresenceExit(reduceMotion)}
					initial={false}
					transition={FINAL_CARD_STAGE_PRESENCE_TRANSITION}
				>
					<WrappedTeamCardShareStage
						appearance={shareAppearance}
						backMetrics={shareBackMetrics}
						frontCardHandoffRef={shareCardHandoffRef}
						headerLeftMetric={headerLeftMetric}
						headerRightMetric={headerRightMetric}
						isDownloadPending={isDownloadPending}
						isFrontCardHandoffHidden={finalCardFlight !== null}
						isSharePending={isSharePending}
						onBack={() => {
							clearFinalCardHandoffTimer(finalCardHandoffTimerRef);
							clearFinalCardHandoffTimer(finalCardFlightTimerRef);
							clearFinalCardHandoffAnimationFrame(finalCardFlightMeasureRef);
							startTransition(() => {
								setFinalCardFlight(null);
								setFinalCardHandoffPhase("idle");
								setIsRevealSequenceComplete(false);
								setFinalCardStage("reveal");
							});
						}}
						onAppearanceChange={(nextAppearance) => {
							setShareAppearance(resolveWrappedShareAppearance(nextAppearance));
						}}
						onCopy={() => void shareActions.handleCopyPost()}
						onContinueToDashboard={() =>
							handleContinueToDashboard("wrapped_share_footer")
						}
						onDownload={() => void handleDownloadPost()}
						onShare={() => void handleSharePost()}
						row={sharePreviewRow}
						shareCardCreatedAtLabel={shareCardCreatedAtLabel}
						sharePostRef={sharePostRef}
						shellClassName={activeArchetype.shellClassName}
						shellStyle={shellStyle}
						statItems={statItems}
						statLayerOpacities={statLayerOpacities}
						theme={activeArchetype.theme}
					/>
				</motion.div>
			) : (
				<motion.div
					key="reveal"
					layout
					animate={{ opacity: 1 }}
					className="mymind-wrapped-final-stage-presence"
					exit={getWrappedFinalStagePresenceExit(reduceMotion)}
					initial={false}
					transition={FINAL_CARD_STAGE_PRESENCE_TRANSITION}
				>
					<WrappedTeamCardRevealStage
						activeArchetype={activeArchetype}
						handoffCardRef={revealCardHandoffRef}
						headerLeftMetric={headerLeftMetric}
						headerRightMetric={headerRightMetric}
						isPostHandoffPreparing={finalCardHandoffPhase === "preparing"}
						isPreviewPostVisible={isRevealSequenceComplete}
						onboardingMetrics={onboardingMetrics}
						onPreviewPost={handlePreviewPost}
						onRevealComplete={() => {
							setIsRevealSequenceComplete(true);
						}}
						row={visibleTeamCardRow}
						shellClassName={activeArchetype.shellClassName}
						shellStyle={shellStyle}
						shareCardCreatedAtLabel={shareCardCreatedAtLabel}
						statItems={statItems}
						statLayerOpacities={statLayerOpacities}
						theme={activeArchetype.theme}
						tiltController={tiltController}
					/>
				</motion.div>
			)}
		</AnimatePresence>
	);
	const footerDebugControls =
		import.meta.env.DEV && isCardStep
			? getWrappedTeamCardDebugControls({
					activeArchetypeLabel: activeArchetype.displayLabel,
					debugControls,
					onNext: () => {
						startTransition(() => {
							setIsRevealSequenceComplete(false);
							setDevOverrideIndex((currentIndex) =>
								getWrappedArchetypeIndex(
									(currentIndex ?? activeArchetypeIndex) + 1,
									WRAPPED_ARCHETYPE_CARD_THEMES.length,
								),
							);
						});
					},
					onPrevious: () => {
						startTransition(() => {
							setIsRevealSequenceComplete(false);
							setDevOverrideIndex((currentIndex) =>
								getWrappedArchetypeIndex(
									(currentIndex ?? activeArchetypeIndex) - 1,
									WRAPPED_ARCHETYPE_CARD_THEMES.length,
								),
							);
						});
					},
				})
			: debugControls;
	const rewardCardBackground =
		getWrappedArchetypeCardBackgroundValue(activeArchetype) ?? undefined;

	return (
		<>
			<WrappedTeamCardOnboarding
				displayName={visibleTeamCardRow.displayName}
				footerDebugControls={footerDebugControls}
				finalFooter={false}
				finalStage={finalStage}
				onboardingMetrics={onboardingMetrics}
				onBackFromFirstStep={onBackFromFirstStep}
				rewardCardBackground={rewardCardBackground}
				totalSessions={visibleTeamCardRow.totalSessions}
			/>
			<WrappedFinalCardFlightOverlay
				flight={finalCardFlight}
				headerLeftMetric={headerLeftMetric}
				headerRightMetric={headerRightMetric}
				row={sharePreviewRow}
				shellClassName={activeArchetype.shellClassName}
				shellStyle={shellStyle}
				statItems={statItems}
				statLayerOpacities={statLayerOpacities}
				theme={activeArchetype.theme}
			/>
		</>
	);
}

function getWrappedShareDestination(action: "copy" | "download" | "share") {
	if (action === "copy") {
		return "clipboard";
	}

	if (action === "download") {
		return "download";
	}

	return "x";
}

function WrappedFinalCardFlightOverlay(props: {
	flight: FinalCardFlight | null;
	headerLeftMetric: WrappedTeamMemberCardHeaderMetric;
	headerRightMetric: WrappedTeamMemberCardHeaderMetric;
	row: TeamPageMemberRow;
	shellClassName: string;
	shellStyle: CSSProperties;
	statItems: readonly WrappedTeamMemberCardStatItem[];
	statLayerOpacities: WrappedTeamMemberCardStatLayerOpacities;
	theme: WrappedTeamMemberCardTheme;
}) {
	const {
		flight,
		headerLeftMetric,
		headerRightMetric,
		row,
		shellClassName,
		shellStyle,
		statItems,
		statLayerOpacities,
		theme,
	} = props;

	if (!flight) {
		return null;
	}

	const targetRect = flight.to ?? flight.from;

	return (
		<motion.div
			key={flight.key}
			aria-hidden="true"
			animate={{
				opacity: 1,
				scale: targetRect.scale,
				x: targetRect.left,
				y: targetRect.top,
			}}
			className="mymind-wrapped-final-card-flight"
			initial={{
				opacity: 1,
				scale: flight.from.scale,
				x: flight.from.left,
				y: flight.from.top,
			}}
			transition={FINAL_CARD_FLIGHT_TRANSITION}
		>
			<div className="team-lineup-card-tilt-stage">
				<div className="team-lineup-card-tilt-shell mymind-wrapped-final-card-flight__card">
					<div className="grid justify-center">
						<WrappedTeamMemberCard
							disableOuterShadow
							headerLeftMetric={headerLeftMetric}
							headerRightMetric={headerRightMetric}
							hideHeaderLogo
							layoutPreset="team-card-preview"
							mediaPanelClassName="mx-auto"
							row={row}
							shellClassName={shellClassName}
							shellStyle={shellStyle}
							statItems={statItems}
							statLayerOpacities={statLayerOpacities}
							statTileClassName=""
							theme={theme}
						/>
					</div>
				</div>
			</div>
		</motion.div>
	);
}

function getWrappedTeamCardDebugControls(input: {
	activeArchetypeLabel: string;
	debugControls?: ReactNode;
	onNext: () => void;
	onPrevious: () => void;
}) {
	const themePicker = (
		<div className="mymind-wrapped-card-debug-switcher-slot">
			<WrappedTeamCardThemeDebugControls
				activeArchetypeLabel={input.activeArchetypeLabel}
				onNext={input.onNext}
				onPrevious={input.onPrevious}
			/>
		</div>
	);

	if (
		isValidElement<{ children?: ReactNode; className?: string }>(
			input.debugControls,
		)
	) {
		return cloneElement(input.debugControls, {
			children: (
				<>
					{input.debugControls.props.children}
					{themePicker}
				</>
			),
		});
	}

	return (
		<div className="mymind-wrapped-card-debug-combined-bar">
			{input.debugControls}
			{themePicker}
		</div>
	);
}

function clearFinalCardHandoffTimer(timerRef: { current: number | null }) {
	if (timerRef.current === null) {
		return;
	}

	window.clearTimeout(timerRef.current);
	timerRef.current = null;
}

function clearFinalCardHandoffAnimationFrame(timerRef: {
	current: number | null;
}) {
	if (timerRef.current === null) {
		return;
	}

	window.cancelAnimationFrame(timerRef.current);
	timerRef.current = null;
}

function getFinalCardFlightRect(
	node: HTMLDivElement | null,
): FinalCardFlightRect | null {
	if (!node) {
		return null;
	}

	const rect = node.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0) {
		return null;
	}

	return {
		left: rect.left,
		scale: rect.width / FINAL_CARD_FLIGHT_CARD_WIDTH,
		top: rect.top,
	};
}

function getWrappedFinalStagePresenceExit(reduceMotion: boolean) {
	if (reduceMotion) {
		return { opacity: 0 };
	}

	return {
		filter: "blur(8px)",
		opacity: 0,
		scale: 0.996,
		y: -8,
	};
}

function getWrappedArchetypeThemeIndex(
	archetype: WrappedArchetypeCardTheme,
): number {
	const index = WRAPPED_ARCHETYPE_CARD_THEMES.findIndex(
		(theme) => theme.id === archetype.id,
	);

	if (index === -1) {
		return 0;
	}

	return index;
}

function WrappedTeamCardThemeDebugControls(props: {
	activeArchetypeLabel: string;
	onNext: () => void;
	onPrevious: () => void;
}) {
	const { activeArchetypeLabel, onNext, onPrevious } = props;

	return (
		<div className="mymind-wrapped-card-debug-switcher">
			<Button
				type="button"
				size="icon-xs"
				variant="outline"
				aria-label="Show previous card"
				className="mymind-wrapped-card-debug-switcher__button"
				onClick={onPrevious}
			>
				<ChevronLeft className="size-3" />
			</Button>
			<div className="mymind-wrapped-card-debug-switcher__copy">
				<div className="mymind-wrapped-card-debug-switcher__label">
					Card theme
				</div>
				<div className="mymind-wrapped-card-debug-switcher__value">
					{activeArchetypeLabel}
				</div>
			</div>
			<Button
				type="button"
				size="icon-xs"
				variant="outline"
				aria-label="Show next card"
				className="mymind-wrapped-card-debug-switcher__button"
				onClick={onNext}
			>
				<ChevronRight className="size-3" />
			</Button>
		</div>
	);
}
