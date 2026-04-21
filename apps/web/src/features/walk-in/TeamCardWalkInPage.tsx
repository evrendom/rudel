import type {
	DeveloperDetails,
	DeveloperFeatureUsage,
	DeveloperProject,
	DeveloperSession,
	DimensionAnalysisDataPoint,
	WrappedSourceSplit,
	WrappedV1,
} from "@rudel/api-routes";
import { useDialKit } from "dialkit";
import { ChevronLeft, ChevronRight, Clipboard, Download, Share2 } from "lucide-react";
import {
	type CSSProperties,
	type Dispatch,
	useMemo,
	useRef,
	type SetStateAction,
	useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import { toast } from "sonner";
import { Button } from "@/app/ui/button";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import {
	type TeamPageMemberRow,
	useTeamPageData,
} from "@/features/team/use-team-page-data";
import {
	TeamCardWalkInOnboarding,
	type WalkInOnboardingMetrics,
} from "@/features/walk-in/team-card-walk-in-onboarding";
import { useWalkInCardData } from "@/features/walk-in/use-walk-in-card-data";
import {
	type WalkInCardTiltController,
	useWalkInCardTilt,
} from "@/features/walk-in/use-walk-in-card-tilt";
import {
	WalkInTeamMemberCard,
	type WalkInTeamMemberCardHeaderMetric,
	type WalkInTeamMemberCardStatItem,
	type WalkInTeamMemberCardStatLayerOpacities,
	type WalkInTeamMemberCardTheme,
} from "@/features/walk-in/WalkInTeamMemberCard";
import { MAX_ANALYTICS_DAYS } from "@/lib/analytics-date-range";
import {
	formatCompactWholeCurrency,
	formatCompactWholeNumber,
} from "@/lib/format";
import { orpc } from "@/lib/orpc";
import {
	captureElement,
	copyToClipboard,
	downloadAsImage,
} from "@/lib/screenshot";
import { useMountEffect } from "@/hooks/useMountEffect";
import "@/features/walk-in/walk-in-clone.css";
import { authClient } from "@/lib/auth-client";

interface WalkInArchetypeCardTheme {
	id: string;
	label: string;
	shellClassName: string;
	theme: WalkInTeamMemberCardTheme;
}

interface WalkInTeamCardShellStyle extends CSSProperties {
	"--team-lineup-card-grain-opacity"?: string;
	"--team-lineup-card-grain-size"?: string;
}

type FinalCardStage = "reveal" | "share";

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

function SharePostAnthropicLogo() {
	return (
		<svg
			viewBox="0 0 1200 1200"
			aria-hidden="true"
			className="h-4 w-4 shrink-0"
		>
			<path
				fill="currentColor"
				d="M233.959793 800.214905L468.644287 668.536987L472.590637 657.100647L468.644287 650.738403L457.208069 650.738403L417.986633 648.322144L283.892639 644.69812L167.597321 639.865845L54.926208 633.825623L26.577238 627.785339L0.00033 592.751709L2.73832 575.27533L26.577238 559.248352L60.724873 562.228149L136.187973 567.382629L249.422867 575.194763L331.570496 580.026978L453.261841 592.671082L472.590637 592.671082L475.328857 584.859009L468.724915 580.026978L463.570557 575.194763L346.389313 495.785217L219.543671 411.865906L153.100723 363.543762L117.181267 339.060425L99.060455 316.107361L91.248367 266.01355L123.865784 230.093994L167.677887 233.073853L178.872513 236.053772L223.248367 270.201477L318.040283 343.570496L441.825592 434.738342L459.946411 449.798706L467.194672 444.64447L468.080597 441.020203L459.946411 427.409485L392.617493 305.718323L320.778564 181.932983L288.80542 130.630859L280.348999 99.865845C277.369171 87.221436 275.194641 76.590698 275.194641 63.624268L312.322174 13.20813L332.8591 6.604126L382.389313 13.20813L403.248352 31.328979L434.013519 101.71814L483.865753 212.537048L561.181274 363.221497L583.812134 407.919434L595.892639 449.315491L600.40271 461.959839L608.214783 461.959839L608.214783 454.711609L614.577271 369.825623L626.335632 265.61084L637.771851 131.516846L641.718201 93.745117L660.402832 48.483276L697.530334 24.000122L726.52356 37.852417L750.362549 72L747.060486 94.067139L732.886047 186.201416L705.100708 330.52356L686.979919 427.167847L697.530334 427.167847L709.61084 415.087341L758.496704 350.174561L840.644348 247.490051L876.885925 206.738342L919.167847 161.71814L946.308838 140.29541L997.61084 140.29541L1035.38269 196.429626L1018.469849 254.416199L965.637634 321.422852L921.825562 378.201538L859.006714 462.765259L819.785278 530.41626L823.409424 535.812073L832.75177 534.92627L974.657776 504.724915L1051.328979 490.872559L1142.818848 475.167786L1184.214844 494.496582L1188.724854 514.147644L1172.456421 554.335693L1074.604126 578.496765L959.838989 601.449829L788.939636 641.879272L786.845764 643.409485L789.261841 646.389343L866.255127 653.637634L899.194702 655.409424L979.812134 655.409424L1129.932861 666.604187L1169.154419 692.537109L1192.671265 724.268677L1188.724854 748.429688L1128.322144 779.194641L1046.818848 759.865845L856.590759 714.604126L791.355774 698.335754L782.335693 698.335754L782.335693 703.731567L836.69812 756.885986L936.322205 846.845581L1061.073975 962.81897L1067.436279 991.490112L1051.409424 1014.120911L1034.496704 1011.704712L924.885986 929.234924L882.604126 892.107544L786.845764 811.48999L780.483276 811.48999L780.483276 819.946289L802.550415 852.241699L919.087341 1027.409424L925.127625 1081.127686L916.671204 1098.604126L886.469849 1109.154419L853.288696 1103.114136L785.073914 1007.355835L714.684631 899.516785L657.906067 802.872498L650.979858 806.81897L617.476624 1167.704834L601.771851 1186.147705L565.530212 1200L535.328857 1177.046997L519.302124 1139.919556L535.328857 1066.550537L554.657776 970.792053L570.362488 894.68457L584.536926 800.134277L592.993347 768.724976L592.429626 766.630859L585.503479 767.516968L514.22821 865.369263L405.825531 1011.865906L320.053711 1103.677979L299.516815 1111.812256L263.919525 1093.369263L267.221497 1060.429688L287.114136 1031.114136L405.825531 880.107361L477.422913 786.52356L523.651062 732.483276L523.328918 724.671265L520.590698 724.671265L205.288605 929.395935L149.154434 936.644409L124.993355 914.01355L127.973183 876.885986L139.409409 864.80542L234.201385 799.570435L233.879227 799.8927Z"
			/>
		</svg>
	);
}

function SharePostCodexLogo() {
	return (
		<svg
			viewBox="0 0 320 320"
			aria-hidden="true"
			className="h-4 w-4 shrink-0"
		>
			<path
				fill="currentColor"
				d="M297.06 130.97c7.26-21.79 4.76-45.66-6.85-65.48-17.46-30.4-52.56-46.04-86.84-38.68-15.25-17.18-37.16-26.95-60.13-26.81-35.04-.08-66.13 22.48-76.91 55.82-22.51 4.61-41.94 18.7-53.31 38.67-17.59 30.32-13.58 68.54 9.92 94.54-7.26 21.79-4.76 45.66 6.85 65.48 17.46 30.4 52.56 46.04 86.84 38.68 15.24 17.18 37.16 26.95 60.13 26.8 35.06.09 66.16-22.49 76.94-55.86 22.51-4.61 41.94-18.7 53.31-38.67 17.57-30.32 13.55-68.51-9.94-94.51zm-120.28 168.11c-14.03.02-27.62-4.89-38.39-13.88.49-.26 1.34-.73 1.89-1.07l63.72-36.8c3.26-1.85 5.26-5.32 5.24-9.07v-89.83l26.93 15.55c.29.14.48.42.52.74v74.39c-.04 33.08-26.83 59.9-59.91 59.97zm-128.84-55.03c-7.03-12.14-9.56-26.37-7.15-40.18.47.28 1.3.79 1.89 1.13l63.72 36.8c3.23 1.89 7.23 1.89 10.47 0l77.79-44.92v31.1c.02.32-.13.63-.38.83l-64.41 37.19c-28.69 16.52-65.33 6.7-81.92-21.95zm-16.77-139.09c7-12.16 18.05-21.46 31.21-26.29 0 .55-.03 1.52-.03 2.2v73.61c-.02 3.74 1.98 7.21 5.23 9.06l77.79 44.91-26.93 15.55c-.27.18-.61.21-.91.08l-64.42-37.22c-28.63-16.58-38.45-53.21-21.95-81.89zm221.26 51.49-77.79-44.92 26.93-15.54c.27-.18.61-.21.91-.08l64.42 37.19c28.68 16.57 38.51 53.26 21.94 81.94-7.01 12.14-18.05 21.44-31.2 26.28v-75.81c.03-3.74-1.96-7.2-5.2-9.06zm26.8-40.34c-.47-.29-1.3-.79-1.89-1.13l-63.72-36.8c-3.23-1.89-7.23-1.89-10.47 0l-77.79 44.92v-31.1c-.02-.32.13-.63.38-.83l64.41-37.16c28.69-16.55 65.37-6.7 81.91 22 6.99 12.12 9.52 26.31 7.15 40.1zm-168.51 55.43-26.94-15.55c-.29-.14-.48-.42-.52-.74v-74.39c.02-33.12 26.89-59.96 60.01-59.94 14.01 0 27.57 4.92 38.34 13.88-.49.26-1.33.73-1.89 1.07l-63.72 36.8c-3.26 1.85-5.26 5.31-5.24 9.06l-.04 89.79zm14.63-31.54 34.65-20.01 34.65 20v40.01l-34.65 20-34.65-20z"
			/>
		</svg>
	);
}

export function TeamCardWalkInPage() {
	const [searchParams] = useSearchParams();
	const {
		accountLabel,
		handover,
		session,
		wrappedData,
	} = useWalkInCardData();
	const { teamMemberRows } = useTeamPageData();
	const tiltController = useWalkInCardTilt();
	const sessionUserId = getSessionUserId(session);
	const sessionUserName = getSessionUserName(session);
	const sessionUserEmail = getSessionUserEmail(session);
	const debugProfileImageSrc = handover.preview.profile.avatarSrc;
	const { data: activeMember } = authClient.useActiveMember();
	const activeMemberUserId = getActiveMemberUserId(activeMember);
	const resolvedUserId = sessionUserId ?? activeMemberUserId;
	const [activeArchetypeIndex, setActiveArchetypeIndex] = useState(0);
	const [shareCardCreatedAt] = useState(() => new Date());
	const shareCardCreatedAtLabel = useMemo(
		() => formatShareCardCreatedAt(shareCardCreatedAt),
		[shareCardCreatedAt],
	);
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
	const developerDetailsQuery = useAnalyticsQuery({
		...orpc.analytics.developers.details.queryOptions({
			input: {
				userId: resolvedUserId ?? "",
				days: MAX_ANALYTICS_DAYS,
			},
		}),
		enabled: Boolean(resolvedUserId),
	});
	const developerFeaturesQuery = useAnalyticsQuery({
		...orpc.analytics.developers.features.queryOptions({
			input: {
				userId: resolvedUserId ?? "",
				days: MAX_ANALYTICS_DAYS,
			},
		}),
		enabled: Boolean(resolvedUserId),
	});
	const developerProjectsQuery = useAnalyticsQuery({
		...orpc.analytics.developers.projects.queryOptions({
			input: {
				userId: resolvedUserId ?? "",
				days: MAX_ANALYTICS_DAYS,
			},
		}),
		enabled: Boolean(resolvedUserId),
	});
	const developerSessionsQuery = useAnalyticsQuery({
		...orpc.analytics.developers.sessions.queryOptions({
			input: {
				userId: resolvedUserId ?? "",
				days: MAX_ANALYTICS_DAYS,
				outcome: "all",
				limit: 1000,
				offset: 0,
				sortBy: "date",
				sortOrder: "desc",
			},
		}),
		enabled: Boolean(resolvedUserId),
	});
	const commitBreakdownQuery = useAnalyticsQuery({
		...orpc.analytics.sessions.dimensionAnalysis.queryOptions({
			input: {
				days: MAX_ANALYTICS_DAYS,
				dimension: "has_commit",
				limit: 4,
				metric: "session_count",
				userId: resolvedUserId ?? undefined,
			},
		}),
		enabled: Boolean(resolvedUserId),
	});
	const visibleTeamCardRow = useMemo(
		() =>
			buildResolvedTeamCardRow({
				accountLabel,
				debugProfileImageSrc,
				developerDetails: developerDetailsQuery.data,
				sessionUserEmail,
				sessionUserId: resolvedUserId,
				sessionUserName,
				teamMemberRows,
			}),
		[
			accountLabel,
			debugProfileImageSrc,
			developerDetailsQuery.data,
			sessionUserEmail,
			resolvedUserId,
			sessionUserName,
			teamMemberRows,
		],
	);
	const onboardingMetrics = useMemo(
		() =>
			buildWalkInOnboardingMetrics({
				commitBreakdown: commitBreakdownQuery.data,
				developerDetails: developerDetailsQuery.data,
				developerFeatures: developerFeaturesQuery.data,
				developerProjects: developerProjectsQuery.data,
				developerSessions: developerSessionsQuery.data,
				wrappedMetrics: wrappedData?.metrics,
			}),
		[
			commitBreakdownQuery.data,
			developerDetailsQuery.data,
			developerFeaturesQuery.data,
			developerProjectsQuery.data,
			developerSessionsQuery.data,
			wrappedData?.metrics,
		],
	);
	const activeArchetype = WALK_IN_ARCHETYPE_CARD_THEMES[activeArchetypeIndex];
	const activeStepParam = searchParams.get("step");
	const headerLeftMetric = useMemo<WalkInTeamMemberCardHeaderMetric>(
		() => ({
			title: `${formatCompactWholeCurrency(visibleTeamCardRow.cost)} estimated spend`,
			value: formatCompactWholeCurrency(visibleTeamCardRow.cost),
		}),
		[visibleTeamCardRow.cost],
	);
	const headerRightMetric = useMemo<WalkInTeamMemberCardHeaderMetric>(
		() => ({
			title: activeArchetype.label,
			value: activeArchetype.label,
		}),
		[activeArchetype],
	);
	const statItems = useMemo(
		() =>
			buildWalkInStatItems(
				visibleTeamCardRow,
				developerDetailsQuery.data?.distinct_projects ?? 0,
				wrappedData?.metrics.source_split ?? [],
			),
		[
			developerDetailsQuery.data?.distinct_projects,
			visibleTeamCardRow,
			wrappedData?.metrics.source_split,
		],
	);
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
	const shellStyle = useMemo<WalkInTeamCardShellStyle>(
		() => ({
			// Temporary: hide the shell grain on the big walk-in card.
			"--team-lineup-card-grain-opacity": "0",
			"--team-lineup-card-grain-size": "40px",
		}),
		[],
	);
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
			setActiveArchetypeIndex={setActiveArchetypeIndex}
			shareCardCreatedAtLabel={shareCardCreatedAtLabel}
			shellStyle={shellStyle}
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
	setActiveArchetypeIndex: Dispatch<SetStateAction<number>>;
	shareCardCreatedAtLabel: string;
	shellStyle: WalkInTeamCardShellStyle;
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
		setActiveArchetypeIndex,
		shareCardCreatedAtLabel,
		shellStyle,
		statItems,
		statLayerOpacities,
		tiltController,
		visibleTeamCardRow,
	} = props;
	const sharePostRef = useRef<HTMLDivElement>(null);
	const [finalCardStage, setFinalCardStage] = useState<FinalCardStage>("reveal");
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
			toast.success("Post copied. Paste it into the app you want to share to.", {
				duration: 7000,
			});
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

	const finalStage = (
		finalCardStage === "share" ? (
			<section className="flex min-h-full w-full items-center justify-center">
				<div className="flex w-full max-w-[24rem] flex-col items-center text-center">
					<p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#8f887f]">
						Post preview
					</p>
					<h1 className="mt-3 max-w-[10ch] text-balance font-[var(--app-font-heading)] text-[2.3rem] font-semibold tracking-[-0.07em] text-[#22201f] sm:text-[2.8rem]">
						Ready to share.
					</h1>
					<p className="mt-3 max-w-[28ch] text-pretty text-sm leading-6 text-[#6c6761] sm:text-[0.98rem]">
						This is the exact post that gets exported. Nothing extra gets added
						after you tap share.
					</p>

					<div
						ref={sharePostRef}
						className="mt-7 aspect-[4/5] w-full border border-black/6 bg-white shadow-[0_20px_44px_rgba(15,23,42,0.08)]"
					>
						<div className="team-lineup-surface-scope flex h-full flex-col items-center px-6 py-5">
							<div className="flex w-full items-start justify-between text-[#1a1a1a]">
								<img
									src="/assets/wordmark-dark-BeVDO32X.svg"
									alt="rudel.ai"
									className="h-4 w-auto"
								/>
								<div className="flex items-center gap-2.5">
									<SharePostAnthropicLogo />
									<SharePostCodexLogo />
								</div>
							</div>

							<div className="flex min-h-0 flex-1 items-center justify-center self-stretch">
								<div className="team-lineup-card-tilt-stage w-full max-w-[13.4rem]">
									<div className="team-lineup-card-tilt-shell [--walk-in-card-render-scale:0.92]">
										<div className="grid justify-center">
											<WalkInTeamMemberCard
												headerLeftMetric={headerLeftMetric}
												headerRightMetric={headerRightMetric}
												hideHeaderLogo
												layoutPreset="team-card-preview"
												shellClassName={activeArchetype.shellClassName}
												shellStyle={shellStyle}
												row={visibleTeamCardRow}
												mediaPanelClassName="mx-auto"
												statLayerOpacities={statLayerOpacities}
												statItems={statItems}
												statTileClassName=""
												theme={activeArchetype.theme}
											/>
										</div>
									</div>
								</div>
							</div>

							<div className="flex w-full items-center justify-between gap-3">
								<a
									href={shareUrl ?? appRoutes.walkInTeamCard()}
									className="text-[0.82rem] font-semibold tracking-[-0.02em] text-[#4a4744] underline-offset-4"
								>
									{shareUrlLabel}
								</a>
								<span className="[font-family:var(--dashboard-01-font-roster-mono)] text-[0.68rem] font-semibold tracking-[-0.01em] tabular-nums text-[#6e6862]">
									{shareCardCreatedAtLabel}
								</span>
							</div>
						</div>
					</div>

					<nav className="mt-7 flex w-full flex-col gap-3">
						<Button
							type="button"
							size="lg"
							className="min-h-11 rounded-full bg-[#4f7cff] text-white shadow-[0_16px_28px_rgba(79,124,255,0.24)] hover:bg-[#4472f4]"
							onClick={() => void handleSharePost()}
						>
							<Share2 className="size-4" />
							Share post
						</Button>
						<div className="grid grid-cols-2 gap-3">
							<Button
								type="button"
								size="lg"
								variant="outline"
								className="min-h-11 rounded-full border-black/8 bg-white/80 text-[#2a2725] hover:bg-white"
								onClick={() => void handleCopyPost()}
							>
								<Clipboard className="size-4" />
								Copy image
							</Button>
							<Button
								type="button"
								size="lg"
								variant="outline"
								className="min-h-11 rounded-full border-black/8 bg-white/80 text-[#2a2725] hover:bg-white"
								onClick={() => void handleDownloadPost()}
							>
								<Download className="size-4" />
								Download PNG
							</Button>
						</div>
					</nav>

					<button
						type="button"
						className="mt-4 min-h-11 rounded-full px-4 text-sm font-medium text-[#7b746d]"
						onClick={() => setFinalCardStage("reveal")}
					>
						Back to card
					</button>
				</div>
			</section>
		) : (
			<section className="flex min-h-full w-full items-center justify-center">
				<div className="team-lineup-surface-scope flex w-full max-w-[24rem] flex-col items-center text-center">
					<p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-[#8f887f]">
						Choose your card
					</p>
					<h1 className="mt-3 max-w-[11ch] text-balance font-[var(--app-font-heading)] text-[2.3rem] font-semibold tracking-[-0.07em] text-[#22201f] sm:text-[2.8rem]">
						Pick the one you&apos;d post.
					</h1>
					<p className="mt-3 max-w-[28ch] text-pretty text-sm leading-6 text-[#6c6761] sm:text-[0.98rem]">
						The next page turns this card into a share post. You can still come
						back and change it.
					</p>

					<div className="mt-7 flex h-[27rem] w-full items-center justify-center min-[360px]:h-[29rem] sm:h-[35rem]">
						<div className="team-lineup-card-tilt-stage w-full max-w-[17rem] min-[360px]:max-w-[18rem] sm:max-w-none">
							<div
								ref={tiltController.cardTiltRef}
								className="team-lineup-card-tilt-shell [--walk-in-card-render-scale:1.1] min-[360px]:[--walk-in-card-render-scale:1.2] sm:[--walk-in-card-render-scale:1.5] lg:[--walk-in-card-render-scale:1.64]"
								onPointerMove={tiltController.handlePointerMove}
								onPointerLeave={tiltController.handlePointerLeave}
								onPointerCancel={tiltController.handlePointerLeave}
							>
								<div className="grid justify-center">
									<WalkInTeamMemberCard
										headerLeftMetric={headerLeftMetric}
										headerRightMetric={headerRightMetric}
										layoutPreset="team-card-preview"
										shellClassName={activeArchetype.shellClassName}
										shellStyle={shellStyle}
										row={visibleTeamCardRow}
										mediaPanelClassName="mx-auto"
										statLayerOpacities={statLayerOpacities}
										statItems={statItems}
										statTileClassName=""
										theme={activeArchetype.theme}
									/>
								</div>
							</div>
						</div>
					</div>

					<div className="mt-3 grid w-full max-w-[18.5rem] grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 rounded-full border border-black/6 bg-white/82 p-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.06)]">
						<Button
							type="button"
							variant="outline"
							size="icon-sm"
							className="min-h-11 rounded-full border-transparent bg-transparent text-[#4a4744] shadow-none hover:bg-black/4"
							onClick={() =>
								setActiveArchetypeIndex((currentIndex) =>
									getWrappedArchetypeIndex(
										currentIndex - 1,
										WALK_IN_ARCHETYPE_CARD_THEMES.length,
									),
								)
							}
						>
							<ChevronLeft />
						</Button>

						<div className="min-w-0 rounded-full bg-[#f7f3ee] px-4 py-2.5 text-center">
							<div className="text-[0.66rem] font-semibold leading-none tracking-[0.14em] text-[#9b938b] uppercase">
								Archetype
							</div>
							<div className="mt-1 truncate text-sm font-semibold leading-none tracking-[-0.03em] text-[#302d2b]">
								{activeArchetype.label}
							</div>
						</div>

						<Button
							type="button"
							variant="outline"
							size="icon-sm"
							className="min-h-11 rounded-full border-transparent bg-transparent text-[#4a4744] shadow-none hover:bg-black/4"
							onClick={() =>
								setActiveArchetypeIndex((currentIndex) =>
									getWrappedArchetypeIndex(
										currentIndex + 1,
										WALK_IN_ARCHETYPE_CARD_THEMES.length,
									),
								)
							}
						>
							<ChevronRight />
						</Button>
					</div>
				</div>
			</section>
		)
	);

	return (
		<TeamCardWalkInOnboarding
			displayName={visibleTeamCardRow.displayName}
			finalFooter={
				finalCardStage === "reveal" ? (
					<div className="mymind-walk-in-action-stack">
						<Button
							type="button"
							className="mymind-walk-in-primary-action h-11 rounded-full bg-[#4f7cff] px-7 text-[19px] font-bold text-white shadow-[0_16px_28px_rgba(79,124,255,0.24)] hover:bg-[#4472f4] [font-family:'Nunito',var(--font-sans)]"
							onClick={() => setFinalCardStage("share")}
						>
							<span>Preview post</span>
							<span className="mymind-walk-in-primary-action__icon">
								<ChevronRight className="size-4" />
							</span>
						</Button>
					</div>
				) : undefined
			}
			finalStage={finalStage}
			onboardingMetrics={onboardingMetrics}
			totalSessions={visibleTeamCardRow.totalSessions}
		/>
	);
}

function buildResolvedTeamCardRow(params: {
	accountLabel: string;
	debugProfileImageSrc: string;
	developerDetails: DeveloperDetails | undefined;
	sessionUserEmail: string | undefined;
	sessionUserId: string | undefined;
	sessionUserName: string | undefined;
	teamMemberRows: readonly TeamPageMemberRow[];
}): TeamPageMemberRow {
	const {
		accountLabel,
		debugProfileImageSrc,
		developerDetails,
		sessionUserEmail,
		sessionUserId,
		sessionUserName,
		teamMemberRows,
	} = params;
	const currentUserRow = findCurrentUserRow({
		sessionUserEmail,
		sessionUserId,
		teamMemberRows,
	});
	const { displayName } = resolveTeamCardDisplayName({
		accountLabel,
		currentUserRow,
		sessionUserEmail,
		sessionUserName,
	});
	const email = currentUserRow?.email ?? sessionUserEmail ?? null;

	if (developerDetails && sessionUserId) {
		return {
			activeDays: developerDetails.active_days,
			cost: developerDetails.cost,
			displayName,
			email,
			favoriteModel: developerDetails.favorite_model,
			hasActivity:
				developerDetails.total_sessions > 0 ||
				developerDetails.active_days > 0 ||
				developerDetails.total_tokens > 0,
			imageUrl: debugProfileImageSrc,
			inputTokens: developerDetails.input_tokens,
			lastActiveDate: developerDetails.last_active_date,
			outputTokens: developerDetails.output_tokens,
			role: currentUserRow?.role ?? "Tracked collaborator",
			totalSessions: developerDetails.total_sessions,
			totalTokens: developerDetails.total_tokens,
			userId: sessionUserId,
		};
	}

	if (currentUserRow) {
		return {
			...currentUserRow,
			imageUrl: debugProfileImageSrc,
		};
	}

	return {
		activeDays: 0,
		cost: 0,
		displayName,
		email,
		favoriteModel: null,
		hasActivity: false,
		imageUrl: debugProfileImageSrc,
		inputTokens: 0,
		lastActiveDate: null,
		outputTokens: 0,
		role: "Tracked collaborator",
		totalSessions: 0,
		totalTokens: 0,
		userId: sessionUserId ?? "walk-in-preview",
	};
}

function findCurrentUserRow(input: {
	sessionUserEmail: string | undefined;
	sessionUserId: string | undefined;
	teamMemberRows: readonly TeamPageMemberRow[];
}) {
	const { sessionUserEmail, sessionUserId, teamMemberRows } = input;
	const normalizedSessionEmail = normalizeEmail(sessionUserEmail);

	return teamMemberRows.find((row) => {
		if (sessionUserId && row.userId === sessionUserId) {
			return true;
		}

		return (
			Boolean(normalizedSessionEmail) &&
			normalizeEmail(row.email) === normalizedSessionEmail
		);
	});
}

function resolveTeamCardDisplayName(input: {
	accountLabel: string;
	currentUserRow: TeamPageMemberRow | undefined;
	sessionUserEmail: string | undefined;
	sessionUserName: string | undefined;
}) {
	const { accountLabel, currentUserRow, sessionUserEmail, sessionUserName } =
		input;
	const meaningfulSessionUserName = getMeaningfulDisplayName(sessionUserName);

	if (meaningfulSessionUserName) {
		return {
			displayName: meaningfulSessionUserName,
			source: "session.name",
		} as const;
	}

	const emailHandle = getEmailHandle(sessionUserEmail);

	if (emailHandle) {
		return {
			displayName: emailHandle,
			source: "session.emailHandle",
		} as const;
	}

	const meaningfulCurrentUserDisplayName = getMeaningfulDisplayName(
		currentUserRow?.displayName,
	);

	if (meaningfulCurrentUserDisplayName) {
		return {
			displayName: meaningfulCurrentUserDisplayName,
			source: "teamRow.displayName",
		} as const;
	}

	return {
		displayName: getFallbackTeamMemberDisplayName(accountLabel),
		source: "accountLabelFallback",
	} as const;
}

function buildWalkInStatItems(
	row: TeamPageMemberRow,
	distinctProjectCount: number,
	sourceSplit: readonly WrappedSourceSplit[],
): WalkInTeamMemberCardStatItem[] {
	const normalizedSourceSplit = normalizeSourceSplit(sourceSplit);

	return [
		{
			key: "codex-share",
			title: `${normalizedSourceSplit.codexShare}% of wrapped sessions came from Codex`,
			icon: "codex",
			value: `${normalizedSourceSplit.codexShare}%`,
		},
		{
			key: "claude-share",
			title: `${normalizedSourceSplit.claudeShare}% of wrapped sessions came from Claude Code`,
			icon: "claude",
			value: `${normalizedSourceSplit.claudeShare}%`,
		},
		{
			key: "sessions",
			label: "SESS",
			title: `${row.totalSessions.toLocaleString()} sessions`,
			value: row.totalSessions.toLocaleString(),
		},
		{
			key: "days",
			label: "DAYS",
			title: `${row.activeDays.toLocaleString()} active days across ${MAX_ANALYTICS_DAYS.toLocaleString()} tracked days`,
			value: row.activeDays.toLocaleString(),
		},
		{
			key: "tokens",
			label: "TOK",
			title: `${row.totalTokens.toLocaleString()} total tokens`,
			value: formatCompactWholeNumber(row.totalTokens),
		},
		{
			key: "repos",
			label: "REPOS",
			title: `${distinctProjectCount.toLocaleString()} distinct tracked projects`,
			value: distinctProjectCount.toLocaleString(),
		},
	];
}

function buildWalkInOnboardingMetrics(input: {
	commitBreakdown: readonly DimensionAnalysisDataPoint[] | undefined;
	developerDetails: DeveloperDetails | undefined;
	developerFeatures: DeveloperFeatureUsage | undefined;
	developerProjects: readonly DeveloperProject[] | undefined;
	developerSessions: readonly DeveloperSession[] | undefined;
	wrappedMetrics: WrappedV1["metrics"] | undefined;
}): WalkInOnboardingMetrics {
	const {
		commitBreakdown,
		developerDetails,
		developerFeatures,
		developerProjects,
		developerSessions,
		wrappedMetrics,
	} = input;
	const totalSessions = developerDetails?.total_sessions ?? 0;
	const commitSessions = findBooleanDimensionCount(commitBreakdown, true);
	const topProject = findTopProject(developerProjects);
	const repoPulse = buildRepoPulse(developerSessions);

	return {
		activeDays:
			wrappedMetrics?.active_days ?? developerDetails?.active_days ?? 0,
		avgSessionMin: developerDetails?.avg_session_duration_min ?? null,
		commitRate:
			totalSessions > 0 ? (commitSessions / totalSessions) * 100 : null,
		daysSinceFirst: wrappedMetrics?.days_since_first_session ?? 0,
		favoriteModel: formatWalkInLabel(
			wrappedMetrics?.favorite_model ??
				developerDetails?.favorite_model ??
				undefined,
		),
		longestSessionMin: wrappedMetrics?.longest_session_min ?? null,
		modelByMonth: wrappedMetrics?.model_by_month ?? [],
		sourceSplit: wrappedMetrics?.source_split ?? [],
		repoPulse,
		skillsAdoptionRate: developerFeatures?.skills_adoption_rate ?? null,
		slashCommandsAdoptionRate:
			developerFeatures?.slash_commands_adoption_rate ?? null,
		subagentsAdoptionRate: developerFeatures?.subagents_adoption_rate ?? null,
		successRate: developerDetails?.success_rate ?? null,
		topProjectName: getProjectDisplayName(topProject),
		topProjectSessions: topProject?.sessions ?? 0,
		topProjectTokens: topProject?.total_tokens ?? 0,
		topSkills:
			developerFeatures?.top_skills
				.map((skill) => ({
					count: skill.count,
					name: formatWalkInLabel(skill.name),
				}))
				.filter(
					(
						skill,
					): skill is {
						count: number;
						name: string;
					} => Boolean(skill.name),
				) ?? [],
		topSlashCommand: formatWalkInLabel(
			developerFeatures?.top_slash_commands[0]?.name,
		),
		topSlashCommands:
			developerFeatures?.top_slash_commands
				.map((command) => ({
					count: command.count,
					name: formatWalkInLabel(command.name),
				}))
				.filter(
					(
						command,
					): command is {
						count: number;
						name: string;
					} => Boolean(command.name),
				) ?? [],
		topSlashCommandCount: developerFeatures?.top_slash_commands[0]?.count ?? null,
		topSubagent: formatWalkInLabel(developerFeatures?.top_subagents[0]?.name),
		topSubagents:
			developerFeatures?.top_subagents
				.map((subagent) => ({
					count: subagent.count,
					name: formatWalkInLabel(subagent.name),
				}))
				.filter(
					(
						subagent,
					): subagent is {
						count: number;
						name: string;
					} => Boolean(subagent.name),
				) ?? [],
		topSubagentCount: developerFeatures?.top_subagents[0]?.count ?? null,
		totalSessions,
		totalTokens:
			wrappedMetrics?.total_tokens ?? developerDetails?.total_tokens ?? 0,
	};
}

function getSessionUserId(
	session: ReturnType<typeof useWalkInCardData>["session"],
) {
	return session?.user &&
		"id" in session.user &&
		typeof session.user.id === "string"
		? session.user.id
		: undefined;
}

function getActiveMemberUserId(
	activeMember: ReturnType<typeof authClient.useActiveMember>["data"],
) {
	return activeMember &&
		"userId" in activeMember &&
		typeof activeMember.userId === "string"
		? activeMember.userId
		: undefined;
}

function getFallbackTeamMemberDisplayName(accountLabel: string): string {
	if (accountLabel.includes("@")) {
		return accountLabel.split("@")[0] || "User";
	}

	return accountLabel || "User";
}

function getEmailHandle(email: string | undefined) {
	if (!email) {
		return undefined;
	}

	const [emailHandle] = email.split("@");
	return emailHandle?.trim() || undefined;
}

function normalizeEmail(email: string | null | undefined) {
	return email?.trim().toLowerCase() || undefined;
}

function getMeaningfulDisplayName(value: string | undefined) {
	const normalizedValue = value?.trim();

	if (!normalizedValue) {
		return undefined;
	}

	if (
		normalizedValue.toLowerCase() === "operator" ||
		normalizedValue.toLowerCase() === "unknown teammate"
	) {
		return undefined;
	}

	return normalizedValue;
}

function getSessionUserName(
	session: ReturnType<typeof useWalkInCardData>["session"],
) {
	return session?.user &&
		"name" in session.user &&
		typeof session.user.name === "string"
		? session.user.name
		: undefined;
}

function getSessionUserEmail(
	session: ReturnType<typeof useWalkInCardData>["session"],
) {
	return session?.user &&
		"email" in session.user &&
		typeof session.user.email === "string"
		? session.user.email
		: undefined;
}

function getWrappedArchetypeIndex(index: number, count: number) {
	return ((index % count) + count) % count;
}

function normalizeSourceSplit(sourceSplit: readonly WrappedSourceSplit[]) {
	return {
		claudeShare: Math.round(getSourceSharePercent(sourceSplit, "claude_code")),
		codexShare: Math.round(getSourceSharePercent(sourceSplit, "codex")),
	};
}

function formatShareCardCreatedAt(date: Date) {
	return new Intl.DateTimeFormat("en-US", {
		month: "2-digit",
		day: "2-digit",
		year: "numeric",
	}).format(date);
}

function getSourceSharePercent(
	sourceSplit: readonly WrappedSourceSplit[],
	source: WrappedSourceSplit["source"],
) {
	return (
		sourceSplit.find((sourceEntry) => sourceEntry.source === source)
			?.session_share_percent ?? 0
	);
}

function formatWalkInLabel(value: string | undefined) {
	const trimmedValue = value?.trim();

	if (!trimmedValue) {
		return null;
	}

	return trimmedValue
		.replaceAll(/[_-]+/g, " ")
		.replaceAll(/\s+/g, " ")
		.trim()
		.replaceAll(/\b\w/g, (character) => character.toUpperCase());
}

function getMetricValue(row: DimensionAnalysisDataPoint) {
	return Number(row.metric_value) || 0;
}

function findBooleanDimensionCount(
	rows: readonly DimensionAnalysisDataPoint[] | undefined,
	target: boolean,
) {
	const match = rows?.find((row) => {
		const normalizedValue = row.dimension_value.trim().toLowerCase();
		return target
			? normalizedValue === "true" || normalizedValue === "1"
			: normalizedValue === "false" || normalizedValue === "0";
	});

	return match ? getMetricValue(match) : 0;
}

function findTopProject(projects: readonly DeveloperProject[] | undefined) {
	return [...(projects ?? [])].sort(
		(leftRow, rightRow) =>
			rightRow.total_tokens - leftRow.total_tokens ||
			rightRow.sessions - leftRow.sessions ||
			leftRow.project_path.localeCompare(rightRow.project_path),
	)[0];
}

function buildRepoPulse(
	sessions: readonly DeveloperSession[] | undefined,
): WalkInOnboardingMetrics["repoPulse"] {
	const repoStats = new Map<
		string,
		{
			errorSessions: number;
			repoName: string;
			sessionCount: number;
			skillSessions: number;
			slashSessions: number;
			subagentSessions: number;
			successSessions: number;
			totalDurationMin: number;
			totalTokens: number;
		}
	>();

	for (const session of sessions ?? []) {
		const repoKey = getRepoPulseProjectKey(session);
		const repoLabel = getProjectDisplayName(session);

		if (!repoLabel) {
			continue;
		}

		const existingStats = repoStats.get(repoKey);
		repoStats.set(repoKey, {
			errorSessions:
				(existingStats?.errorSessions ?? 0) + Number(session.has_errors),
			repoName: repoLabel,
			sessionCount: (existingStats?.sessionCount ?? 0) + 1,
			skillSessions:
				(existingStats?.skillSessions ?? 0) + Number(session.has_skills),
			slashSessions:
				(existingStats?.slashSessions ?? 0) + Number(session.has_slash_commands),
			subagentSessions:
				(existingStats?.subagentSessions ?? 0) + Number(session.has_subagents),
			successSessions:
				(existingStats?.successSessions ?? 0) + Number(session.likely_success),
			totalDurationMin:
				(existingStats?.totalDurationMin ?? 0) + session.duration_min,
			totalTokens: (existingStats?.totalTokens ?? 0) + session.total_tokens,
		});
	}

	if (repoStats.size === 0) {
		return {
			entries: [],
			leadRepoName: null,
			totalRepos: 0,
			totalSessions: 0,
		};
	}

	const rankedRepos = [...repoStats.entries()].sort(
		(leftEntry, rightEntry) =>
			rightEntry[1].sessionCount - leftEntry[1].sessionCount ||
			rightEntry[1].totalTokens - leftEntry[1].totalTokens ||
			rightEntry[1].totalDurationMin - leftEntry[1].totalDurationMin ||
			leftEntry[1].repoName.localeCompare(rightEntry[1].repoName),
	);
	const entries = rankedRepos.slice(0, 3).map(([repoKey, stats]) => {
		const workType = resolveRepoPulseWorkType(stats);

		return {
			id: `repo-pulse-${repoKey}`,
			meta: buildRepoPulseMeta(stats),
			proof: workType.proof,
			repoName: stats.repoName,
			workType: workType.label,
		};
	});
	const totalSessions = rankedRepos.reduce(
		(sum, [, stats]) => sum + stats.sessionCount,
		0,
	);

	return {
		entries,
		leadRepoName: entries[0]?.repoName ?? null,
		totalRepos: rankedRepos.length,
		totalSessions,
	};
}

function getRepoPulseProjectKey(project: {
	git_remote?: string;
	package_name?: string;
	project_path: string;
}) {
	return (
		project.project_path ??
		project.git_remote ??
		getProjectDisplayName(project) ??
		"unknown-project"
	);
}

function getProjectDisplayName(
	project:
		| {
				git_remote?: string;
				package_name?: string;
				project_path: string;
		  }
		| undefined,
) {
	if (!project) {
		return null;
	}

	const packageName = project.package_name?.trim();

	if (packageName) {
		return packageName;
	}

	const remoteName = project.git_remote?.split("/").pop()?.trim();

	if (remoteName) {
		return remoteName.replace(/\.git$/i, "");
	}

	const projectPath = project.project_path?.trim();

	return projectPath || null;
}

function resolveRepoPulseWorkType(stats: {
	errorSessions: number;
	sessionCount: number;
	skillSessions: number;
	slashSessions: number;
	subagentSessions: number;
	successSessions: number;
	totalDurationMin: number;
	totalTokens: number;
}) {
	const avgDurationMin = stats.totalDurationMin / stats.sessionCount;
	const avgTokens = stats.totalTokens / stats.sessionCount;
	const skillRate = (stats.skillSessions / stats.sessionCount) * 100;
	const slashRate = (stats.slashSessions / stats.sessionCount) * 100;
	const subagentRate = (stats.subagentSessions / stats.sessionCount) * 100;
	const successRate = (stats.successSessions / stats.sessionCount) * 100;

	if (subagentRate >= 25) {
		return {
			label: "Delegating",
			proof: `${Math.round(subagentRate)}% used subagents`,
		};
	}

	if (skillRate >= 28) {
		return {
			label: "Skills-heavy",
			proof: `${Math.round(skillRate)}% used skills`,
		};
	}

	if (slashRate >= 28) {
		return {
			label: "Command-heavy",
			proof: `${Math.round(slashRate)}% used slash commands`,
		};
	}

	if (avgDurationMin >= 45) {
		return {
			label: "Deep work",
			proof: `${formatDurationMinutesShort(avgDurationMin)} avg session`,
		};
	}

	if (avgTokens >= 45_000) {
		return {
			label: "Heavy lift",
			proof: `${formatCompactWholeNumber(Math.round(avgTokens))} tokens / session`,
		};
	}

	if (successRate >= 78) {
		return {
			label: "Shipping lane",
			proof: `${Math.round(successRate)}% likely successful`,
		};
	}

	return {
		label: avgDurationMin <= 18 ? "Quick passes" : "Steady work",
		proof:
			avgDurationMin <= 18
				? `${formatDurationMinutesShort(avgDurationMin)} avg session`
				: `${Math.round(successRate)}% likely successful`,
	};
}

function buildRepoPulseMeta(stats: {
	sessionCount: number;
	totalDurationMin: number;
	totalTokens: number;
}) {
	return `${stats.sessionCount.toLocaleString()} sessions · ${formatDurationMinutesShort(stats.totalDurationMin)} total`;
}

function formatDurationMinutesShort(totalDurationMin: number) {
	if (totalDurationMin < 60) {
		return `${Math.round(totalDurationMin)}m`;
	}

	const hours = Math.floor(totalDurationMin / 60);
	const minutes = Math.round(totalDurationMin - hours * 60);

	if (minutes === 0) {
		return `${hours}h`;
	}

	return `${hours}h ${minutes}m`;
}
