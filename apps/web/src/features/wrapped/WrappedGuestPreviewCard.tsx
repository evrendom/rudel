import { useReducedMotion } from "motion/react";
import { type CSSProperties, useEffect, useState } from "react";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { cn } from "@/lib/utils";
import type { WrappedOnboardingMetrics } from "./onboarding/types";
import { WRAPPED_ARCHETYPE_CARD_THEMES } from "./team-card/archetypes";
import { buildWrappedTeamCardBackMetrics } from "./team-card/back-metrics";
import {
	WrappedTeamMemberCard,
	type WrappedTeamMemberCardHeaderMetric,
	type WrappedTeamMemberCardStatItem,
} from "./team-card/card";
import { WrappedTeamMemberCardBack } from "./team-card/card-back";
import { WrappedPrintedCardFlip } from "./team-card/printed-card-flip";
import { useWrappedCardTilt } from "./team-card/tilt/use-card-tilt";
import type { WrappedGuestPreviewProfile } from "./wrapped-guest-preview";

const WRAPPED_GUEST_CARD_THEME =
	WRAPPED_ARCHETYPE_CARD_THEMES.find(({ id }) => id === "npc") ??
	WRAPPED_ARCHETYPE_CARD_THEMES[0];

const WRAPPED_GUEST_CARD_SHELL_STYLE = {
	"--team-lineup-card-grain-opacity": "0",
	"--team-lineup-card-grain-size": "40px",
} as CSSProperties;

const WRAPPED_GUEST_CARD_ISSUED_AT_LABEL = "04/25/2026";
const WRAPPED_GUEST_CARD_FLIP_DURATION_MS = 680;

const DEFAULT_WRAPPED_GUEST_CARD_ROW: TeamPageMemberRow = {
	userId: "wrapped-guest-preview",
	displayName: "You",
	email: null,
	role: "Wrapped preview",
	imageUrl: "/wrapped-profile.png",
	cost: 182,
	favoriteModel: "claude-3-7-sonnet",
	inputTokens: 540_000,
	outputTokens: 320_000,
	totalSessions: 142,
	activeDays: 46,
	totalTokens: 860_000,
	lastActiveDate: "2026-04-18T00:00:00.000Z",
	hasActivity: true,
};

const WRAPPED_GUEST_CARD_ONBOARDING_METRICS: WrappedOnboardingMetrics = {
	activeDays: 46,
	avgSessionMin: 24,
	commitRate: 41,
	commitSessions: 58,
	daysSinceFirst: 180,
	estimatedCostTokenBasis: 0,
	estimatedCostUsd: 182,
	favoriteModel: "claude-3-7-sonnet",
	longestSessionMin: 88,
	modelByMonth: [],
	repoPulse: {
		entries: [],
		leadRepoName: "geneva",
		totalRepos: 9,
		totalSessions: 142,
	},
	skillsAdoptionRate: 62.16,
	sourceSplit: [
		{ session_count: 97, session_share_percent: 68, source: "claude_code" },
		{ session_count: 45, session_share_percent: 32, source: "codex" },
	],
	subagentsAdoptionRate: 10.81,
	successRate: 64,
	topProjectName: "geneva",
	topProjectSessions: 44,
	topProjectTokens: 420_000,
	topSkills: [
		{ count: 14, name: "Refactor" },
		{ count: 9, name: "Test" },
	],
	slashCommandsAdoptionRate: 29.73,
	topSlashCommand: "Architect",
	topSlashCommandCount: 11,
	topSlashCommands: [{ count: 11, name: "Architect" }],
	topSubagent: "Reviewer",
	topSubagentCount: 4,
	topSubagents: [{ count: 4, name: "Reviewer" }],
	totalSessions: 142,
	totalTokens: 860_000,
};

const WRAPPED_GUEST_CARD_HEADER_LEFT_METRIC: WrappedTeamMemberCardHeaderMetric =
	{
		title: "$182 estimated spend",
		value: "$182",
	};

const WRAPPED_GUEST_CARD_HEADER_RIGHT_METRIC: WrappedTeamMemberCardHeaderMetric =
	{
		title: "Smooth Operator",
		value: "Smooth Operator",
	};

const WRAPPED_GUEST_CARD_STAT_ITEMS = [
	{
		key: "codex-share",
		title: "32% of wrapped sessions came from Codex",
		icon: "codex",
		value: "32%",
	},
	{
		key: "claude-share",
		title: "68% of wrapped sessions came from Claude Code",
		icon: "claude",
		value: "68%",
	},
	{
		key: "sessions",
		label: "SESS",
		title: "142 sessions",
		value: "142",
	},
	{
		key: "days",
		label: "DAYS",
		title: "46 active days",
		value: "46",
	},
	{
		key: "tokens",
		label: "TOK",
		title: "860,000 total tokens",
		value: "860K",
	},
	{
		key: "repos",
		label: "REPOS",
		title: "9 distinct tracked projects",
		value: "9",
	},
] as const satisfies readonly WrappedTeamMemberCardStatItem[];

interface WrappedGuestPreviewCardProps {
	profile: WrappedGuestPreviewProfile | null;
	size?: "hero" | "compact";
}

