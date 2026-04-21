import type {
	DeveloperDetails,
	DeveloperFeatureUsage,
	DeveloperProject,
	DimensionAnalysisDataPoint,
	WrappedSourceSplit,
	WrappedV1,
} from "@rudel/api-routes";
import { useDialKit } from "dialkit";
import { ChevronLeft, ChevronRight, Clipboard, Download, Share2 } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
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
import { useWalkInCardTilt } from "@/features/walk-in/use-walk-in-card-tilt";
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
	const sharePostRef = useRef<HTMLDivElement>(null);
	const sessionUserId = getSessionUserId(session);
	const sessionUserName = getSessionUserName(session);
	const sessionUserEmail = getSessionUserEmail(session);
	const debugProfileImageSrc = handover.preview.profile.avatarSrc;
	const { data: activeMember } = authClient.useActiveMember();
	const activeMemberUserId = getActiveMemberUserId(activeMember);
	const resolvedUserId = sessionUserId ?? activeMemberUserId;
	const [activeArchetypeIndex, setActiveArchetypeIndex] = useState(0);
	const [finalCardStage, setFinalCardStage] = useState<FinalCardStage>("reveal");
	const [preparedSharePostBlob, setPreparedSharePostBlob] = useState<Blob | null>(
		null,
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
				wrappedMetrics: wrappedData?.metrics,
			}),
		[
			commitBreakdownQuery.data,
			developerDetailsQuery.data,
			developerFeaturesQuery.data,
			developerProjectsQuery.data,
			wrappedData?.metrics,
		],
	);
	const currentUserRow = useMemo(
		() =>
			findCurrentUserRow({
				sessionUserEmail,
				sessionUserId: resolvedUserId,
				teamMemberRows,
			}),
		[sessionUserEmail, resolvedUserId, teamMemberRows],
	);
	const resolvedDisplayNameDebug = useMemo(
		() =>
			resolveTeamCardDisplayName({
				accountLabel,
				currentUserRow,
				sessionUserEmail,
				sessionUserName,
			}),
		[accountLabel, currentUserRow, sessionUserEmail, sessionUserName],
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
	useEffect(() => {
		document.body.classList.add("mymind-walk-in-body");

		return () => {
			document.body.classList.remove("mymind-walk-in-body");
		};
	}, []);
	useEffect(() => {
		console.groupCollapsed("[walk-in-team-card] name debug");
		console.info("session", {
			email: sessionUserEmail ?? null,
			id: sessionUserId ?? null,
			name: sessionUserName ?? null,
		});
		console.info("activeMember", {
			userId: activeMemberUserId ?? null,
		});
		console.info("matchedTeamRow", {
			displayName: currentUserRow?.displayName ?? null,
			email: currentUserRow?.email ?? null,
			userId: currentUserRow?.userId ?? null,
		});
		console.info("resolvedDisplayName", resolvedDisplayNameDebug);
		console.info("renderedRowDisplayName", visibleTeamCardRow.displayName);
		console.groupEnd();
	}, [
		currentUserRow?.displayName,
		currentUserRow?.email,
		currentUserRow?.userId,
		resolvedDisplayNameDebug,
		activeMemberUserId,
		sessionUserEmail,
		sessionUserId,
		sessionUserName,
		visibleTeamCardRow.displayName,
	]);
	useEffect(() => {
		if (activeStepParam !== "card") {
			setFinalCardStage("reveal");
			setPreparedSharePostBlob(null);
		}
	}, [activeStepParam]);
	useEffect(() => {
		setPreparedSharePostBlob(null);
	}, [activeArchetype.id, finalCardStage, visibleTeamCardRow.displayName]);
	useEffect(() => {
		if (finalCardStage !== "share") {
			return;
		}

		let cancelled = false;
		const frameId = window.requestAnimationFrame(() => {
			const sharePostElement = sharePostRef.current;

			if (!sharePostElement) {
				return;
			}

			void (async () => {
				try {
					const nextBlob = await captureElement(sharePostElement);

					if (!cancelled) {
						setPreparedSharePostBlob(nextBlob);
					}
				} catch {
					if (!cancelled) {
						setPreparedSharePostBlob(null);
					}
				}
			})();
		});

		return () => {
			cancelled = true;
			window.cancelAnimationFrame(frameId);
		};
	}, [finalCardStage, activeArchetype.id, visibleTeamCardRow.displayName]);
	const shareTitle = `${visibleTeamCardRow.displayName}'s Geneva post`;
	const shareText = `${visibleTeamCardRow.displayName}'s ${activeArchetype.label} Geneva card, made with rudel.ai.`;
	const shareUrl =
		typeof window === "undefined"
			? undefined
			: new URL(appRoutes.walkInTeamCard(), window.location.origin).toString();

	async function captureSharePost() {
		if (preparedSharePostBlob) {
			return preparedSharePostBlob;
		}

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
							<img
								src="/assets/wordmark-dark-BeVDO32X.svg"
								alt="rudel.ai"
								className="h-5 w-auto"
							/>

							<div className="flex min-h-0 flex-1 items-center justify-center self-stretch">
								<div className="team-lineup-card-tilt-stage w-full max-w-[13.4rem]">
									<div className="team-lineup-card-tilt-shell [--walk-in-card-render-scale:0.92]">
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

							<a
								href="https://rudel.ai/wrapped/evren"
								className="text-[0.82rem] font-semibold tracking-[-0.02em] text-[#4a4744] underline-offset-4"
							>
								rudel.ai/wrapped/evren
							</a>
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
			distinctProjectCount={developerDetailsQuery.data?.distinct_projects ?? 0}
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
	wrappedMetrics: WrappedV1["metrics"] | undefined;
}): WalkInOnboardingMetrics {
	const {
		commitBreakdown,
		developerDetails,
		developerFeatures,
		developerProjects,
		wrappedMetrics,
	} = input;
	const totalSessions = developerDetails?.total_sessions ?? 0;
	const commitSessions = findBooleanDimensionCount(commitBreakdown, true);
	const topProject = findTopProject(developerProjects);
	const repoPulse = buildRepoPulse(developerProjects);

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
	projects: readonly DeveloperProject[] | undefined,
): WalkInOnboardingMetrics["repoPulse"] {
	const projectRows = [...(projects ?? [])];

	if (projectRows.length === 0) {
		return [];
	}

	const usedProjectKeys = new Set<string>();
	const candidates = [
		{
			id: "home-base",
			role: "Home base",
			sortRows: (rows: readonly DeveloperProject[]) =>
				[...rows].sort(
					(leftRow, rightRow) =>
						rightRow.sessions - leftRow.sessions ||
						rightRow.total_duration_min - leftRow.total_duration_min ||
						rightRow.total_tokens - leftRow.total_tokens ||
						leftRow.project_path.localeCompare(rightRow.project_path),
				),
			buildProof: (project: DeveloperProject) =>
				`${project.sessions.toLocaleString()} session${project.sessions === 1 ? "" : "s"}`,
		},
		{
			id: "deep-work",
			role: "Deep work",
			sortRows: (rows: readonly DeveloperProject[]) =>
				[...rows].sort(
					(leftRow, rightRow) =>
						rightRow.total_duration_min - leftRow.total_duration_min ||
						rightRow.sessions - leftRow.sessions ||
						rightRow.total_tokens - leftRow.total_tokens ||
						leftRow.project_path.localeCompare(rightRow.project_path),
				),
			buildProof: (project: DeveloperProject) =>
				`${formatDurationMinutesShort(project.total_duration_min)} on canvas`,
		},
		{
			id: "heavy-lift",
			role: "Heavy lift",
			sortRows: (rows: readonly DeveloperProject[]) =>
				[...rows].sort(
					(leftRow, rightRow) =>
						rightRow.total_tokens - leftRow.total_tokens ||
						rightRow.sessions - leftRow.sessions ||
						rightRow.total_duration_min - leftRow.total_duration_min ||
						leftRow.project_path.localeCompare(rightRow.project_path),
				),
			buildProof: (project: DeveloperProject) =>
				`${formatCompactWholeNumber(project.total_tokens)} tokens moved`,
		},
	] as const;

	return candidates.flatMap((candidate) => {
		const selectedProject = candidate
			.sortRows(projectRows)
			.find((project) => !usedProjectKeys.has(getRepoPulseProjectKey(project)));

		if (!selectedProject) {
			return [];
		}

		usedProjectKeys.add(getRepoPulseProjectKey(selectedProject));
		return [
			{
				id: candidate.id,
				proof: candidate.buildProof(selectedProject),
				repoName: getProjectDisplayName(selectedProject) ?? "Unknown repo",
				role: candidate.role,
			},
		];
	});
}

function getRepoPulseProjectKey(project: DeveloperProject) {
	return (
		getProjectDisplayName(project) ??
		project.project_path ??
		project.git_remote ??
		"unknown-project"
	);
}

function getProjectDisplayName(project: DeveloperProject | undefined) {
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
