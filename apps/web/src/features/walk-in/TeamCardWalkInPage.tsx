import { useDialKit } from "dialkit";
import {
	type CSSProperties,
	type Dispatch,
	useMemo,
	useRef,
	type SetStateAction,
	useState,
} from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { toast } from "sonner";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { TeamCardWalkInOnboarding } from "@/features/walk-in/team-card-walk-in-onboarding";
import { type WalkInOnboardingMetrics } from "@/features/walk-in/walk-in-onboarding-types";
import {
	WalkInTeamCardRevealFooter,
	WalkInTeamCardRevealStage,
	WalkInTeamCardShareFooter,
	WalkInTeamCardShareStage,
} from "@/features/walk-in/walk-in-team-card-final-stages";
import {
	formatShareCardCreatedAt,
	getWrappedArchetypeIndex,
} from "@/features/walk-in/walk-in-team-card-models";
import {
	type WalkInCardTiltController,
	useWalkInCardTilt,
} from "@/features/walk-in/use-walk-in-card-tilt";
import { useWalkInTeamCardPageData } from "@/features/walk-in/use-walk-in-team-card-page-data";
import {
	type WalkInTeamMemberCardHeaderMetric,
	type WalkInTeamMemberCardStatItem,
	type WalkInTeamMemberCardStatLayerOpacities,
	type WalkInTeamMemberCardTheme,
} from "@/features/walk-in/WalkInTeamMemberCard";
import { formatCompactWholeCurrency } from "@/lib/format";
import {
	captureElement,
	copyToClipboard,
	downloadAsImage,
} from "@/lib/screenshot";
import { useMountEffect } from "@/hooks/useMountEffect";
import { markWalkInCompleted } from "@/features/walk-in/walk-in-entry";
import "@/features/walk-in/walk-in-clone.css";

interface WalkInArchetypeCardTheme {
	id: string;
	label: string;
	shellClassName: string;
	theme: WalkInTeamMemberCardTheme;
}

type FinalCardStage = "reveal" | "share";

const TEAM_CARD_SHELL_STYLE = {
	// Temporary: hide the shell grain on the big walk-in card.
	"--team-lineup-card-grain-opacity": "0",
	"--team-lineup-card-grain-size": "40px",
} as CSSProperties;

const WALK_IN_ARCHETYPE_CARD_THEMES = [
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
] as const satisfies readonly WalkInArchetypeCardTheme[];

