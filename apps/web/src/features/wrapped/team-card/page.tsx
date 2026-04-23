import { WRAPPED_SHARE_PAYLOAD_VERSION } from "@rudel/api-routes";
import { useDialKit } from "dialkit";
import {
	type CSSProperties,
	type Dispatch,
	type SetStateAction,
	useMemo,
	useRef,
	useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { appRoutes } from "@/app/routes";
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
	WrappedTeamCardShareFooter,
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

export function WrappedTeamCardPage() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { trackUtilityUsed } = useAnalyticsTracking({
		pageName: "wrapped_team_card",
	});
	const { completionUserId, onboardingMetrics, statItems, visibleTeamCardRow } =
		useWrappedTeamCardPageData();
	const tiltController = useWrappedCardTilt();
	// This index is only local card-carousel state for the Saturday launch. It is
	// not a classifier result. The actual computed-archetype path is tracked
	// separately in the beat contract and will come from the snapshot pipeline.
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
	const activeArchetype = WRAPPED_ARCHETYPE_CARD_THEMES[activeArchetypeIndex];
	const activeStepParam = searchParams.get("step");
	const handleContinueToDashboard = () => {
		markWrappedCompleted(completionUserId);
		navigate(appRoutes.dashboard());
	};
	const headerLeftMetric: WrappedTeamMemberCardHeaderMetric = {
		title: `${formatCompactWholeCurrency(visibleTeamCardRow.cost)} estimated spend`,
		value: formatCompactWholeCurrency(visibleTeamCardRow.cost),
	};
	const headerRightMetric: WrappedTeamMemberCardHeaderMetric = {
		// The card shows product-facing labels here, not raw classifier names.
		// Example: the taxonomy says "NPC", while the visible card says
		// "Smooth Operator".
		title: activeArchetype.displayLabel,
		value: activeArchetype.displayLabel,
	};
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
			headerLeftMetric={headerLeftMetric}
			headerRightMetric={headerRightMetric}
			onboardingMetrics={onboardingMetrics}
			onContinueToDashboard={handleContinueToDashboard}
			setActiveArchetypeIndex={setActiveArchetypeIndex}
			shareCardCreatedAtLabel={shareCardCreatedAtLabel}
			shellStyle={TEAM_CARD_SHELL_STYLE}
			statItems={statItems}
			statLayerOpacities={statLayerOpacities}
			tiltController={tiltController}
			visibleTeamCardRow={visibleTeamCardRow}
		/>
	);
}

function WrappedTeamCardPageContent(props: {
	activeArchetype: WrappedArchetypeCardTheme;
	headerLeftMetric: WrappedTeamMemberCardHeaderMetric;
	headerRightMetric: WrappedTeamMemberCardHeaderMetric;
	onboardingMetrics: WrappedOnboardingMetrics;
	onContinueToDashboard: () => void;
	setActiveArchetypeIndex: Dispatch<SetStateAction<number>>;
	shareCardCreatedAtLabel: string;
	shellStyle: CSSProperties;
	statItems: readonly WrappedTeamMemberCardStatItem[];
	statLayerOpacities: WrappedTeamMemberCardStatLayerOpacities;
	tiltController: WrappedCardTiltController;
	visibleTeamCardRow: TeamPageMemberRow;
}) {
	const {
		activeArchetype,
		headerLeftMetric,
		headerRightMetric,
		onboardingMetrics,
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
	const { trackNavigation, trackUtilityUsed } = useAnalyticsTracking({
		pageName: "wrapped_team_card",
	});
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
		setFinalCardStage("share");
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
			onBack={() => setFinalCardStage("reveal")}
			onCopy={() => void shareActions.handleCopyPost()}
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
			selectedThemeLabel={activeArchetype.displayLabel}
			headerLeftMetric={headerLeftMetric}
			headerRightMetric={headerRightMetric}
			onNextArchetype={() =>
				setActiveArchetypeIndex((currentIndex) =>
					getWrappedArchetypeIndex(
						currentIndex + 1,
						WRAPPED_ARCHETYPE_CARD_THEMES.length,
					),
				)
			}
			onPreviousArchetype={() =>
				setActiveArchetypeIndex((currentIndex) =>
					getWrappedArchetypeIndex(
						currentIndex - 1,
						WRAPPED_ARCHETYPE_CARD_THEMES.length,
					),
				)
			}
			row={visibleTeamCardRow}
			shellClassName={activeArchetype.shellClassName}
			shellStyle={shellStyle}
			statItems={statItems}
			statLayerOpacities={statLayerOpacities}
			theme={activeArchetype.theme}
			tiltController={tiltController}
		/>
	);

	return (
		<WrappedTeamCardOnboarding
			displayName={visibleTeamCardRow.displayName}
			finalFooter={
				showShareStage ? (
					<WrappedTeamCardShareFooter
						onContinueToDashboard={() =>
							handleContinueToDashboard("wrapped_share_footer")
						}
					/>
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
			totalSessions={visibleTeamCardRow.totalSessions}
		/>
	);
}
