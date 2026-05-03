import type {
	WrappedShareAppearance,
	WrappedShareRevealMetrics,
} from "@rudel/api-routes";
import { IconBrandX } from "@tabler/icons-react";
import {
	ChevronRight,
	Download,
	Link as LinkIcon,
	Loader2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
	type CSSProperties,
	type ReactNode,
	type RefObject,
	// biome-ignore lint/style/noRestrictedImports: reveal-stage timers are an imperative storyboard bridge for this wrapped surface.
	useEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/app/ui/button";
import {
	CopyFeedbackIcon,
	type CopyFeedbackStage,
} from "@/components/ui/copy-feedback-icon";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { WrappedPrimaryAction } from "@/features/wrapped/actions";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import { WrappedStageFrame } from "@/features/wrapped/stage-frame";
import { formatCurrency } from "@/lib/format";
import { WrappedArchetypeGradientText } from "./archetype-gradient-text";
import type { WrappedArchetypeCardTheme } from "./archetypes";
import { buildWrappedTeamCardBackMetrics } from "./back-metrics";
import {
	WrappedTeamMemberCard,
	type WrappedTeamMemberCardHeaderMetric,
	type WrappedTeamMemberCardStatItem,
	type WrappedTeamMemberCardStatLayerOpacities,
	type WrappedTeamMemberCardTheme,
} from "./card";
import {
	WrappedTeamMemberCardBack,
	type WrappedTeamMemberCardBackMetric,
} from "./card-back";
import { WrappedPrintedCardFlip } from "./printed-card-flip";
import { resolveWrappedShareAppearance } from "./share-appearance";
import { WrappedTeamCardSharePreview } from "./share-preview";
import type { WrappedCardTiltController } from "./tilt/use-card-tilt";

interface WrappedTeamCardStageCardProps {
	headerLeftMetric: WrappedTeamMemberCardHeaderMetric;
	headerRightMetric: WrappedTeamMemberCardHeaderMetric;
	row: TeamPageMemberRow;
	shellClassName: string;
	shellStyle: CSSProperties;
	statItems: readonly WrappedTeamMemberCardStatItem[];
	statLayerOpacities: WrappedTeamMemberCardStatLayerOpacities;
	theme: WrappedTeamMemberCardTheme;
}

interface WrappedTeamCardShareStageProps extends WrappedTeamCardStageCardProps {
	appearance: WrappedShareAppearance;
	backMetrics: readonly WrappedTeamMemberCardBackMetric[];
	frontCardHandoffRef?: RefObject<HTMLDivElement | null>;
	isFrontCardHandoffHidden?: boolean;
	isDownloadPending?: boolean;
	isProfileUrlCopyPending?: boolean;
	isSharePending?: boolean;
	onBack: () => void;
	onCopy: () => WrappedShareCopyResult | Promise<WrappedShareCopyResult>;
	onCopyProfileUrl: () => void | Promise<void>;
	onContinueToDashboard: () => void;
	onDownload: () => void | Promise<void>;
	onAppearanceChange: (nextValue: WrappedShareAppearance) => void;
	onShare: () => void | Promise<void>;
	profileUrlLabel: string;
	shareCardCreatedAtLabel: string;
	sharePostRef: RefObject<HTMLDivElement | null>;
}

interface WrappedTeamCardRevealStageProps
	extends WrappedTeamCardStageCardProps {
	activeArchetype: WrappedArchetypeCardTheme;
	footerActionLabel?: string;
	handoffCardRef?: RefObject<HTMLDivElement | null>;
	isPostHandoffPreparing?: boolean;
	onboardingMetrics: WrappedOnboardingMetrics;
	onPreviewPost: () => void;
	onRevealComplete?: () => void;
	revealedFooterActionLabel?: string;
	isPreviewPostVisible: boolean;
	shareCardCreatedAtLabel: string;
	tiltController: WrappedCardTiltController;
}

interface WrappedTeamCardPublicStageProps {
	action: ReactNode;
	activeArchetype: WrappedArchetypeCardTheme;
	backMetrics?: readonly WrappedTeamMemberCardBackMetric[];
	headerLeftMetric?: WrappedTeamMemberCardHeaderMetric;
	headerRightMetric?: WrappedTeamMemberCardHeaderMetric;
	revealMetrics?: WrappedShareRevealMetrics;
	row: TeamPageMemberRow;
	shellClassName: string;
	shellStyle: CSSProperties;
	statItems: readonly WrappedTeamMemberCardStatItem[];
	statLayerOpacities?: WrappedTeamMemberCardStatLayerOpacities;
	theme: WrappedTeamMemberCardTheme;
	tiltController: WrappedCardTiltController;
}

interface WrappedTeamCardFlipSurfaceProps {
	backMetrics: readonly WrappedTeamMemberCardBackMetric[];
	buttonLabel: string;
	cardVisualStageClassName?: string;
	headerLeftMetric?: WrappedTeamMemberCardHeaderMetric;
	headerRightMetric?: WrappedTeamMemberCardHeaderMetric;
	isDisabled: boolean;
	isFlipAnimating: boolean;
	isFrontVisible: boolean;
	isTiltEnabled: boolean;
	morphShellRef?: RefObject<HTMLDivElement | null>;
	onFlip: () => void;
	printedCardCaptureKey: string;
	reduceMotion: boolean;
	row: TeamPageMemberRow;
	shellClassName: string;
	shellStyle: CSSProperties;
	statItems: readonly WrappedTeamMemberCardStatItem[];
	statLayerOpacities?: WrappedTeamMemberCardStatLayerOpacities;
	theme: WrappedTeamMemberCardTheme;
	tiltController: WrappedCardTiltController;
	tiltShellClassName?: string;
}

interface WrappedRevealCopyInput {
	activeArchetype: WrappedArchetypeCardTheme;
	audience?: "owner" | "public";
	backMetrics?: readonly WrappedTeamMemberCardBackMetric[];
	onboardingMetrics?: WrappedOnboardingMetrics;
	revealMetrics?: WrappedShareRevealMetrics;
	row: TeamPageMemberRow;
	statItems?: readonly WrappedTeamMemberCardStatItem[];
}

type WrappedRevealIntroPhase = "name" | "line" | "accent" | "description";
type WrappedShareCopyResult = boolean | undefined;

/* ─────────────────────────────────────────────────────────
 * REVEAL COMPANION STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after the flip trigger.
 *
 *    0ms   card flips 180deg → 0deg while staying centered
 *  680ms   flipped card slides into the revealed composition
 *  760ms   archetype copy resolves beside/above the card
 *    0ms   on share trigger, copy exits and card recenters
 *  580ms   share handoff measures the recentered card and begins
 * ───────────────────────────────────────────────────────── */
const REVEAL_COMPANION_TIMING = {
	copyEnter: 0.08, // seconds after the card slide starts before copy resolves
	exitToShareMs: 580, // ms before measuring the card for the share handoff
} as const;

const REVEAL_COMPANION_COPY = {
	enterBlur: "14px",
	exitBlur: "10px",
	enterOffsetY: 16,
	exitOffsetY: -10,
	initialScale: 0.986,
	finalScale: 1,
	exitScale: 0.992,
	transition: {
		duration: 0.34,
		ease: [0.22, 1, 0.36, 1] as const,
	},
};

/* ─────────────────────────────────────────────────────────
 * REVEAL INTRO STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after intro mount.
 *
 *    0ms   user name is visible, archetype line stays invisible
 *  850ms   "you're a {archetype}" fades in as black text
 * 1520ms   archetype word sweeps into the card colorway
 * 2140ms   archetype description resolves and Continue becomes available
 *  click   intro exits, card drops, normal reveal flow resumes
 * ───────────────────────────────────────────────────────── */
const REVEAL_INTRO_TIMING = {
	accentRevealMs: 1_520, // ms after mount when the archetype color sweep starts
	descriptionRevealMs: 2_140, // ms after mount when the description and gate appear
	lineRevealMs: 850, // ms after mount when the second line fades in
} as const;

const REVEAL_INTRO_COPY = {
	descriptionBlur: "10px",
	descriptionOffsetY: 14,
	enterBlur: "14px",
	exitBlur: "8px",
	lineOffsetY: 14,
	initialScale: 0.986,
	finalScale: 1,
	exitScale: 1.012,
	transition: {
		duration: 0.32,
		ease: [0.22, 1, 0.36, 1] as const,
	},
	lineTransition: {
		duration: 0.42,
		ease: [0.22, 1, 0.36, 1] as const,
	},
	descriptionTransition: {
		duration: 0.44,
		ease: [0.22, 1, 0.36, 1] as const,
	},
};

const WRAPPED_SHARE_VARIANTS: ReadonlyArray<{
	appearance: WrappedShareAppearance;
	description: string;
	label: "1" | "2";
}> = [
	{
		appearance: {
			layoutMode: "front",
			showArchetypeLabel: true,
		},
		description: "One card",
		label: "1",
	},
	{
		appearance: {
			layoutMode: "front_back",
			showArchetypeLabel: true,
		},
		description: "Two cards",
		label: "2",
	},
];

const REVEAL_STAGE_MOTION = {
	duration: {
		card: 1.02,
		flip: 0.68,
	},
	easing: {
		drop: [0.16, 1, 0.22, 1] as const,
		flip: [0.32, 0.72, 0, 1] as const,
	},
};

const REVEAL_STAGE_CARD_DROP_DURATION_MS = Math.round(
	REVEAL_STAGE_MOTION.duration.card * 1_000,
);
const REVEAL_STAGE_CARD_FLIP_DURATION_MS = Math.round(
	REVEAL_STAGE_MOTION.duration.flip * 1_000,
);
const WRAPPED_FINAL_SHARE_CHROME_EASE = [0.22, 1, 0.36, 1] as const;
const WRAPPED_SHARE_COPY_HOLD_MS = 2000;
const WRAPPED_SHARE_COPY_RESET_MS = 170;

export function WrappedTeamCardShareStage(
	props: WrappedTeamCardShareStageProps,
) {
	const {
		appearance,
		backMetrics,
		frontCardHandoffRef,
		headerLeftMetric,
		headerRightMetric,
		isDownloadPending = false,
		isFrontCardHandoffHidden = false,
		isProfileUrlCopyPending = false,
		isSharePending = false,
		onCopy,
		onCopyProfileUrl,
		onContinueToDashboard,
		onDownload,
		onAppearanceChange,
		onShare,
		profileUrlLabel,
		row,
		shareCardCreatedAtLabel,
		sharePostRef,
		shellClassName,
		shellStyle,
		statItems,
		statLayerOpacities,
		theme,
	} = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const resolvedAppearance = resolveWrappedShareAppearance(appearance);
	const shareObjectShellRef = useWrappedShareStageObjectSize();
	const [copyStage, setCopyStage] = useState<CopyFeedbackStage>("idle");
	const copyHoldTimeoutRef = useRef<number | null>(null);
	const copyResetTimeoutRef = useRef<number | null>(null);

	useEffect(() => {
		return () => {
			if (copyHoldTimeoutRef.current !== null) {
				window.clearTimeout(copyHoldTimeoutRef.current);
			}

			if (copyResetTimeoutRef.current !== null) {
				window.clearTimeout(copyResetTimeoutRef.current);
			}
		};
	}, []);

	function clearCopyFeedbackTimers() {
		if (copyHoldTimeoutRef.current !== null) {
			window.clearTimeout(copyHoldTimeoutRef.current);
			copyHoldTimeoutRef.current = null;
		}

		if (copyResetTimeoutRef.current !== null) {
			window.clearTimeout(copyResetTimeoutRef.current);
			copyResetTimeoutRef.current = null;
		}
	}

	async function handleCopyClick() {
		const copyResult = await onCopy();

		if (copyResult === false) {
			return;
		}

		clearCopyFeedbackTimers();
		setCopyStage("copied");
		copyHoldTimeoutRef.current = window.setTimeout(() => {
			setCopyStage("resetting");
			copyHoldTimeoutRef.current = null;
			copyResetTimeoutRef.current = window.setTimeout(() => {
				setCopyStage("idle");
				copyResetTimeoutRef.current = null;
			}, WRAPPED_SHARE_COPY_RESET_MS);
		}, WRAPPED_SHARE_COPY_HOLD_MS);
	}

	return (
		<WrappedStageFrame
			className="mymind-wrapped-final-stage mymind-wrapped-final-stage--share"
			copyClassName="mymind-wrapped-final-stage__copy"
			objectClassName="mymind-wrapped-final-stage__object"
			supportClassName="mymind-wrapped-final-stage__support"
			copy={
				<motion.div
					{...getWrappedShareChromeMotion({
						delay: 0.12,
						reduceMotion,
						y: 10,
					})}
					className="mymind-wrapped-final-stage__share-copy-shell"
				>
					<h1 className="mymind-wrapped-stage-copy__headline mymind-wrapped-final-stage__headline">
						Share it with the world
					</h1>
				</motion.div>
			}
			object={
				<div
					ref={shareObjectShellRef}
					className="mymind-wrapped-final-stage__share-object-shell"
				>
					<motion.div layout className="mymind-wrapped-share-surface">
						<motion.div
							{...getWrappedShareChromeMotion({
								delay: 0.22,
								reduceMotion,
								y: -8,
							})}
							className="mymind-wrapped-share-surface__rail"
						>
							<fieldset
								aria-label="Post variants"
								className="mymind-wrapped-share-variant-picker"
							>
								{WRAPPED_SHARE_VARIANTS.map((variant) => {
									const isActive = isWrappedShareAppearanceActive({
										currentValue: resolvedAppearance,
										targetValue: variant.appearance,
									});

									return (
										<Button
											key={variant.label}
											type="button"
											size="sm"
											variant="outline"
											aria-label={variant.description}
											aria-pressed={isActive}
											title={variant.description}
											className="mymind-wrapped-share-variant-button"
											data-active={isActive ? "true" : "false"}
											onClick={() => onAppearanceChange(variant.appearance)}
										>
											{variant.label}
										</Button>
									);
								})}
							</fieldset>

							<div
								role="toolbar"
								aria-label="Share card actions"
								className="mymind-wrapped-share-toolbar"
							>
								<Button
									type="button"
									size="icon-sm"
									variant="outline"
									aria-label={
										copyStage === "copied" ? "Copied image" : "Copy image"
									}
									className="mymind-wrapped-share-toolbar__button"
									data-copy-state={copyStage}
									onClick={() => void handleCopyClick()}
								>
									<CopyFeedbackIcon
										className="mymind-wrapped-share-toolbar__copy-icon"
										stage={copyStage}
										reduceMotion={reduceMotion}
									/>
								</Button>
								<Button
									type="button"
									size="icon-sm"
									variant="outline"
									aria-busy={isDownloadPending ? "true" : undefined}
									aria-label={
										isDownloadPending ? "Downloading PNG" : "Download PNG"
									}
									className="mymind-wrapped-share-toolbar__button"
									disabled={isDownloadPending}
									onClick={onDownload}
								>
									{isDownloadPending ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										<Download className="size-4" />
									)}
								</Button>
							</div>
						</motion.div>

						<div className="mymind-wrapped-share-surface__preview">
							<WrappedTeamCardSharePreview
								appearance={resolvedAppearance}
								backMetrics={backMetrics}
								frontCardHandoffRef={frontCardHandoffRef}
								headerLeftMetric={headerLeftMetric}
								headerRightMetric={headerRightMetric}
								isChromeEntranceAnimated
								isFrontCardHandoffHidden={isFrontCardHandoffHidden}
								row={row}
								shareCardCreatedAtLabel={shareCardCreatedAtLabel}
								sharePostRef={sharePostRef}
								shellClassName={shellClassName}
								shellStyle={shellStyle}
								statItems={statItems}
								statLayerOpacities={statLayerOpacities}
								theme={theme}
							/>
						</div>
					</motion.div>
				</div>
			}
			support={
				<motion.div
					{...getWrappedShareChromeMotion({
						delay: 0.42,
						reduceMotion,
						y: 12,
					})}
					className="mymind-wrapped-action-stack mymind-wrapped-share-action-stack"
				>
					<WrappedPrimaryAction
						kind="button"
						aria-label={isSharePending ? "Copying image..." : "Share on X"}
						aria-busy={isSharePending ? "true" : undefined}
						className="mymind-wrapped-share-primary-action mymind-wrapped-share-primary-action--x"
						disabled={isSharePending}
						onClick={onShare}
					>
						<span className="mymind-wrapped-share-primary-action__label">
							{isSharePending ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<>
									<span>Share on</span>
									<IconBrandX aria-hidden="true" className="size-4" />
								</>
							)}
							{isSharePending ? <span>Copying image...</span> : null}
						</span>
					</WrappedPrimaryAction>
					<div className="mymind-wrapped-entry-card__desktop-copy-surface mymind-wrapped-entry-card__desktop-copy-surface--flat mymind-wrapped-share-profile-copy">
						<LinkIcon
							aria-hidden="true"
							className="mymind-wrapped-entry-card__desktop-copy-icon"
						/>
						<span className="mymind-wrapped-entry-card__desktop-copy-text">
							{profileUrlLabel}
						</span>
						<button
							type="button"
							aria-busy={isProfileUrlCopyPending ? "true" : undefined}
							className="mymind-wrapped-entry-card__desktop-copy-button mymind-wrapped-share-profile-copy__button"
							disabled={isProfileUrlCopyPending}
							onClick={onCopyProfileUrl}
						>
							{isProfileUrlCopyPending ? (
								<Loader2 className="size-4 animate-spin" />
							) : null}
							<span>
								{isProfileUrlCopyPending
									? "Copying URL..."
									: "Copy profile URL"}
							</span>
						</button>
					</div>
					<WrappedPrimaryAction
						kind="button"
						aria-label="Continue to dashboard"
						className="mymind-wrapped-share-primary-action mymind-wrapped-share-primary-action--text"
						onClick={onContinueToDashboard}
					>
						Continue to dashboard
					</WrappedPrimaryAction>
				</motion.div>
			}
		/>
	);
}

