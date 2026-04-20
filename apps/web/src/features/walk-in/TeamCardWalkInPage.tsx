import type { DeveloperDetails, WrappedSourceSplit } from "@rudel/api-routes";
import { useDialKit } from "dialkit";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Button } from "@/app/ui/button";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import {
	type TeamPageMemberRow,
	useTeamPageData,
} from "@/features/team/use-team-page-data";
import { TeamCardWalkInOnboarding } from "@/features/walk-in/team-card-walk-in-onboarding";
import { useWalkInCardData } from "@/features/walk-in/use-walk-in-card-data";
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
	const sessionUserId = getSessionUserId(session);
	const sessionUserName = getSessionUserName(session);
	const sessionUserEmail = getSessionUserEmail(session);
	const sessionUserImage = getSessionUserImage(session);
	const [activeArchetypeIndex, setActiveArchetypeIndex] = useState(0);
	const dialValues = useDialKit("Walk-in Team Card", {
		card: {
			grainOpacity: [0.4, 0, 1, 0.01],
		},
		statLayers: {
			borderOpacity: [1, 0, 1, 0.01],
			fillOpacity: [0, 0, 1, 0.01],
			insetShadowOpacity: [0.66, 0, 1, 0.01],
			shineOpacity: [0.39, 0, 1, 0.01],
			textureOpacity: [0.81, 0, 1, 0.01],
			topStrokeOpacity: [0, 0, 1, 0.01],
		},
	});
	const developerDetailsQuery = useAnalyticsQuery({
		...orpc.analytics.developers.details.queryOptions({
			input: {
				userId: sessionUserId ?? "",
				days: MAX_ANALYTICS_DAYS,
			},
		}),
		enabled: Boolean(sessionUserId),
	});
	const visibleTeamCardRow = useMemo(
		() =>
			buildResolvedTeamCardRow({
				accountLabel,
				developerDetails: developerDetailsQuery.data,
				sessionUserEmail,
				sessionUserId,
				sessionUserImage,
				sessionUserName,
				teamMemberRows,
			}),
		[
			accountLabel,
			developerDetailsQuery.data,
			sessionUserEmail,
			sessionUserId,
			sessionUserImage,
			sessionUserName,
			teamMemberRows,
		],
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
	const statLayerOpacities = useMemo<WalkInTeamMemberCardStatLayerOpacities>(
		() => ({
			rainbowShineOpacity: dialValues.statLayers.shineOpacity,
			tileBorderOpacity: dialValues.statLayers.borderOpacity,
			tileFillOpacity: dialValues.statLayers.fillOpacity,
			tileInsetShadowOpacity: dialValues.statLayers.insetShadowOpacity,
			tileTopStrokeOpacity: dialValues.statLayers.topStrokeOpacity,
			textureOpacity: dialValues.statLayers.textureOpacity,
		}),
		[
			dialValues.statLayers.borderOpacity,
			dialValues.statLayers.fillOpacity,
			dialValues.statLayers.insetShadowOpacity,
			dialValues.statLayers.shineOpacity,
			dialValues.statLayers.topStrokeOpacity,
			dialValues.statLayers.textureOpacity,
		],
	);
	const shellStyle = useMemo<WalkInTeamCardShellStyle>(
		() => ({
			"--team-lineup-card-grain-opacity": String(dialValues.card.grainOpacity),
			"--team-lineup-card-grain-size": "40px",
		}),
		[dialValues.card.grainOpacity],
	);
	useEffect(() => {
		document.body.classList.add("mymind-walk-in-body");

		return () => {
			document.body.classList.remove("mymind-walk-in-body");
		};
	}, []);

	const finalStage = (
		<section className="grid min-h-full w-full items-center gap-10 lg:grid-cols-[minmax(20rem,34rem)_minmax(18rem,1fr)] lg:gap-12">
			<div className="team-lineup-surface-scope flex w-full justify-center lg:justify-start">
				<div className="flex w-full max-w-[30rem] flex-col items-center gap-5">
					<div className="flex h-[34rem] w-full items-center justify-center sm:h-[37rem]">
						<div className="origin-center scale-[1.42] sm:scale-[1.56] lg:scale-[1.72]">
							<ul className="grid justify-center p-0">
								<WalkInTeamMemberCard
									headerLeftMetric={headerLeftMetric}
									headerRightMetric={headerRightMetric}
									shellClassName={activeArchetype.shellClassName}
									shellStyle={shellStyle}
									row={visibleTeamCardRow}
									mediaPanelClassName="mx-auto aspect-square w-[9.875rem]"
									statLayerOpacities={statLayerOpacities}
									statItems={statItems}
									statTileClassName="min-h-[26px] rounded-[9px] px-[8px] py-[1px]"
									theme={activeArchetype.theme}
								/>
							</ul>
						</div>
					</div>

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
			totalSessions={visibleTeamCardRow.totalSessions}
		/>
	);
}

function buildResolvedTeamCardRow(params: {
	accountLabel: string;
	developerDetails: DeveloperDetails | undefined;
	sessionUserEmail: string | undefined;
	sessionUserId: string | undefined;
	sessionUserImage: string | undefined;
	sessionUserName: string | undefined;
	teamMemberRows: readonly TeamPageMemberRow[];
}): TeamPageMemberRow {
	const {
		accountLabel,
		developerDetails,
		sessionUserEmail,
		sessionUserId,
		sessionUserImage,
		sessionUserName,
		teamMemberRows,
	} = params;
	const currentUserRow = sessionUserId
		? teamMemberRows.find((row) => row.userId === sessionUserId)
		: undefined;
	const fallbackDisplayName =
		getMeaningfulDisplayName(sessionUserName) ||
		getEmailHandle(sessionUserEmail) ||
		getFallbackTeamMemberDisplayName(accountLabel);
	const displayName =
		getMeaningfulDisplayName(currentUserRow?.displayName) ||
		fallbackDisplayName;
	const imageUrl = currentUserRow?.imageUrl ?? sessionUserImage;
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
			imageUrl,
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
		return currentUserRow;
	}

	return {
		activeDays: 0,
		cost: 0,
		displayName,
		email,
		favoriteModel: null,
		hasActivity: false,
		imageUrl: imageUrl ?? "/walk-in-profile.png",
		inputTokens: 0,
		lastActiveDate: null,
		outputTokens: 0,
		role: "Tracked collaborator",
		totalSessions: 0,
		totalTokens: 0,
		userId: sessionUserId ?? "walk-in-preview",
	};
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

function getSessionUserId(
	session: ReturnType<typeof useWalkInCardData>["session"],
) {
	return session?.user &&
		"id" in session.user &&
		typeof session.user.id === "string"
		? session.user.id
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

function getSessionUserImage(
	session: ReturnType<typeof useWalkInCardData>["session"],
) {
	return session?.user &&
		"image" in session.user &&
		typeof session.user.image === "string"
		? session.user.image
		: undefined;
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