export function WrappedGuestPreviewCard(props: WrappedGuestPreviewCardProps) {
	const { profile, size = "hero" } = props;
	const row = buildWrappedGuestCardRow(profile);
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const tiltController = useWrappedCardTilt();
	const [isCardFlipAnimating, setIsCardFlipAnimating] = useState(false);
	const [isCardFrontVisible, setIsCardFrontVisible] = useState(true);
	const backMetrics = buildWrappedTeamCardBackMetrics({
		onboardingMetrics: WRAPPED_GUEST_CARD_ONBOARDING_METRICS,
		row,
		shareCardCreatedAtLabel: WRAPPED_GUEST_CARD_ISSUED_AT_LABEL,
	});
	const printedCardCaptureKey = [
		row.userId,
		row.displayName,
		row.imageUrl ?? "",
		WRAPPED_GUEST_CARD_THEME.theme,
		...WRAPPED_GUEST_CARD_STAT_ITEMS.map((item) => `${item.key}:${item.value}`),
		...backMetrics.map((metric) => `${metric.label}:${metric.value}`),
	].join("|");

	useEffect(() => {
		if (!isCardFlipAnimating || reduceMotion) {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setIsCardFlipAnimating(false);
		}, WRAPPED_GUEST_CARD_FLIP_DURATION_MS);

		return () => {
			window.clearTimeout(timeoutId);
		};
	}, [isCardFlipAnimating, reduceMotion]);

	function handleCardFlipToggle() {
		tiltController.handlePointerLeave();

		if (reduceMotion) {
			setIsCardFrontVisible((currentValue) => !currentValue);
			return;
		}

		setIsCardFlipAnimating(true);
		setIsCardFrontVisible((currentValue) => !currentValue);
	}

	return (
		<section
			aria-label="Wrapped player card preview"
			className={cn(
				"mymind-wrapped-auth-card-preview team-lineup-surface-scope",
				size === "compact"
					? "mymind-wrapped-auth-card-preview--compact"
					: "mymind-wrapped-auth-card-preview--hero",
			)}
			>
				<div className="team-lineup-card-tilt-stage mymind-wrapped-auth-card-preview__tilt-stage">
					<div
						ref={tiltController.cardTiltRef}
						className="team-lineup-card-tilt-shell mymind-wrapped-auth-card-preview__tilt mymind-wrapped-final-stage__tilt-shell"
						data-flip-active={isCardFlipAnimating ? "true" : "false"}
						onPointerMove={(event) => {
							if (!isCardFlipAnimating) {
								tiltController.handlePointerMove(event);
							}
						}}
						onPointerLeave={tiltController.handlePointerLeave}
						onPointerCancel={tiltController.handlePointerLeave}
						style={
							{
								"--wrapped-card-flip-rotate-y": isCardFrontVisible
									? "0deg"
									: "180deg",
							} as CSSProperties
						}
					>
						<button
							type="button"
							aria-label={
								isCardFrontVisible
									? "Show back of card"
									: "Reveal front of card"
							}
							aria-pressed={isCardFrontVisible}
							className="mymind-wrapped-final-stage__flip-control"
							data-card-face={isCardFrontVisible ? "front" : "back"}
							onClick={handleCardFlipToggle}
						>
							<WrappedPrintedCardFlip
								captureKey={printedCardCaptureKey}
								front={
									<div className="grid justify-center">
										<WrappedTeamMemberCard
											disableOuterShadow
											headerLeftMetric={WRAPPED_GUEST_CARD_HEADER_LEFT_METRIC}
											headerRightMetric={WRAPPED_GUEST_CARD_HEADER_RIGHT_METRIC}
											hideHeaderLogo
											layoutPreset="team-card-preview"
											mediaPanelClassName="mx-auto"
											row={row}
											shellClassName={WRAPPED_GUEST_CARD_THEME.shellClassName}
											shellStyle={WRAPPED_GUEST_CARD_SHELL_STYLE}
											statItems={WRAPPED_GUEST_CARD_STAT_ITEMS}
											statTileClassName=""
											theme={WRAPPED_GUEST_CARD_THEME.theme}
										/>
									</div>
								}
								back={
									<div className="grid justify-center">
										<WrappedTeamMemberCardBack
											disableOuterShadow
											metrics={backMetrics}
											shellClassName={WRAPPED_GUEST_CARD_THEME.shellClassName}
											shellStyle={WRAPPED_GUEST_CARD_SHELL_STYLE}
											theme={WRAPPED_GUEST_CARD_THEME.theme}
										/>
									</div>
								}
								isFrontVisible={isCardFrontVisible}
								reduceMotion={reduceMotion}
							/>
						</button>
					</div>
				</div>
			</section>
	);
}

function buildWrappedGuestCardRow(profile: WrappedGuestPreviewProfile | null) {
	if (!profile) {
		return DEFAULT_WRAPPED_GUEST_CARD_ROW;
	}

	return {
		...DEFAULT_WRAPPED_GUEST_CARD_ROW,
		displayName: profile.displayName,
		imageUrl: profile.imageUrl,
		userId: `wrapped-guest:${profile.username}`,
	};
}