function isWrappedShareAppearanceActive(input: {
	currentValue: WrappedShareAppearance;
	targetValue: WrappedShareAppearance;
}) {
	const { currentValue, targetValue } = input;

	return currentValue.layoutMode === targetValue.layoutMode;
}

function useWrappedShareStageObjectSize() {
	const shareObjectShellRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const shell = shareObjectShellRef.current;

		if (!shell) {
			return;
		}

		const shellElement = shell;
		const objectFrame =
			shellElement.closest<HTMLElement>(
				".mymind-wrapped-final-stage__object",
			) ?? shellElement.parentElement;
		const rail = shellElement.querySelector<HTMLElement>(
			".mymind-wrapped-share-surface__rail",
		);
		let animationFrameId: number | null = null;
		let lastAppliedSize = "";

		function updateShareObjectSize() {
			animationFrameId = null;

			const objectFrameRect = objectFrame?.getBoundingClientRect();
			const railRect = rail?.getBoundingClientRect();
			const availableWidth = objectFrameRect?.width ?? shellElement.clientWidth;
			const availableHeight = objectFrameRect?.height ?? 0;
			const railHeight = railRect?.height ?? 0;
			const availablePreviewSize = Math.floor(
				Math.max(0, Math.min(availableWidth, availableHeight - railHeight)),
			);

			if (availablePreviewSize <= 0) {
				return;
			}

			const nextAppliedSize = `${availablePreviewSize}px`;

			if (nextAppliedSize === lastAppliedSize) {
				return;
			}

			lastAppliedSize = nextAppliedSize;
			shellElement.style.setProperty(
				"--wrapped-share-object-available-size",
				nextAppliedSize,
			);
		}

		function scheduleShareObjectSizeUpdate() {
			if (animationFrameId !== null) {
				return;
			}

			animationFrameId = window.requestAnimationFrame(updateShareObjectSize);
		}

		updateShareObjectSize();
		window.addEventListener("resize", scheduleShareObjectSizeUpdate);

		if (!window.ResizeObserver) {
			return () => {
				window.removeEventListener("resize", scheduleShareObjectSizeUpdate);
				if (animationFrameId !== null) {
					window.cancelAnimationFrame(animationFrameId);
				}
			};
		}

		const resizeObserver = new window.ResizeObserver(
			scheduleShareObjectSizeUpdate,
		);

		resizeObserver.observe(shellElement);
		if (objectFrame) {
			resizeObserver.observe(objectFrame);
		}
		if (rail) {
			resizeObserver.observe(rail);
		}

		return () => {
			window.removeEventListener("resize", scheduleShareObjectSizeUpdate);
			if (animationFrameId !== null) {
				window.cancelAnimationFrame(animationFrameId);
			}
			resizeObserver.disconnect();
		};
	}, []);

	return shareObjectShellRef;
}

