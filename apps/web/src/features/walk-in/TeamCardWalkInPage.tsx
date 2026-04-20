import type {
	DeveloperDetails,
	DeveloperFeatureUsage,
	DeveloperProject,
	DimensionAnalysisDataPoint,
	WrappedSourceSplit,
} from "@rudel/api-routes";
import { useDialKit } from "dialkit";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
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
	TEAM_CARD_PREVIEW_ACTIONS,
	WalkInPreviewColumn,
} from "@/features/walk-in/WalkInPreviewColumn";
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
	const {
		accountLabel,
		cardModel,
		handover,
		session,
		wrappedData,
		wrappedDataState,
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
			}),
		[
			commitBreakdownQuery.data,
			developerDetailsQuery.data,
			developerFeaturesQuery.data,
			developerProjectsQuery.data,
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

	const finalStage = (
		<section className="grid min-h-full w-full items-center gap-10 lg:grid-cols-[minmax(20rem,34rem)_minmax(18rem,1fr)] lg:gap-12">
			<div className="team-lineup-surface-scope flex w-full justify-center lg:justify-start">
				<div className="flex w-full max-w-[30rem] flex-col items-center gap-5">
					{/* Temporary idea: keep the sponsor-burn line commented out for now.
					<div className="flex items-center gap-2 text-[0.72rem] font-medium leading-none tracking-[-0.02em] text-[#2f2a27]">
						<span>not presented to you by</span>
						<RampWordmark className="h-4 w-[60px] shrink-0 text-black" />
					</div>
					*/}

					<div className="flex h-[34rem] w-full items-center justify-center sm:h-[37rem] lg:h-[39rem]">
						<div className="team-lineup-card-tilt-stage">
							<div
								ref={tiltController.cardTiltRef}
								className="team-lineup-card-tilt-shell [--walk-in-card-render-scale:1.42] sm:[--walk-in-card-render-scale:1.56] lg:[--walk-in-card-render-scale:1.72]"
								onPointerMove={tiltController.handlePointerMove}
								onPointerLeave={tiltController.handlePointerLeave}
								onPointerCancel={tiltController.handlePointerLeave}
							>
								<div className="grid justify-center">
									<ul className="m-0 grid justify-center p-0">
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
									</ul>
								</div>
							</div>
						</div>
					</div>

					{tiltController.isGyroscopePromptVisible ? (
						<div className="flex w-full max-w-[24rem] flex-col items-center gap-2">
							<Button
								type="button"
								variant="outline"
								className="min-h-[44px] rounded-full border-black/10 bg-white/82 px-4 text-[0.82rem] font-semibold tracking-[-0.02em] text-[#2d2927] shadow-[0_12px_28px_rgba(15,23,42,0.08)] hover:bg-white"
								onClick={() => void tiltController.enableGyroscope()}
								disabled={tiltController.gyroscopeState === "pending"}
							>
								{tiltController.gyroscopeState === "pending"
									? "Enabling gyroscope…"
									: tiltController.gyroscopeState === "blocked"
										? "Request motion access again"
										: tiltController.gyroscopeState === "error"
											? "Try motion access again"
											: "Enable gyroscope tilt"}
							</Button>

							{tiltController.gyroscopeStatusMessage ? (
								<p className="max-w-[22rem] text-center text-[0.74rem] font-medium leading-[1.35] tracking-[-0.01em] text-black/52">
									{tiltController.gyroscopeStatusMessage}
								</p>
							) : null}
						</div>
					) : null}

					{tiltController.isGyroscopeSupported &&
					tiltController.gyroscopeState === "active" ? (
						<div className="rounded-full border border-emerald-500/16 bg-emerald-500/10 px-3 py-2 text-[0.76rem] font-semibold leading-none tracking-[0.1em] text-emerald-800 uppercase">
							Gyroscope tilt live
						</div>
					) : null}

					<div className="flex items-center gap-3">
						<Button
							type="button"
							variant="outline"
							size="icon-sm"
							className="rounded-full border-black/10 bg-white/82 text-[#2d2927] shadow-[0_12px_28px_rgba(15,23,42,0.1)] hover:bg-white"
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

						<div className="min-w-[14rem] rounded-full border border-black/10 bg-white/82 px-4 py-2 text-center shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
							<div className="text-[0.72rem] font-semibold leading-none tracking-[0.12em] text-black/40 uppercase">
								Archetype
							</div>
							<div className="mt-1 text-sm font-semibold leading-none tracking-[-0.03em] text-[#302d2b]">
								{activeArchetype.label}
							</div>
						</div>

						<Button
							type="button"
							variant="outline"
							size="icon-sm"
							className="rounded-full border-black/10 bg-white/82 text-[#2d2927] shadow-[0_12px_28px_rgba(15,23,42,0.1)] hover:bg-white"
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
			</div>

			<WalkInPreviewColumn
				actions={TEAM_CARD_PREVIEW_ACTIONS}
				cardModel={cardModel}
				handover={handover}
				wrappedData={wrappedData}
				wrappedDataState={wrappedDataState}
			/>
		</section>
	);

	return (
		<TeamCardWalkInOnboarding
			distinctProjectCount={developerDetailsQuery.data?.distinct_projects ?? 0}
			displayName={visibleTeamCardRow.displayName}
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

/* Temporary idea: keep the sponsor-burn logo helper commented out for now.
function RampWordmark(props: { className?: string }) {
	const { className } = props;

	return (
		<svg
			viewBox="0 0 75 20"
			fill="none"
			aria-hidden="true"
			className={className}
			xmlns="http://www.w3.org/2000/svg"
		>
			<g clipPath="url(#ramp-wordmark-clip)" fill="currentColor">
				<path d="M5.19 6.76c-1.79 0-2.667 1.576-2.667 3.681v5.275H0V4.585h2.478v2.888h.043c.53-1.776 1.585-3.21 3.212-3.21 1.144 0 1.627.399 1.627.399L6.22 6.955c0-.002-.363-.195-1.031-.195Zm30.496 1.528v7.427h-2.458V9.192c0-1.872-.587-2.864-2.088-2.864-1.553 0-2.305 1.254-2.305 3.66v5.726H26.4V9.192c0-1.8-.58-2.864-2.066-2.864-1.695 0-2.348 1.486-2.348 3.66v5.726h-2.478V4.584h2.478v2.521h.022c.386-1.744 1.44-2.82 3.218-2.82 1.764 0 2.913.947 3.349 2.627.415-1.617 1.52-2.628 3.218-2.628 2.37 0 3.893 1.486 3.893 4.004ZM12.318 4.262c-2.28 0-3.773 1.071-4.453 3.005l2.099.763c.382-1.166 1.18-1.83 2.398-1.83 1.37 0 2.175.603 2.175 1.528 0 .947-.64 1.145-2.088 1.379-1.61.259-5.437.344-5.437 3.573 0 1.892 1.582 3.315 3.958 3.315 1.786 0 3.003-.73 3.566-2.089h.022v1.81h2.457V8.868c0-2.995-1.508-4.607-4.697-4.607Zm2.283 6.214c0 2.334-1.155 3.833-3 3.833-1.306 0-2.088-.732-2.088-1.788 0-.99.804-1.678 2.348-1.961 1.58-.29 2.375-.648 2.74-1.507v1.423Zm29.826-6.192c-1.88 0-3.121 1.033-3.653 2.585V4.585h-2.61V20h2.588v-6.568h.022c.576 1.681 1.775 2.606 3.653 2.606 2.979 0 5.11-2.454 5.11-5.921 0-3.443-2.131-5.833-5.11-5.833Zm-.642 9.688c-2.063 0-3.207-1.497-3.207-3.822s1.28-3.822 3.207-3.822c1.926 0 3.208 1.57 3.208 3.822 0 2.253-1.28 3.822-3.208 3.822ZM75.172 15.665v.07l-10.1.003v-.073c1.457-.823 2.462-1.66 3.367-2.536h4.147l2.586 2.536ZM72.67 2.51 70.11 0h-.075s.043 4.68-4.255 8.936c-4.206 4.166-9.152 4.175-9.152 4.175v.073l2.608 2.555s4.874.048 9.18-4.175c4.29-4.21 4.254-9.053 4.254-9.053Z" />
			</g>
			<defs>
				<clipPath id="ramp-wordmark-clip">
					<path fill="#fff" d="M0 0h75v20H0z" />
				</clipPath>
			</defs>
		</svg>
	);
}
*/

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
}): WalkInOnboardingMetrics {
	const {
		commitBreakdown,
		developerDetails,
		developerFeatures,
		developerProjects,
	} = input;
	const totalSessions = developerDetails?.total_sessions ?? 0;
	const commitSessions = findBooleanDimensionCount(commitBreakdown, true);
	const topProject = findTopProject(developerProjects);

	return {
		commitRate:
			totalSessions > 0 ? (commitSessions / totalSessions) * 100 : null,
		skillsAdoptionRate: developerFeatures?.skills_adoption_rate ?? null,
		slashCommandsAdoptionRate:
			developerFeatures?.slash_commands_adoption_rate ?? null,
		subagentsAdoptionRate: developerFeatures?.subagents_adoption_rate ?? null,
		successRate: developerDetails?.success_rate ?? null,
		topProjectName: getProjectDisplayName(topProject),
		topProjectSessions: topProject?.sessions ?? 0,
		topProjectTokens: topProject?.total_tokens ?? 0,
		topSkill: formatWalkInLabel(developerFeatures?.top_skills[0]?.name),
		topSlashCommand: formatWalkInLabel(
			developerFeatures?.top_slash_commands[0]?.name,
		),
		topSubagent: formatWalkInLabel(developerFeatures?.top_subagents[0]?.name),
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