export function TeamCardWalkInPage() {
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const { completionUserId, onboardingMetrics, statItems, visibleTeamCardRow } =
		useWalkInTeamCardPageData();
	const tiltController = useWalkInCardTilt();
	const [activeArchetypeIndex, setActiveArchetypeIndex] = useState(0);
	const [shareCardCreatedAt] = useState(() => new Date());
	const shareCardCreatedAtLabel = formatShareCardCreatedAt(shareCardCreatedAt);
	const dialValues = useDialKit("Walk-in Team Card", {
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
	const activeArchetype = WALK_IN_ARCHETYPE_CARD_THEMES[activeArchetypeIndex];
	const activeStepParam = searchParams.get("step");
	const handleContinueToDashboard = () => {
		markWalkInCompleted(completionUserId);
		navigate(appRoutes.dashboard());
	};
	const headerLeftMetric: WalkInTeamMemberCardHeaderMetric = {
		title: `${formatCompactWholeCurrency(visibleTeamCardRow.cost)} estimated spend`,
		value: formatCompactWholeCurrency(visibleTeamCardRow.cost),
	};
	const headerRightMetric: WalkInTeamMemberCardHeaderMetric = {
		title: activeArchetype.label,
		value: activeArchetype.label,
	};
	const statLayerOpacities =
		useMemo<WalkInTeamMemberCardStatLayerOpacities>(() => {
			const baseStatLayerOpacities: WalkInTeamMemberCardStatLayerOpacities = {
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
		document.body.classList.add("mymind-walk-in-body");

		return () => {
			document.body.classList.remove("mymind-walk-in-body");
		};
	});
	return (
		<TeamCardWalkInPageContent
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

function TeamCardWalkInPageContent(props: {
	activeArchetype: WalkInArchetypeCardTheme;
	headerLeftMetric: WalkInTeamMemberCardHeaderMetric;
	headerRightMetric: WalkInTeamMemberCardHeaderMetric;
	onboardingMetrics: WalkInOnboardingMetrics;
	onContinueToDashboard: () => void;
	setActiveArchetypeIndex: Dispatch<SetStateAction<number>>;
	shareCardCreatedAtLabel: string;
	shellStyle: CSSProperties;
	statItems: readonly WalkInTeamMemberCardStatItem[];
	statLayerOpacities: WalkInTeamMemberCardStatLayerOpacities;
	tiltController: WalkInCardTiltController;
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
	const shareTitle = `${visibleTeamCardRow.displayName}'s Geneva post`;
	const shareText = `${visibleTeamCardRow.displayName}'s ${activeArchetype.label} Geneva card, made with rudel.ai.`;
	const shareUrl =
		typeof window === "undefined"
			? undefined
			: new URL(appRoutes.walkInTeamCard(), window.location.origin).toString();
	const shareUrlLabel = shareUrl
		? shareUrl.replace(/^https?:\/\//u, "")
		: appRoutes.walkInTeamCard();

	async function captureSharePost() {
		const sharePostElement = sharePostRef.current;

		if (!sharePostElement) {
			toast.error("Could not find the post to share.");
			return null;
		}

		try {
			return await captureElement(sharePostElement);
		} catch {
			toast.error("Could not prepare the share image.");
			return null;
		}
	}

	async function handleSharePost() {
		const imageBlob = await captureSharePost();

		if (!imageBlob) {
			return;
		}

		const file = new File([imageBlob], "geneva-team-card-post.png", {
			type: imageBlob.type || "image/png",
		});
		const canShareFiles = (() => {
			if (!navigator.canShare) {
				return true;
			}

			try {
				return navigator.canShare({ files: [file] });
			} catch {
				return false;
			}
		})();

		if (navigator.share && canShareFiles) {
			try {
				await navigator.share({
					files: [file],
					text: shareText,
					title: shareTitle,
					...(shareUrl ? { url: shareUrl } : {}),
				});
				return;
			} catch (error) {
				if (error instanceof DOMException && error.name === "AbortError") {
					return;
				}
			}
		}

		const copied = await copyToClipboard(imageBlob);

		if (copied) {
			toast.success(
				"Post copied. Paste it into the app you want to share to.",
				{
					duration: 7000,
				},
			);
			return;
		}

		downloadAsImage(imageBlob, "geneva-team-card-post.png");
		toast.success("Post downloaded. Share the PNG from your downloads.");
	}

	async function handleCopyPost() {
		const imageBlob = await captureSharePost();

		if (!imageBlob) {
			return;
		}

		const copied = await copyToClipboard(imageBlob);

		if (copied) {
			toast.success("Post copied to clipboard");
			return;
		}

		toast.error("Could not copy the post. Try downloading it instead.");
	}

	async function handleDownloadPost() {
		const imageBlob = await captureSharePost();

		if (!imageBlob) {
			return;
		}

		downloadAsImage(imageBlob, "geneva-team-card-post.png");
		toast.success("Post downloaded");
	}

	const showShareStage = finalCardStage === "share";
	const finalStage = showShareStage ? (
		<WalkInTeamCardShareStage
			headerLeftMetric={headerLeftMetric}
			headerRightMetric={headerRightMetric}
			onBack={() => setFinalCardStage("reveal")}
			onCopy={() => void handleCopyPost()}
			onDownload={() => void handleDownloadPost()}
			onShare={() => void handleSharePost()}
			row={visibleTeamCardRow}
			shareCardCreatedAtLabel={shareCardCreatedAtLabel}
			sharePostRef={sharePostRef}
			shareUrl={shareUrl}
			shareUrlLabel={shareUrlLabel}
			shellClassName={activeArchetype.shellClassName}
			shellStyle={shellStyle}
			statItems={statItems}
			statLayerOpacities={statLayerOpacities}
			theme={activeArchetype.theme}
		/>
	) : (
		<WalkInTeamCardRevealStage
			archetypeLabel={activeArchetype.label}
			headerLeftMetric={headerLeftMetric}
			headerRightMetric={headerRightMetric}
			onNextArchetype={() =>
				setActiveArchetypeIndex((currentIndex) =>
					getWrappedArchetypeIndex(
						currentIndex + 1,
						WALK_IN_ARCHETYPE_CARD_THEMES.length,
					),
				)
			}
			onPreviousArchetype={() =>
				setActiveArchetypeIndex((currentIndex) =>
					getWrappedArchetypeIndex(
						currentIndex - 1,
						WALK_IN_ARCHETYPE_CARD_THEMES.length,
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
		<TeamCardWalkInOnboarding
			displayName={visibleTeamCardRow.displayName}
			finalFooter={
				showShareStage ? (
					<WalkInTeamCardShareFooter
						onContinueToDashboard={onContinueToDashboard}
					/>
				) : (
					<WalkInTeamCardRevealFooter
						onContinueToDashboard={onContinueToDashboard}
						onPreviewPost={() => setFinalCardStage("share")}
					/>
				)
			}
			finalStage={finalStage}
			onboardingMetrics={onboardingMetrics}
			totalSessions={visibleTeamCardRow.totalSessions}
		/>
	);
}