function WrappedTeamCardFlipSurface(props: WrappedTeamCardFlipSurfaceProps) {
	const {
		backMetrics,
		buttonLabel,
		cardVisualStageClassName,
		headerLeftMetric,
		headerRightMetric,
		isDisabled,
		isFlipAnimating,
		isFrontVisible,
		isTiltEnabled,
		morphShellRef,
		onFlip,
		printedCardCaptureKey,
		reduceMotion,
		row,
		shellClassName,
		shellStyle,
		statItems,
		statLayerOpacities,
		theme,
		tiltController,
		tiltShellClassName,
	} = props;
	const cardFace = isFrontVisible ? "front" : "back";
	const cardVisualStageClassNames = `team-lineup-card-tilt-stage mymind-wrapped-final-stage__card-visual-stage${
		cardVisualStageClassName ? ` ${cardVisualStageClassName}` : ""
	}`;
	const cardScaleClassNames =
		"[--wrapped-card-render-scale:1] min-[360px]:[--wrapped-card-render-scale:1.08] sm:[--wrapped-card-render-scale:1.42] lg:[--wrapped-card-render-scale:1.56]";
	const hitShellClassNames = `mymind-wrapped-final-stage__card-hit-shell ${cardScaleClassNames}`;
	const tiltShellClassNames = `team-lineup-card-tilt-shell mymind-wrapped-final-stage__tilt-shell${
		tiltShellClassName ? ` ${tiltShellClassName}` : ""
	}`;

	return (
		<div className={cardVisualStageClassNames}>
			<button
				aria-label={buttonLabel}
				aria-pressed={isFrontVisible}
				className={hitShellClassNames}
				data-card-face={cardFace}
				disabled={isDisabled}
				onClick={onFlip}
				type="button"
			>
				<div
					ref={morphShellRef}
					className="mymind-wrapped-final-stage__card-morph-shell"
					onPointerMove={(event) => {
						if (isTiltEnabled && !isFlipAnimating) {
							tiltController.handlePointerMove(event);
						}
					}}
					onPointerEnter={tiltController.handlePointerEnter}
					onPointerLeave={tiltController.handlePointerLeave}
					onPointerCancel={tiltController.handlePointerLeave}
				>
					<div
						ref={(node) => {
							tiltController.cardTiltRef.current = node;
						}}
						className={tiltShellClassNames}
						data-flip-active={isFlipAnimating ? "true" : "false"}
						data-tilt-active="false"
						style={
							{
								"--wrapped-card-flip-rotate-y": isFrontVisible
									? "0deg"
									: "180deg",
							} as CSSProperties
						}
					>
						<div
							className="mymind-wrapped-final-stage__flip-control"
							data-card-face={cardFace}
						>
							<WrappedPrintedCardFlip
								captureKey={printedCardCaptureKey}
								front={
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
								}
								back={
									<div className="grid justify-center">
										<WrappedTeamMemberCardBack
											disableOuterShadow
											metrics={backMetrics}
											shellClassName={shellClassName}
											shellStyle={shellStyle}
											theme={theme}
										/>
									</div>
								}
								isFrontVisible={isFrontVisible}
								reduceMotion={reduceMotion}
							/>
						</div>
					</div>
				</div>
			</button>
		</div>
	);
}

