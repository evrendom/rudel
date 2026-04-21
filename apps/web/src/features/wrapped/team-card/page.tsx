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
import type {
	WrappedTeamMemberCardHeaderMetric,
	WrappedTeamMemberCardStatItem,
	WrappedTeamMemberCardStatLayerOpacities,
	WrappedTeamMemberCardTheme,
} from "./card";
import {
	WrappedTeamCardRevealFooter,
	WrappedTeamCardRevealStage,
	WrappedTeamCardShareFooter,
	WrappedTeamCardShareStage,
} from "./final-stages";
import { createWrappedTeamCardShareActions } from "./share";
import { buildWrappedShareSnapshot } from "./share-snapshot";
import {
	useWrappedCardTilt,
	type WrappedCardTiltController,
} from "./tilt/use-card-tilt";
import { useWrappedTeamCardPageData } from "./use-page-data";
import { useWrappedTeamCardShare } from "./use-share";
import { formatShareCardCreatedAt, getWrappedArchetypeIndex } from "./utils";
import "@/features/wrapped/wrapped.css";

interface WrappedArchetypeCardTheme {
	id: string;
	label: string;
	shellClassName: string;
	theme: WrappedTeamMemberCardTheme;
}

type FinalCardStage = "reveal" | "share";

const TEAM_CARD_SHELL_STYLE = {
	// Temporary: hide the shell grain on the big wrapped card.
	"--team-lineup-card-grain-opacity": "0",
	"--team-lineup-card-grain-size": "40px",
} as CSSProperties;

const WRAPPED_ARCHETYPE_CARD_THEMES = [
	{
		id: "roadrunner",
		label: "Roadrunner",
		shellClassName:
			"bg-[linear-gradient(161.01deg,_#28D0FF_4.98%,_#FFCA0D_99.99%)]",
		theme: "light",
	},
	{
		id: "hit-and-runner",
		label: "Hit and Runner",
		shellClassName:
			"bg-[linear-gradient(180deg,_#EE9BEB_0%,_#F29BBB_44.71%,_#EFB09C_100%)]",
		theme: "light",
	},
	{
		id: "adhd",
		label: "ADHD",
		shellClassName:
			"bg-[linear-gradient(180deg,_#FF7567_0%,_#F8D558_48.08%,_#A4F554_100%)]",
		theme: "light",
	},
	{
		id: "window-shopper",
		label: "Cheapskate",
		shellClassName: "bg-[linear-gradient(180deg,_#00E4E7_0%,_#00EAAE_100%)]",
		theme: "light",
	},
	{
		id: "papas-credit-card",
		label: "Company Card",
		shellClassName: "bg-[linear-gradient(180deg,_#E5F221_0%,_#DFEC1C_100%)]",
		theme: "light",
	},
	{
		id: "decimal",
		label: "Decimal",
		shellClassName:
			"bg-[linear-gradient(180deg,_#F7E08B_0%,_#D4AF37_42%,_#9C7415_100%)]",
		theme: "light",
	},
	{
		id: "tourist",
		label: "Tourist",
		shellClassName:
			"bg-[linear-gradient(180deg,_#39E5E7_0%,_#35E895_50.96%,_#7AE762_100%)]",
		theme: "light",
	},
	{
		id: "npc",
		label: "Smooth Operator",
		shellClassName: "bg-[linear-gradient(180deg,_#8ED9F8_0%,_#69B8D9_100%)]",
		theme: "light",
	},
	{
		id: "needs-to-touch-grass",
		label: "Obsessed",
		shellClassName:
			"border-white/10 bg-[linear-gradient(180deg,_#191919_0%,_#000000_100%)]",
		theme: "dark",
	},
	{
		id: "maniac",
		label: "Maniac",
		shellClassName:
			"bg-[linear-gradient(180deg,_#F05267_0%,_#F05267_50%,_#F8D558_100%)]",
		theme: "light",
	},
] as const satisfies readonly WrappedArchetypeCardTheme[];

export function WrappedTeamCardPage() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { trackUtilityUsed } = useAnalyticsTracking({
		pageName: "wrapped_team_card",
	});
	const { completionUserId, onboardingMetrics, statItems, visibleTeamCardRow } =
		useWrappedTeamCardPageData();
	const tiltController = useWrappedCardTilt();
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
		title: activeArchetype.label,
		value: activeArchetype.label,
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
	const shareSnapshot = useMemo(
		() =>
			buildWrappedShareSnapshot({
				archetypeLabel: activeArchetype.label,
				headerLeftMetric,
				headerRightMetric,
				row: visibleTeamCardRow,
				shellClassName: activeArchetype.shellClassName,
				statItems,
				theme: activeArchetype.theme,
			}),
		[
			activeArchetype.label,
			activeArchetype.shellClassName,
			activeArchetype.theme,
			headerLeftMetric,
			headerRightMetric,
			statItems,
			visibleTeamCardRow,
		],
	);
	const { ensureShare, shareUrl, shareUrlLabel } =
		useWrappedTeamCardShare(shareSnapshot);
	const shareActions = createWrappedTeamCardShareActions({
		archetypeLabel: activeArchetype.label,
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
				appRoutes.wrappedShare(shareRecord.id),
				window.location.origin,
			).toString();
		},
		shareUrl,
		shareUrlLabel,
		sharePostRef,
	});

	function handlePreviewPost() {
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
			row={visibleTeamCardRow}
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
			archetypeLabel={activeArchetype.label}
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
