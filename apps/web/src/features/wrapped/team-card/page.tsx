import { ChevronLeft, ChevronRight } from "lucide-react";
import { WRAPPED_SHARE_PAYLOAD_VERSION } from "@rudel/api-routes";
import { useDialKit } from "dialkit";
import {
	cloneElement,
	isValidElement,
	startTransition,
	type CSSProperties,
	type ReactNode,
	useMemo,
	useRef,
	useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { Button } from "@/app/ui/button";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { markWrappedCompleted } from "@/features/wrapped/entry";
import { WrappedTeamCardOnboarding } from "@/features/wrapped/onboarding/shell";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import { useMountEffect } from "@/hooks/useMountEffect";
import { formatCompactWholeCurrency } from "@/lib/format";
import {
	WRAPPED_ARCHETYPE_CARD_THEMES,
	type WrappedArchetypeCardTheme,
} from "./archetypes";
import type {
	WrappedTeamMemberCardHeaderMetric,
	WrappedTeamMemberCardStatItem,
	WrappedTeamMemberCardStatLayerOpacities,
} from "./card";
import {
	WrappedTeamCardRevealFooter,
	WrappedTeamCardRevealStage,
	WrappedTeamCardShareStage,
} from "./final-stages";
import { createWrappedTeamCardShareActions } from "./share";
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
	const { trackUtilityUsed } = useAnalyticsTracking({
		pageName: "wrapped_team_card",
	});
	const { completionUserId, onboardingMetrics, statItems, visibleTeamCardRow } =
		useWrappedTeamCardPageData();
	const tiltController = useWrappedCardTilt();
	// The live flow still defaults to a single fallback theme. This index only
	// exists so the dev footer can preview the full card set when needed.
	const [activeArchetypeIndex, setActiveArchetypeIndex] = useState(0);
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
		WRAPPED_ARCHETYPE_CARD_THEMES[activeArchetypeIndex] ??
		WRAPPED_ARCHETYPE_CARD_THEMES[0];

	if (!activeArchetype) {
		throw new Error("Wrapped archetype themes are missing.");
	}

	const activeStepParam = searchParams.get("step");
	const estimatedSpendValue = formatCompactWholeCurrency(visibleTeamCardRow.cost);
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
			// The card shows product-facing labels here, not raw classifier names.
			// Example: the taxonomy says "NPC", while the visible card says
			// "Smooth Operator".
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
			shareCardCreatedAtLabel={shareCardCreatedAtLabel}
			shellStyle={TEAM_CARD_SHELL_STYLE}
			statItems={statItems}
			statLayerOpacities={statLayerOpacities}
			setActiveArchetypeIndex={setActiveArchetypeIndex}
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
	setActiveArchetypeIndex: (nextValue: number | ((currentValue: number) => number)) => void;
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
		setActiveArchetypeIndex,
		shareCardCreatedAtLabel,
		shellStyle,
		statItems,
		statLayerOpacities,
		tiltController,
		visibleTeamCardRow,
	} = props;
	const sharePostRef = useRef<HTMLDivElement>(null);
	const [finalCardStage, setFinalCardStage] =
		useState<FinalCardStage>("reveal");
	const [searchParams] = useSearchParams();
	const { trackNavigation, trackUtilityUsed } = useAnalyticsTracking({
		pageName: "wrapped_team_card",
	});
	const isCardStep = searchParams.get("step") === "card";
	const showShareStage = finalCardStage === "share";
	// The final exported post intentionally uses a stricter media policy than the
	// live card. That keeps image export and public replay reliable without
	// freezing future design changes for the live experience.
	const sharePreviewRow = useMemo(
		() => buildWrappedShareSafeRow(visibleTeamCardRow),
		[visibleTeamCardRow],
	);
	const shareSnapshot = useMemo(
		() =>
			buildWrappedShareSnapshot({
				archetypeLabel: activeArchetype.displayLabel,
				headerLeftMetric,
				headerRightMetric,
				row: sharePreviewRow,
				shellClassName: activeArchetype.shellClassName,
				statItems,
				theme: activeArchetype.theme,
			}),
		[
			activeArchetype.displayLabel,
			activeArchetype.shellClassName,
			activeArchetype.theme,
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
			// "shareCreated" is the moment a persistent public record exists, not the
			// moment the user merely opened the share UI. That distinction matters for
			// the Saturday growth funnel.
			onShareCreated: (shareRecord) => {
				trackUtilityUsed({
					archetypeId: activeArchetype.id,
					entrySource: "wrapped_team_card",
					publicPayloadVersion: WRAPPED_SHARE_PAYLOAD_VERSION,
					shareId: shareRecord.id,
					sourceComponent: "wrapped_team_card_page",
					targetId: shareRecord.id,
					utilityName: "shareCreated",
				});
			},
		},
	);
	// The share action helpers stay presentational from the page's perspective.
	// We pass analytics hooks in, but keep the details of clipboard/native share/
	// download behavior inside the share module.
	const shareActions = createWrappedTeamCardShareActions({
		archetypeLabel: activeArchetype.displayLabel,
		displayName: visibleTeamCardRow.displayName,
		onShareActionTriggered: (action) => {
			trackUtilityUsed({
				sourceComponent: "wrapped_share_actions",
				utilityName: "wrappedShareActionTriggered",
				utilityState: action,
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
		shareUrl,
		shareUrlLabel,
		sharePostRef,
	});

	function handlePreviewPost() {
		// Previewing the share stage is the moment we want to create the public
		// share record. That keeps sharing event-driven and avoids creating public
		// share rows just because someone opened wrapped.
		trackUtilityUsed({
			sourceComponent: "wrapped_reveal_footer",
			utilityName: "wrappedSharePreviewOpened",
			utilityState: "sharePreview",
		});
		void ensureShare().catch(() => {});
		startTransition(() => {
			setFinalCardStage("share");
		});
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

	const finalStage = showShareStage ? (
		<WrappedTeamCardShareStage
			headerLeftMetric={headerLeftMetric}
			headerRightMetric={headerRightMetric}
			onBack={() => {
				startTransition(() => {
					setFinalCardStage("reveal");
				});
			}}
			onCopy={() => void shareActions.handleCopyPost()}
			onContinueToDashboard={() =>
				handleContinueToDashboard("wrapped_share_footer")
			}
			onDownload={() => void shareActions.handleDownloadPost()}
			onShare={() => void shareActions.handleSharePost()}
			row={sharePreviewRow}
			shareCardCreatedAtLabel={shareCardCreatedAtLabel}
			sharePostRef={sharePostRef}
			shareUrl={shareActions.shareUrl}
			shareUrlLabel={shareActions.shareUrlLabel}
			shellClassName={activeArchetype.shellClassName}
			shellStyle={shellStyle}
			statItems={statItems}
			statLayerOpacities={statLayerOpacities}
			theme={activeArchetype.theme}
		/>
	) : (
		<WrappedTeamCardRevealStage
			activeArchetype={activeArchetype}
			headerLeftMetric={headerLeftMetric}
			headerRightMetric={headerRightMetric}
			onboardingMetrics={onboardingMetrics}
			row={visibleTeamCardRow}
			shellClassName={activeArchetype.shellClassName}
			shellStyle={shellStyle}
			statItems={statItems}
			statLayerOpacities={statLayerOpacities}
			theme={activeArchetype.theme}
			tiltController={tiltController}
		/>
	);
	const footerDebugControls =
		import.meta.env.DEV && isCardStep
			? getWrappedTeamCardDebugControls({
					activeArchetypeLabel: activeArchetype.displayLabel,
					debugControls,
					onNext: () => {
						startTransition(() => {
							setActiveArchetypeIndex((currentIndex) =>
								getWrappedArchetypeIndex(
									currentIndex + 1,
									WRAPPED_ARCHETYPE_CARD_THEMES.length,
								),
							);
						});
					},
					onPrevious: () => {
						startTransition(() => {
							setActiveArchetypeIndex((currentIndex) =>
								getWrappedArchetypeIndex(
									currentIndex - 1,
									WRAPPED_ARCHETYPE_CARD_THEMES.length,
								),
							);
						});
					},
				})
			: debugControls;

	return (
		<WrappedTeamCardOnboarding
			displayName={visibleTeamCardRow.displayName}
			footerDebugControls={footerDebugControls}
			finalFooter={
				showShareStage ? (
					false
				) : (
					<WrappedTeamCardRevealFooter
						onContinueToDashboard={() =>
							handleContinueToDashboard("wrapped_reveal_footer")
						}
						onPreviewPost={handlePreviewPost}
					/>
				)
			}
			finalStage={finalStage}
			onboardingMetrics={onboardingMetrics}
			onBackFromFirstStep={onBackFromFirstStep}
			totalSessions={visibleTeamCardRow.totalSessions}
		/>
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