export function WrappedTeamCardPublicStage(
	props: WrappedTeamCardPublicStageProps,
) {
	const {
		action,
		activeArchetype,
		backMetrics = [],
		headerLeftMetric,
		headerRightMetric,
		revealMetrics,
		row,
		shellClassName,
		shellStyle,
		statItems,
		statLayerOpacities,
		theme,
		tiltController,
	} = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const [isCardFrontVisible, setIsCardFrontVisible] = useState(true);
	const [isCardFlipAnimating, setIsCardFlipAnimating] = useState(false);
	const [hasPublicTurnAroundCompleted, setHasPublicTurnAroundCompleted] =
		useState(false);
	const revealCopy = getWrappedRevealCopy({
		activeArchetype,
		audience: "public",
		backMetrics,
		revealMetrics,
		row,
		statItems,
	});
	const revealArchetypeHeadingLabel = getWrappedRevealArchetypeHeadingLabel({
		activeArchetype,
		audience: "public",
		row,
	});
	const revealArchetypeLinePrefix = getWrappedRevealArchetypeLinePrefix({
		activeArchetype,
		audience: "public",
	});
	const revealArchetypeLineSuffix =
		getWrappedRevealArchetypeLineSuffix(activeArchetype);
	const printedCardCaptureKey = [
		activeArchetype.id,
		row.userId,
		row.displayName,
		row.imageUrl ?? "",
		theme,
		shellClassName,
		headerLeftMetric?.value ?? "",
		headerRightMetric?.value ?? "",
		...statItems.map((item) => `${item.key}:${item.value}`),
		...backMetrics.map((metric) => `${metric.label}:${metric.value}`),
	].join("|");

	useEffect(() => {
		if (!isCardFlipAnimating || reduceMotion) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setIsCardFlipAnimating(false);
			if (!isCardFrontVisible) {
				setHasPublicTurnAroundCompleted(true);
			}
		}, REVEAL_STAGE_CARD_FLIP_DURATION_MS);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [isCardFlipAnimating, isCardFrontVisible, reduceMotion]);

	function handlePublicCardFlipToggle() {
		if (isCardFlipAnimating) {
			return;
		}

		tiltController.handlePointerLeave();

		if (reduceMotion) {
			if (isCardFrontVisible) {
				setHasPublicTurnAroundCompleted(true);
			}
			setIsCardFrontVisible((currentValue) => !currentValue);
			return;
		}

		setIsCardFlipAnimating(true);
		setIsCardFrontVisible((currentValue) => !currentValue);
	}

	const publicPrimaryAction = hasPublicTurnAroundCompleted ? (
		action
	) : (
		<WrappedPrimaryAction
			kind="button"
			className="text-[1.0625rem] font-semibold"
			disabled={isCardFlipAnimating}
			icon={<ChevronRight className="size-4" />}
			onClick={handlePublicCardFlipToggle}
		>
			Turn around
		</WrappedPrimaryAction>
	);

	return (
		<WrappedStageFrame
			className="mymind-wrapped-final-stage mymind-wrapped-final-stage--reveal mymind-wrapped-final-stage--public-card"
			objectClassName="mymind-wrapped-final-stage__object mymind-wrapped-final-stage__object--canvas"
			supportClassName="mymind-wrapped-final-stage__support"
			object={
				<div className="mymind-wrapped-final-stage__canvas mymind-wrapped-public-card-stage__canvas">
					<div
						className="mymind-wrapped-final-stage__card-drop-layer mymind-wrapped-public-card-stage__card-layer"
						data-card-state="dropped"
					>
						<div
							className="mymind-wrapped-final-stage__reveal-stage mymind-wrapped-public-card-stage__composition"
							data-companion-state="visible"
							data-motion={reduceMotion ? "reduced" : "standard"}
						>
							<div className="mymind-wrapped-final-stage__slide-card-slot">
								<WrappedTeamCardFlipSurface
									backMetrics={backMetrics}
									buttonLabel={
										isCardFrontVisible
											? "Show back of card"
											: "Show front of card"
									}
									cardVisualStageClassName="mymind-wrapped-public-card-stage__card-visual-stage"
									headerLeftMetric={headerLeftMetric}
									headerRightMetric={headerRightMetric}
									isDisabled={isCardFlipAnimating}
									isFlipAnimating={isCardFlipAnimating}
									isFrontVisible={isCardFrontVisible}
									isTiltEnabled
									onFlip={handlePublicCardFlipToggle}
									printedCardCaptureKey={printedCardCaptureKey}
									reduceMotion={reduceMotion}
									row={row}
									shellClassName={shellClassName}
									shellStyle={shellStyle}
									statItems={statItems}
									statLayerOpacities={statLayerOpacities}
									theme={theme}
									tiltController={tiltController}
									tiltShellClassName="mymind-wrapped-public-card-stage__tilt"
								/>
							</div>

							<aside className="mymind-wrapped-final-stage__archetype-copy mymind-wrapped-public-card-stage__copy">
								<h1
									aria-label={revealArchetypeHeadingLabel}
									className="mymind-wrapped-final-stage__archetype-title"
								>
									<span className="mymind-wrapped-final-stage__archetype-name">
										{row.displayName}
									</span>
									<span className="mymind-wrapped-final-stage__archetype-line">
										{revealArchetypeLinePrefix}
										<WrappedArchetypeGradientText
											activeArchetype={activeArchetype}
											className="mymind-wrapped-final-stage__archetype-accent"
											isHoverReplayEnabled
											state="active"
											suffix={revealArchetypeLineSuffix}
										/>
									</span>
								</h1>
								<p className="mymind-wrapped-final-stage__archetype-description">
									{revealCopy.description}
								</p>
							</aside>
						</div>
					</div>
				</div>
			}
			support={
				<div className="mymind-wrapped-action-stack mymind-wrapped-action-stack--single-action mymind-wrapped-public-card-stage__action">
					{publicPrimaryAction}
				</div>
			}
		/>
	);
}

function getWrappedShareChromeMotion(input: {
	delay: number;
	reduceMotion: boolean;
	y: number;
}) {
	const { delay, reduceMotion, y } = input;

	if (reduceMotion) {
		return {
			animate: { opacity: 1 },
			initial: { opacity: 0 },
			transition: {
				delay: Math.min(delay, 0.08),
				duration: 0.14,
				ease: "linear" as const,
			},
		};
	}

	return {
		animate: { filter: "blur(0px)", opacity: 1, y: 0 },
		initial: { filter: "blur(8px)", opacity: 0, y },
		transition: {
			delay,
			duration: 0.32,
			ease: WRAPPED_FINAL_SHARE_CHROME_EASE,
		},
	};
}

export function WrappedTeamCardRevealStage(
	props: WrappedTeamCardRevealStageProps,
) {
	const {
		activeArchetype,
		footerActionLabel = "Continue",
		handoffCardRef,
		headerLeftMetric,
		headerRightMetric,
		isPostHandoffPreparing = false,
		isPreviewPostVisible,
		onboardingMetrics,
		onPreviewPost,
		onRevealComplete,
		revealedFooterActionLabel,
		row,
		shellClassName,
		shellStyle,
		shareCardCreatedAtLabel,
		statItems,
		statLayerOpacities,
		theme,
		tiltController,
	} = props;
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const [introPhase, setIntroPhase] = useState<WrappedRevealIntroPhase>(() =>
		reduceMotion ? "accent" : "name",
	);
	const [isCardDropped, setIsCardDropped] = useState(() => reduceMotion);
	const [isCardFrontVisible, setIsCardFrontVisible] = useState(false);
	const [hasCardFrontBeenRevealed, setHasCardFrontBeenRevealed] =
		useState(false);
	const [hasInitialCardFlipSettled, setHasInitialCardFlipSettled] =
		useState(false);
	const [isCardFlipAnimating, setIsCardFlipAnimating] = useState(false);
	const [isRevealExitQueuedAfterFlip, setIsRevealExitQueuedAfterFlip] =
		useState(false);
	const [isRevealExitPending, setIsRevealExitPending] = useState(false);
	const revealTimerRefs = useRef<number[]>([]);
	const onRevealCompleteRef = useRef(onRevealComplete);
	const revealCopy = getWrappedRevealCopy({
		activeArchetype,
		onboardingMetrics,
		row,
		statItems,
	});
	const revealBackMetrics = getWrappedRevealBackMetrics({
		onboardingMetrics,
		row,
		shareCardCreatedAtLabel,
	});
	const shouldShowRevealIntroLine =
		introPhase === "line" ||
		introPhase === "accent" ||
		introPhase === "description";
	const shouldShowRevealIntroAccent =
		introPhase === "accent" || introPhase === "description";
	const shouldShowRevealIntroDescription = introPhase === "description";
	const shouldShowRevealIntroContinue =
		!isCardDropped && shouldShowRevealIntroDescription;
	const shouldShowArchetypeCompanion =
		isCardDropped &&
		hasCardFrontBeenRevealed &&
		(hasInitialCardFlipSettled || !isCardFlipAnimating) &&
		!isRevealExitPending;
	const revealArchetypeHeadingLabel = getWrappedRevealArchetypeHeadingLabel({
		activeArchetype,
		audience: "owner",
		row,
	});
	const revealIntroHeadingLabel = shouldShowRevealIntroLine
		? revealArchetypeHeadingLabel
		: undefined;
	const revealArchetypeLinePrefix = getWrappedRevealArchetypeLinePrefix({
		activeArchetype,
		audience: "owner",
	});
	const revealArchetypeLineSuffix =
		getWrappedRevealArchetypeLineSuffix(activeArchetype);
	const revealCompanionState = shouldShowArchetypeCompanion
		? "visible"
		: isRevealExitPending
			? "exiting"
			: "hidden";
	const revealFooterLabel = hasCardFrontBeenRevealed
		? (revealedFooterActionLabel ?? footerActionLabel)
		: footerActionLabel;
	const cardFlipButtonLabel = !hasCardFrontBeenRevealed
		? "Reveal front of card"
		: isCardFrontVisible
			? "Show back of card"
			: "Show front of card";
	const shouldShowRevealFooter =
		shouldShowRevealIntroContinue || (isCardDropped && isPreviewPostVisible);
	const printedCardCaptureKey = [
		activeArchetype.id,
		row.userId,
		row.displayName,
		row.imageUrl ?? "",
		theme,
		shellClassName,
		headerLeftMetric.value,
		headerRightMetric.value,
		...statItems.map((item) => `${item.key}:${item.value}`),
		...revealBackMetrics.map((metric) => `${metric.label}:${metric.value}`),
	].join("|");

	useEffect(() => {
		onRevealCompleteRef.current = onRevealComplete;
	}, [onRevealComplete]);

	function clearRevealTimers() {
		for (const timeoutId of revealTimerRefs.current) {
			window.clearTimeout(timeoutId);
		}

		revealTimerRefs.current = [];
	}

	function notifyRevealComplete() {
		onRevealCompleteRef.current?.();
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: the reveal sequence should restart when the active archetype changes.
	useEffect(() => {
		clearRevealTimers();

		if (reduceMotion) {
			setIntroPhase("description");
			setIsCardDropped(false);
			setIsCardFrontVisible(false);
			setHasCardFrontBeenRevealed(false);
			setHasInitialCardFlipSettled(false);
			setIsCardFlipAnimating(false);
			setIsRevealExitQueuedAfterFlip(false);
			setIsRevealExitPending(false);
			return;
		}

		setIntroPhase("name");
		setIsCardDropped(false);
		setIsCardFrontVisible(false);
		setHasCardFrontBeenRevealed(false);
		setHasInitialCardFlipSettled(false);
		setIsCardFlipAnimating(false);
		setIsRevealExitQueuedAfterFlip(false);
		setIsRevealExitPending(false);
		const timeoutIds = [
			window.setTimeout(() => {
				setIntroPhase("line");
			}, REVEAL_INTRO_TIMING.lineRevealMs),
			window.setTimeout(() => {
				setIntroPhase("accent");
			}, REVEAL_INTRO_TIMING.accentRevealMs),
			window.setTimeout(() => {
				setIntroPhase("description");
			}, REVEAL_INTRO_TIMING.descriptionRevealMs),
		];
		revealTimerRefs.current = timeoutIds;

		return () => {
			clearRevealTimers();
		};
	}, [activeArchetype.id, reduceMotion]);

	useEffect(() => {
		if (!isRevealExitPending) {
			return;
		}

		if (reduceMotion) {
			onPreviewPost();
			return;
		}

		const timeoutId = window.setTimeout(() => {
			onPreviewPost();
		}, REVEAL_COMPANION_TIMING.exitToShareMs);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [isRevealExitPending, onPreviewPost, reduceMotion]);

	useEffect(() => {
		if (!isCardFlipAnimating || reduceMotion) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setIsCardFlipAnimating(false);
			setHasInitialCardFlipSettled(true);

			if (isRevealExitQueuedAfterFlip) {
				setIsRevealExitQueuedAfterFlip(false);
				setIsRevealExitPending(true);
			}
		}, REVEAL_STAGE_CARD_FLIP_DURATION_MS);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [isCardFlipAnimating, isRevealExitQueuedAfterFlip, reduceMotion]);

	function startRevealCardDrop() {
		clearRevealTimers();
		setIsCardDropped(true);

		if (reduceMotion) {
			notifyRevealComplete();
			return;
		}

		const timeoutId = window.setTimeout(() => {
			notifyRevealComplete();
		}, REVEAL_STAGE_CARD_DROP_DURATION_MS);

		revealTimerRefs.current = [timeoutId];
	}

	function handleCardFlipToggle() {
		if (
			!isCardDropped ||
			isCardFlipAnimating ||
			isRevealExitPending ||
			isPostHandoffPreparing
		) {
			return;
		}

		tiltController.handlePointerLeave();
		setIsRevealExitQueuedAfterFlip(false);
		setHasCardFrontBeenRevealed(true);

		if (reduceMotion) {
			setHasInitialCardFlipSettled(true);
			setIsCardFrontVisible((currentValue) => !currentValue);
			return;
		}

		setIsCardFlipAnimating(true);
		setIsCardFrontVisible((currentValue) => !currentValue);
	}

	function revealFrontBeforeShareHandoff() {
		tiltController.handlePointerLeave();

		if (reduceMotion) {
			setIsCardFrontVisible(true);
			setIsRevealExitQueuedAfterFlip(false);
			setIsRevealExitPending(true);
			return;
		}

		setIsRevealExitQueuedAfterFlip(true);
		setIsCardFlipAnimating(true);
		setIsCardFrontVisible(true);
	}

	function handleRevealFooterAction() {
		if (isCardFlipAnimating || isRevealExitPending || isPostHandoffPreparing) {
			return;
		}

		if (!isCardDropped) {
			if (!shouldShowRevealIntroContinue) {
				return;
			}

			startRevealCardDrop();
			return;
		}

		if (!hasCardFrontBeenRevealed) {
			handleCardFlipToggle();
			return;
		}

		if (!isCardFrontVisible) {
			revealFrontBeforeShareHandoff();
			return;
		}

		tiltController.handlePointerLeave();
		setIsRevealExitPending(true);
	}

	return (
		<WrappedStageFrame
			className={`mymind-wrapped-final-stage mymind-wrapped-final-stage--reveal${
				isPostHandoffPreparing
					? " mymind-wrapped-final-stage--handoff-preparing"
					: ""
			}`}
			objectClassName="mymind-wrapped-final-stage__object mymind-wrapped-final-stage__object--canvas"
			supportClassName="mymind-wrapped-final-stage__support"
			object={
				<div className="mymind-wrapped-final-stage__canvas">
					<div className="mymind-wrapped-final-stage__text-layer">
						<AnimatePresence initial={false} mode="wait">
							{!isCardDropped ? (
								<motion.div
									key={`${activeArchetype.id}:intro`}
									animate={{
										filter: "blur(0px)",
										opacity: 1,
										scale: REVEAL_INTRO_COPY.finalScale,
										y: 0,
									}}
									exit={{
										filter: `blur(${REVEAL_INTRO_COPY.exitBlur})`,
										opacity: 0,
										scale: REVEAL_INTRO_COPY.exitScale,
										y: -18,
									}}
									initial={{
										filter: `blur(${REVEAL_INTRO_COPY.enterBlur})`,
										opacity: 0,
										scale: REVEAL_INTRO_COPY.initialScale,
										y: 18,
									}}
									className="mymind-wrapped-final-stage__canvas-copy-shell"
									transition={REVEAL_INTRO_COPY.transition}
								>
									<h1
										aria-label={revealIntroHeadingLabel}
										className="mymind-wrapped-final-stage__canvas-copy"
									>
										<span className="mymind-wrapped-final-stage__canvas-copy-name">
											{row.displayName},
										</span>
										<motion.span
											animate={{
												opacity: shouldShowRevealIntroLine ? 1 : 0,
												y: shouldShowRevealIntroLine
													? 0
													: REVEAL_INTRO_COPY.lineOffsetY,
											}}
											aria-hidden={!shouldShowRevealIntroLine}
											className="mymind-wrapped-final-stage__canvas-copy-line"
											initial={false}
											transition={REVEAL_INTRO_COPY.lineTransition}
										>
											{revealArchetypeLinePrefix}
											<WrappedArchetypeGradientText
												activeArchetype={activeArchetype}
												className="mymind-wrapped-final-stage__intro-accent"
												state={
													shouldShowRevealIntroAccent ? "active" : "waiting"
												}
												suffix={revealArchetypeLineSuffix}
											/>
										</motion.span>
									</h1>
									<motion.p
										animate={{
											filter: shouldShowRevealIntroDescription
												? "blur(0px)"
												: `blur(${REVEAL_INTRO_COPY.descriptionBlur})`,
											opacity: shouldShowRevealIntroDescription ? 1 : 0,
											y: shouldShowRevealIntroDescription
												? 0
												: REVEAL_INTRO_COPY.descriptionOffsetY,
										}}
										aria-hidden={!shouldShowRevealIntroDescription}
										className="mymind-wrapped-final-stage__canvas-description"
										initial={false}
										transition={REVEAL_INTRO_COPY.descriptionTransition}
									>
										{revealCopy.description}
									</motion.p>
								</motion.div>
							) : null}
						</AnimatePresence>
					</div>
					<motion.div
						animate={resolveWrappedRevealCardAnimate({
							isCardDropped,
							reduceMotion,
						})}
						className="mymind-wrapped-final-stage__card-drop-layer"
						data-card-state={isCardDropped ? "dropped" : "waiting"}
						initial={false}
						style={{
							pointerEvents: isCardDropped ? "auto" : "none",
							transformPerspective: 2200,
							transformStyle: "preserve-3d",
						}}
						transition={resolveWrappedRevealCardTransition({
							isCardDropped,
							reduceMotion,
						})}
					>
						<div
							className="mymind-wrapped-final-stage__reveal-stage"
							data-companion-state={revealCompanionState}
							data-motion={reduceMotion ? "reduced" : "standard"}
						>
							<div className="mymind-wrapped-final-stage__slide-card-slot">
								<WrappedTeamCardFlipSurface
									backMetrics={revealBackMetrics}
									buttonLabel={cardFlipButtonLabel}
									headerLeftMetric={headerLeftMetric}
									headerRightMetric={headerRightMetric}
									isDisabled={
										!isCardDropped ||
										isCardFlipAnimating ||
										isPostHandoffPreparing ||
										isRevealExitPending
									}
									isFlipAnimating={isCardFlipAnimating}
									isFrontVisible={isCardFrontVisible}
									isTiltEnabled={
										!isPostHandoffPreparing && !isRevealExitPending
									}
									morphShellRef={handoffCardRef}
									onFlip={handleCardFlipToggle}
									printedCardCaptureKey={printedCardCaptureKey}
									reduceMotion={reduceMotion}
									row={row}
									shellClassName={shellClassName}
									shellStyle={shellStyle}
									statItems={statItems}
									statLayerOpacities={statLayerOpacities}
									theme={theme}
									tiltController={tiltController}
								/>
							</div>

							<AnimatePresence>
								{shouldShowArchetypeCompanion ? (
									<motion.aside
										key={activeArchetype.id}
										animate={{
											filter: "blur(0px)",
											opacity: 1,
											scale: REVEAL_COMPANION_COPY.finalScale,
											y: 0,
										}}
										className="mymind-wrapped-final-stage__archetype-copy"
										exit={{
											filter: `blur(${REVEAL_COMPANION_COPY.exitBlur})`,
											opacity: 0,
											scale: REVEAL_COMPANION_COPY.exitScale,
											y: REVEAL_COMPANION_COPY.exitOffsetY,
										}}
										initial={{
											filter: `blur(${REVEAL_COMPANION_COPY.enterBlur})`,
											opacity: 0,
											scale: REVEAL_COMPANION_COPY.initialScale,
											y: REVEAL_COMPANION_COPY.enterOffsetY,
										}}
										transition={
											reduceMotion
												? { duration: 0 }
												: {
														...REVEAL_COMPANION_COPY.transition,
														delay: REVEAL_COMPANION_TIMING.copyEnter,
													}
										}
									>
										<h2
											aria-label={revealArchetypeHeadingLabel}
											className="mymind-wrapped-final-stage__archetype-title"
										>
											<span className="mymind-wrapped-final-stage__archetype-name">
												{row.displayName},
											</span>
											<span className="mymind-wrapped-final-stage__archetype-line">
												{revealArchetypeLinePrefix}
												<WrappedArchetypeGradientText
													activeArchetype={activeArchetype}
													className="mymind-wrapped-final-stage__archetype-accent"
													isHoverReplayEnabled
													state="active"
													suffix={revealArchetypeLineSuffix}
												/>
											</span>
										</h2>
										<p className="mymind-wrapped-final-stage__archetype-description">
											{revealCopy.description}
										</p>
									</motion.aside>
								) : null}
							</AnimatePresence>
						</div>
					</motion.div>
				</div>
			}
			support={
				<WrappedTeamCardRevealFooter
					isDisabled={
						isCardFlipAnimating ||
						isPostHandoffPreparing ||
						isRevealExitPending ||
						isRevealExitQueuedAfterFlip
					}
					isVisible={shouldShowRevealFooter}
					label={revealFooterLabel}
					onAction={handleRevealFooterAction}
				/>
			}
		/>
	);
}

function getWrappedRevealBackMetrics(input: {
	onboardingMetrics: WrappedOnboardingMetrics;
	row: TeamPageMemberRow;
	shareCardCreatedAtLabel: string;
}) {
	return buildWrappedTeamCardBackMetrics(input);
}

function resolveWrappedRevealCardAnimate(input: {
	isCardDropped: boolean;
	reduceMotion: boolean;
}) {
	const { isCardDropped, reduceMotion } = input;

	if (reduceMotion) {
		return {
			filter: "blur(0px)",
			opacity: 1,
			rotate: "0deg",
			rotateX: "0deg",
			scale: 1,
			y: 0,
		};
	}

	if (!isCardDropped) {
		return {
			filter: "blur(24px)",
			opacity: 0,
			rotate: "-10deg",
			rotateX: "76deg",
			scale: 2.65,
			y: -240,
		};
	}

	return {
		filter: "blur(0px)",
		opacity: 1,
		rotate: "0deg",
		rotateX: "0deg",
		scale: 1,
		y: 0,
	};
}

function resolveWrappedRevealCardTransition(input: {
	isCardDropped: boolean;
	reduceMotion: boolean;
}) {
	const { isCardDropped, reduceMotion } = input;

	if (reduceMotion) {
		return {
			duration: 0.14,
			ease: "linear" as const,
		};
	}

	if (!isCardDropped) {
		return {
			duration: 0,
		};
	}

	return {
		duration: REVEAL_STAGE_MOTION.duration.card,
		ease: REVEAL_STAGE_MOTION.easing.drop,
	};
}

function getWrappedRevealCopy(input: WrappedRevealCopyInput): {
	description: string;
	title: string;
} {
	const { activeArchetype } = input;

	switch (activeArchetype.id) {
		case "roadrunner":
			return {
				description: buildRoadrunnerRevealDescription(input),
				title: "Roadrunner energy.",
			};
		case "hit_and_runner":
			return {
				description: buildHitAndRunnerRevealDescription(input),
				title: "Hit. Run. Repeat.",
			};
		case "adhd_brain":
			return {
				description: buildAdhdBrainRevealDescription(input),
				title: "Every tab had a job.",
			};
		case "cheapskate":
			return {
				description: buildCheapskateRevealDescription(input),
				title: "Low spend, sharp eye.",
			};
		case "company_card":
			return {
				description: buildCompanyCardRevealDescription(input),
				title: "Big-budget instincts.",
			};
		case "decimal":
			return {
				description:
					"For the rare edition energy: polished, expensive-looking, and very aware of the room.",
				title: "Decimal treatment.",
			};
		case "tourist":
			return {
				description: buildTouristRevealDescription(input),
				title: "Every repo got a visit.",
			};
		case "smooth_operator":
			return {
				description: buildSmoothOperatorRevealDescription(input),
				title: "Smooth by default.",
			};
		case "obsessed":
			return {
				description: buildObsessedRevealDescription(input),
				title: "Fully, maybe too fully, locked in.",
			};
		case "maniac":
			return {
				description: buildManiacRevealDescription(input),
				title: "No chill. All velocity.",
			};
		default:
			return {
				description:
					"For the kind of operator whose working style is strong enough to deserve its own card.",
				title: `${activeArchetype.displayLabel}, framed.`,
			};
	}
}

function buildRoadrunnerRevealDescription(input: WrappedRevealCopyInput) {
	const { audience = "owner", row } = input;
	const activeDays = formatWrappedRevealInteger(row.activeDays);
	const daysSinceFirst = formatWrappedRevealInteger(
		resolveWrappedRevealDaysSinceFirst(input),
	);
	const costPerSession = formatCurrency(
		row.totalSessions > 0 ? row.cost / row.totalSessions : 0,
	);

	if (audience === "public") {
		return `${row.displayName} is here. Meep meep. ${row.displayName} is gone. Active ${activeDays} out of ${daysSinceFirst} days. When ${row.displayName} showed up, we noticed. ${costPerSession} a session. Meep Meep. Gone again. Where? Nobody knows`;
	}

	return `You're here. Meep meep. You're gone. Active ${activeDays} out of ${daysSinceFirst} days. When you showed up, we noticed. ${costPerSession} a session. Meep Meep. Gone again. Where? Nobody knows`;
}

function buildManiacRevealDescription(input: WrappedRevealCopyInput) {
	const { onboardingMetrics, revealMetrics, row, statItems } = input;
	const activeDays = formatWrappedRevealInteger(row.activeDays);
	const daysSinceFirst = formatWrappedRevealInteger(
		resolveWrappedRevealDaysSinceFirst(input),
	);
	const distinctProjectCount = formatWrappedRevealInteger(
		resolveWrappedRevealDistinctProjectCount({
			onboardingMetrics,
			revealMetrics,
			statItems,
		}),
	);
	const sessionsPerActiveDay = formatWrappedRevealSessionsPerActiveDay({
		activeDays: row.activeDays,
		totalSessions: row.totalSessions,
	});

	return [
		`${activeDays} out of ${daysSinceFirst} days. ${distinctProjectCount} repos.`,
		"Most people are consistent. Some people are everywhere at once.",
		"You're both. Somehow.",
		`${sessionsPerActiveDay} sessions every time you're active.`,
		"We're a little scared honestly. Pls don't hurt someone",
	].join(" ");
}

function buildCompanyCardRevealDescription(input: WrappedRevealCopyInput) {
	const { onboardingMetrics, row } = input;
	const totalSessions = formatWrappedRevealInteger(row.totalSessions);
	const commitRate = formatWrappedRevealInteger(
		resolveWrappedRevealCommitRate(input),
	);
	const costPerSession = formatCurrency(
		row.totalSessions > 0 ? row.cost / row.totalSessions : 0,
	);
	const totalCost = formatWrappedRevealWholeCurrency(row.cost);
	const happyLine = formatWrappedRevealCompanyCardHappyLine({
		favoriteModel: row.favoriteModel,
		onboardingMetrics,
	});

	return [
		`${totalSessions} sessions. ${commitRate}% of them shipped something.`,
		`${costPerSession} a session. ${totalCost} in total.`,
		"Not saying it's a problem. We don't judge.",
		"Spend as much as you want.",
		happyLine,
	].join(" ");
}

function buildAdhdBrainRevealDescription(input: WrappedRevealCopyInput) {
	const { onboardingMetrics, revealMetrics, row, statItems } = input;
	const activeDays = formatWrappedRevealInteger(row.activeDays);
	const daysSinceFirst = formatWrappedRevealInteger(
		resolveWrappedRevealDaysSinceFirst(input),
	);
	const distinctProjectCount = formatWrappedRevealInteger(
		resolveWrappedRevealDistinctProjectCount({
			onboardingMetrics,
			revealMetrics,
			statItems,
		}),
	);
	const commitRate = formatWrappedRevealInteger(
		resolveWrappedRevealCommitRate(input),
	);

	return [
		`${activeDays} out of ${daysSinceFirst} days. ${distinctProjectCount} repos. ${commitRate}% of sessions shipped something.`,
		"You'd call yourself a DaVinci.",
		`We're just worried about the ${distinctProjectCount} repos.`,
	].join(" ");
}

function buildHitAndRunnerRevealDescription(input: WrappedRevealCopyInput) {
	const { onboardingMetrics, revealMetrics, statItems } = input;
	const avgSessionMin = formatWrappedRevealInteger(
		resolveWrappedRevealAvgSessionMin(input),
	);
	const distinctProjectCount = formatWrappedRevealInteger(
		resolveWrappedRevealDistinctProjectCount({
			onboardingMetrics,
			revealMetrics,
			statItems,
		}),
	);
	const commitRate = formatWrappedRevealInteger(
		resolveWrappedRevealCommitRate(input),
	);

	return [
		`${avgSessionMin} minutes average. ${distinctProjectCount} repos. ${commitRate}% of sessions shipped something.`,
		"Veni, vidi, commit.",
		`In at ${avgSessionMin} minutes. Out before anyone noticed.`,
		"You could be a hitman.",
	].join(" ");
}

function buildCheapskateRevealDescription(input: WrappedRevealCopyInput) {
	const { row } = input;
	const commitRate = formatWrappedRevealInteger(
		resolveWrappedRevealCommitRate(input),
	);
	const costPerSession = formatCurrency(
		row.totalSessions > 0 ? row.cost / row.totalSessions : 0,
	);

	return [
		`${costPerSession} a session. ${commitRate}% of those shipped something.`,
		"Mr. Krabs is very proud of you. But you've never once picked up the check.",
	].join(" ");
}

function buildObsessedRevealDescription(input: WrappedRevealCopyInput) {
	const { onboardingMetrics, revealMetrics, row, statItems } = input;
	const activeDays = formatWrappedRevealInteger(row.activeDays);
	const daysSinceFirst = formatWrappedRevealInteger(
		resolveWrappedRevealDaysSinceFirst(input),
	);
	const distinctProjectCount = formatWrappedRevealInteger(
		resolveWrappedRevealDistinctProjectCount({
			onboardingMetrics,
			revealMetrics,
			statItems,
		}),
	);
	const commitRate = formatWrappedRevealInteger(
		resolveWrappedRevealCommitRate(input),
	);
	const costPerSession = formatCurrency(
		row.totalSessions > 0 ? row.cost / row.totalSessions : 0,
	);

	return [
		`${distinctProjectCount} repo. That's it.`,
		`${activeDays} out of ${daysSinceFirst} days. All of it, same place.`,
		`${commitRate}% of your sessions shipped something. At ${costPerSession} a session.`,
		"May god help anyone who tries to distract you.",
	].join(" ");
}

function buildSmoothOperatorRevealDescription(input: WrappedRevealCopyInput) {
	const { row } = input;
	const activeDays = formatWrappedRevealInteger(row.activeDays);
	const daysSinceFirst = formatWrappedRevealInteger(
		resolveWrappedRevealDaysSinceFirst(input),
	);
	const avgSessionMin = formatWrappedRevealInteger(
		resolveWrappedRevealAvgSessionMin(input),
	);
	const longestSessionMin = formatWrappedRevealInteger(
		resolveWrappedRevealLongestSessionMin(input),
	);
	const sessionsPerActiveDay = formatWrappedRevealSessionsPerActiveDay({
		activeDays: row.activeDays,
		totalSessions: row.totalSessions,
	});
	const costPerSession = formatCurrency(
		row.totalSessions > 0 ? row.cost / row.totalSessions : 0,
	);

	return [
		`${activeDays} out of ${daysSinceFirst} days.`,
		`${avgSessionMin} minutes average. ${longestSessionMin} at your longest.`,
		"You start. You build. You stop.",
		`${sessionsPerActiveDay} sessions a day, ${costPerSession} a session, no chaos.`,
		"A little to bit too smooth... bit suspicious.",
	].join(" ");
}

function buildTouristRevealDescription(input: WrappedRevealCopyInput) {
	const { row } = input;
	const totalSessions = formatWrappedRevealInteger(row.totalSessions);
	const commitRate = formatWrappedRevealInteger(
		resolveWrappedRevealCommitRate(input),
	);
	const costPerSession = formatCurrency(
		row.totalSessions > 0 ? row.cost / row.totalSessions : 0,
	);

	return [
		`${totalSessions} sessions. ${commitRate}% shipped something. ${costPerSession} a session.`,
		"At least you tried it out! There's no prize for participation though",
	].join(" ");
}

function formatWrappedRevealInteger(value: number) {
	return Math.max(0, Math.round(value)).toLocaleString("en-US");
}

function formatWrappedRevealWholeCurrency(value: number) {
	return `$${formatWrappedRevealInteger(value)}`;
}

function formatWrappedRevealSessionsPerActiveDay(input: {
	activeDays: number;
	totalSessions: number;
}) {
	const activeDays = Math.max(0, input.activeDays);
	const totalSessions = Math.max(0, input.totalSessions);
	const sessionsPerActiveDay = activeDays > 0 ? totalSessions / activeDays : 0;

	return sessionsPerActiveDay.toLocaleString("en-US", {
		maximumFractionDigits: 1,
	});
}

function resolveWrappedRevealDistinctProjectCount(input: {
	onboardingMetrics?: WrappedOnboardingMetrics;
	revealMetrics?: WrappedShareRevealMetrics;
	statItems?: readonly WrappedTeamMemberCardStatItem[];
}) {
	const onboardingCount = input.onboardingMetrics?.distinctProjectCount;

	if (onboardingCount !== undefined && onboardingCount > 0) {
		return onboardingCount;
	}

	const revealCount = input.revealMetrics?.distinctProjectCount;

	if (revealCount !== undefined && revealCount > 0) {
		return revealCount;
	}

	const statItemValue = input.statItems?.find(
		(item) => item.key === "repos",
	)?.value;
	const parsedStatItemValue = statItemValue
		? Number.parseInt(statItemValue.replaceAll(/\D/gu, ""), 10)
		: Number.NaN;

	if (Number.isFinite(parsedStatItemValue)) {
		return parsedStatItemValue;
	}

	return input.onboardingMetrics?.repoPulse.totalRepos ?? 0;
}

function resolveWrappedRevealAvgSessionMin(input: WrappedRevealCopyInput) {
	return (
		input.onboardingMetrics?.avgSessionMin ??
		input.revealMetrics?.avgSessionMin ??
		resolveWrappedRevealBackMetricNumber(
			input.backMetrics,
			"Avg session min",
		) ??
		0
	);
}

function resolveWrappedRevealCommitRate(input: WrappedRevealCopyInput) {
	return (
		input.onboardingMetrics?.commitRate ??
		input.revealMetrics?.commitRate ??
		resolveWrappedRevealBackMetricNumber(input.backMetrics, "Commit rate %") ??
		0
	);
}

function resolveWrappedRevealDaysSinceFirst(input: WrappedRevealCopyInput) {
	return (
		input.onboardingMetrics?.daysSinceFirst ??
		input.revealMetrics?.daysSinceFirst ??
		input.row.activeDays
	);
}

function resolveWrappedRevealLongestSessionMin(input: WrappedRevealCopyInput) {
	return (
		input.onboardingMetrics?.longestSessionMin ??
		input.revealMetrics?.longestSessionMin ??
		resolveWrappedRevealBackMetricNumber(
			input.backMetrics,
			"Longest session min",
		) ??
		0
	);
}

function resolveWrappedRevealBackMetricNumber(
	backMetrics: readonly WrappedTeamMemberCardBackMetric[] | undefined,
	label: string,
) {
	const metricValue = backMetrics?.find(
		(metric) => metric.label === label,
	)?.value;

	if (!metricValue) {
		return null;
	}

	const parsedMetricValue = Number(metricValue.replace(/[,%$]/gu, "").trim());

	return Number.isFinite(parsedMetricValue) ? parsedMetricValue : null;
}

function formatWrappedRevealCompanyCardHappyLine(input: {
	favoriteModel: string | null;
	onboardingMetrics?: WrappedOnboardingMetrics;
}) {
	const usageSource = getWrappedRevealCompanyCardUsageSource(input);

	if (usageSource === "claude") {
		return "Dario's happy to have you.";
	}

	if (usageSource === "codex") {
		return "Sam's happy to have you.";
	}

	return "Dario & Sam are happy to have you.";
}

function getWrappedRevealCompanyCardUsageSource(input: {
	favoriteModel: string | null;
	onboardingMetrics?: WrappedOnboardingMetrics;
}) {
	const sourceSplit = input.onboardingMetrics?.sourceSplit ?? [];
	const hasClaude = sourceSplit.some(
		(entry) =>
			entry.source === "claude_code" &&
			(entry.session_count > 0 || entry.session_share_percent > 0),
	);
	const hasCodex = sourceSplit.some(
		(entry) =>
			entry.source === "codex" &&
			(entry.session_count > 0 || entry.session_share_percent > 0),
	);

	if (hasClaude && !hasCodex) {
		return "claude";
	}

	if (hasCodex && !hasClaude) {
		return "codex";
	}

	if (hasClaude && hasCodex) {
		return "both";
	}

	const normalizedFavoriteModel = input.favoriteModel?.toLowerCase() ?? "";

	if (normalizedFavoriteModel.includes("claude")) {
		return "claude";
	}

	if (
		normalizedFavoriteModel.includes("codex") ||
		normalizedFavoriteModel.includes("gpt") ||
		normalizedFavoriteModel.includes("openai")
	) {
		return "codex";
	}

	return "both";
}

function getWrappedRevealArchetypeLinePrefix(input: {
	activeArchetype: WrappedArchetypeCardTheme;
	audience: "owner" | "public";
}) {
	const archetypeId = input.activeArchetype.id;

	if (input.audience === "public") {
		if (archetypeId === "company_card") {
			return "got the ";
		}

		if (archetypeId === "adhd_brain") {
			return "is an ";
		}

		return archetypeId === "obsessed" ? "is " : "is a ";
	}

	if (archetypeId === "company_card") {
		return "you got the ";
	}

	if (archetypeId === "adhd_brain") {
		return "you're an ";
	}

	return archetypeId === "obsessed" ? "you're " : "you're a ";
}

function getWrappedRevealArchetypeLineText(input: {
	activeArchetype: WrappedArchetypeCardTheme;
	audience: "owner" | "public";
}) {
	return `${getWrappedRevealArchetypeLinePrefix(input)}${input.activeArchetype.displayLabel}${getWrappedRevealArchetypeLineSuffix(input.activeArchetype)}`;
}

function getWrappedRevealArchetypeHeadingLabel(input: {
	activeArchetype: WrappedArchetypeCardTheme;
	audience: "owner" | "public";
	row: TeamPageMemberRow;
}) {
	const lineText = getWrappedRevealArchetypeLineText(input);
	const nameSeparator = input.audience === "public" ? " " : ", ";

	return `${input.row.displayName}${nameSeparator}${lineText}`;
}

function getWrappedRevealArchetypeLineSuffix(
	activeArchetype: WrappedArchetypeCardTheme,
) {
	if (activeArchetype.id === "company_card") {
		return "?";
	}

	return activeArchetype.id === "obsessed" ||
		activeArchetype.id === "adhd_brain" ||
		activeArchetype.id === "cheapskate" ||
		activeArchetype.id === "hit_and_runner" ||
		activeArchetype.id === "smooth_operator" ||
		activeArchetype.id === "tourist"
		? "."
		: "";
}

export function WrappedTeamCardRevealFooter(props: {
	isDisabled?: boolean;
	isVisible: boolean;
	label: string;
	onAction: () => void;
}) {
	const { isDisabled = false, isVisible, label, onAction } = props;

	return (
		<div
			aria-hidden={isVisible ? undefined : true}
			className="mymind-wrapped-action-stack mymind-wrapped-action-stack--single-action mymind-wrapped-reveal-footer"
			data-visible={isVisible ? "true" : "false"}
		>
			<WrappedPrimaryAction
				kind="button"
				className="text-[1.0625rem] font-semibold"
				disabled={!isVisible || isDisabled}
				icon={<ChevronRight className="size-4" />}
				onClick={onAction}
			>
				{label}
			</WrappedPrimaryAction>
		</div>
	);
}
