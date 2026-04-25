import { useReducedMotion } from "motion/react";
import { type CSSProperties, type RefObject, useRef, useState } from "react";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { useMountEffect } from "@/hooks/useMountEffect";
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
import { DEFAULT_WRAPPED_SHARE_APPEARANCE } from "./team-card/share-appearance";
import { buildWrappedShareSafeRow } from "./team-card/share-media";
import { WrappedTeamCardSharePreview } from "./team-card/share-preview";
import { useWrappedCardTilt } from "./team-card/tilt/use-card-tilt";
import type { WrappedGuestPreviewProfile } from "./wrapped-guest-preview";

const RICK_PLACEHOLDER_THEME =
	WRAPPED_ARCHETYPE_CARD_THEMES.find(({ id }) => id === "maniac") ??
	WRAPPED_ARCHETYPE_CARD_THEMES[0];

const WRAPPED_UNKNOWN_CARD_SHELL_CLASS_NAME =
	"bg-[linear-gradient(180deg,_#F5F6F8_0%,_#D9DEE4_52%,_#B8C0CA_100%)]";

const RICK_PLACEHOLDER_SHELL_STYLE = {
	"--team-lineup-card-grain-opacity": "0",
	"--team-lineup-card-grain-size": "40px",
} as CSSProperties;

const RICK_PLACEHOLDER_ISSUED_AT_LABEL = "04/25/2026";
const RICK_PLACEHOLDER_FLIP_DURATION_MS = 680;

const RICK_PLACEHOLDER_ROW: TeamPageMemberRow = {
	userId: "RickPlaceholder",
	displayName: "Jon Doe",
	email: null,
	role: "Wrapped preview",
	imageUrl: null,
	cost: 347,
	favoriteModel: "claude-3-7-sonnet",
	inputTokens: 1_180_000,
	outputTokens: 740_000,
	totalSessions: 219,
	activeDays: 58,
	totalTokens: 1_920_000,
	lastActiveDate: "2026-04-24T00:00:00.000Z",
	hasActivity: true,
};

const RICK_PLACEHOLDER_ONBOARDING_METRICS: WrappedOnboardingMetrics = {
	activeDays: 58,
	avgSessionMin: 37,
	commitRate: 48,
	commitSessions: 105,
	daysSinceFirst: 214,
	estimatedCostTokenBasis: 0,
	estimatedCostUsd: 347,
	favoriteModel: "claude-3-7-sonnet",
	longestSessionMin: 143,
	modelByMonth: [],
	repoPulse: {
		entries: [],
		leadRepoName: "geneva",
		totalRepos: 12,
		totalSessions: 219,
	},
	skillsAdoptionRate: 71.23,
	sourceSplit: [
		{ session_count: 125, session_share_percent: 57, source: "claude_code" },
		{ session_count: 94, session_share_percent: 43, source: "codex" },
	],
	subagentsAdoptionRate: 22.83,
	successRate: 69,
	topProjectName: "geneva",
	topProjectSessions: 63,
	topProjectTokens: 610_000,
	topSkills: [
		{ count: 18, name: "Refactor" },
		{ count: 13, name: "Test" },
	],
	slashCommandsAdoptionRate: 46.12,
	topSlashCommand: "Architect",
	topSlashCommandCount: 24,
	topSlashCommands: [{ count: 24, name: "Architect" }],
	topSubagent: "Reviewer",
	topSubagentCount: 11,
	topSubagents: [{ count: 11, name: "Reviewer" }],
	totalSessions: 219,
	totalTokens: 1_920_000,
};

const RICK_PLACEHOLDER_HEADER_LEFT_METRIC: WrappedTeamMemberCardHeaderMetric = {
	title: "$347 estimated spend",
	value: "$347",
};

const RICK_PLACEHOLDER_HEADER_RIGHT_METRIC: WrappedTeamMemberCardHeaderMetric =
	{
		title: "Maniac",
		value: "Maniac",
	};

const WRAPPED_UNKNOWN_CARD_HEADER_RIGHT_METRIC: WrappedTeamMemberCardHeaderMetric =
	{
		title: "Unknown",
		value: "Unknown",
	};

const RICK_PLACEHOLDER_STAT_ITEMS = [
	{
		key: "codex-share",
		title: "43% of wrapped sessions came from Codex",
		icon: "codex",
		value: "43%",
	},
	{
		key: "claude-share",
		title: "57% of wrapped sessions came from Claude Code",
		icon: "claude",
		value: "57%",
	},
	{
		key: "sessions",
		label: "SESS",
		title: "219 sessions",
		value: "219",
	},
	{
		key: "days",
		label: "DAYS",
		title: "58 active days",
		value: "58",
	},
	{
		key: "tokens",
		label: "TOK",
		title: "1,920,000 total tokens",
		value: "1.9M",
	},
	{
		key: "repos",
		label: "REPOS",
		title: "12 distinct tracked projects",
		value: "12",
	},
] as const satisfies readonly WrappedTeamMemberCardStatItem[];

interface WrappedGuestPreviewCardProps {
	appearance?: "default" | "unknown";
	profile: WrappedGuestPreviewProfile | null;
	size?: "hero" | "compact" | "profile";
}

export function WrappedGuestPreviewCard(props: WrappedGuestPreviewCardProps) {
	const { appearance = "default", profile, size = "hero" } = props;
	const isUnknownCard = appearance === "unknown";
	const row = buildWrappedGuestCardRow(profile);
	const shouldReduceMotion = useReducedMotion();
	const reduceMotion = shouldReduceMotion ?? false;
	const tiltController = useWrappedCardTilt();
	const flipAnimationTimeoutRef = useRef<number | null>(null);
	const [isCardFlipAnimating, setIsCardFlipAnimating] = useState(false);
	const [isCardFrontVisible, setIsCardFrontVisible] = useState(true);
	const cardTheme = isUnknownCard ? "light" : RICK_PLACEHOLDER_THEME.theme;
	const cardShellClassName = isUnknownCard
		? WRAPPED_UNKNOWN_CARD_SHELL_CLASS_NAME
		: RICK_PLACEHOLDER_THEME.shellClassName;
	const headerRightMetric = isUnknownCard
		? WRAPPED_UNKNOWN_CARD_HEADER_RIGHT_METRIC
		: RICK_PLACEHOLDER_HEADER_RIGHT_METRIC;
	const backMetrics = buildWrappedTeamCardBackMetrics({
		onboardingMetrics: RICK_PLACEHOLDER_ONBOARDING_METRICS,
		row,
		shareCardCreatedAtLabel: RICK_PLACEHOLDER_ISSUED_AT_LABEL,
	});
	const printedCardCaptureKey = [
		row.userId,
		row.displayName,
		row.imageUrl ?? "",
		cardTheme,
		cardShellClassName,
		headerRightMetric.value,
		...RICK_PLACEHOLDER_STAT_ITEMS.map((item) => `${item.key}:${item.value}`),
		...backMetrics.map((metric) => `${metric.label}:${metric.value}`),
	].join("|");

	useMountEffect(() => () => {
		clearFlipAnimationTimeout();
	});

	function handleCardFlipToggle() {
		tiltController.handlePointerLeave();
		clearFlipAnimationTimeout();

		if (reduceMotion) {
			setIsCardFlipAnimating(false);
			setIsCardFrontVisible((currentValue) => !currentValue);
			return;
		}

		setIsCardFlipAnimating(true);
		setIsCardFrontVisible((currentValue) => !currentValue);
		flipAnimationTimeoutRef.current = window.setTimeout(() => {
			setIsCardFlipAnimating(false);
			flipAnimationTimeoutRef.current = null;
		}, RICK_PLACEHOLDER_FLIP_DURATION_MS);
	}

	function clearFlipAnimationTimeout() {
		if (flipAnimationTimeoutRef.current === null) {
			return;
		}

		window.clearTimeout(flipAnimationTimeoutRef.current);
		flipAnimationTimeoutRef.current = null;
	}

	return (
		<section
			aria-label="Wrapped player card preview"
			className={cn(
				"mymind-wrapped-auth-card-preview team-lineup-surface-scope",
				size === "compact"
					? "mymind-wrapped-auth-card-preview--compact"
					: size === "profile"
						? "mymind-wrapped-auth-card-preview--profile"
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
							isCardFrontVisible ? "Show back of card" : "Reveal front of card"
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
										headerLeftMetric={RICK_PLACEHOLDER_HEADER_LEFT_METRIC}
										headerRightMetric={headerRightMetric}
										hideHeaderLogo
										layoutPreset="team-card-preview"
										mediaPanelClassName="mx-auto"
										row={row}
										shellClassName={cardShellClassName}
										shellStyle={RICK_PLACEHOLDER_SHELL_STYLE}
										statItems={RICK_PLACEHOLDER_STAT_ITEMS}
										statTileClassName=""
										theme={cardTheme}
									/>
								</div>
							}
							back={
								<div className="grid justify-center">
									<WrappedTeamMemberCardBack
										disableOuterShadow
										metrics={backMetrics}
										shellClassName={cardShellClassName}
										shellStyle={RICK_PLACEHOLDER_SHELL_STYLE}
										theme={cardTheme}
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

export function WrappedGuestShareImagePreview(props: {
	profile: WrappedGuestPreviewProfile | null;
	sharePostRef?: RefObject<HTMLDivElement | null>;
}) {
	const { profile, sharePostRef } = props;
	const row = buildWrappedShareSafeRow(buildWrappedGuestCardRow(profile));
	const backMetrics = buildWrappedTeamCardBackMetrics({
		onboardingMetrics: RICK_PLACEHOLDER_ONBOARDING_METRICS,
		row,
		shareCardCreatedAtLabel: RICK_PLACEHOLDER_ISSUED_AT_LABEL,
	});

	return (
		<WrappedTeamCardSharePreview
			appearance={DEFAULT_WRAPPED_SHARE_APPEARANCE}
			backMetrics={backMetrics}
			headerLeftMetric={RICK_PLACEHOLDER_HEADER_LEFT_METRIC}
			headerRightMetric={RICK_PLACEHOLDER_HEADER_RIGHT_METRIC}
			row={row}
			shareCardCreatedAtLabel={RICK_PLACEHOLDER_ISSUED_AT_LABEL}
			sharePostRef={sharePostRef}
			shellClassName={RICK_PLACEHOLDER_THEME.shellClassName}
			shellStyle={RICK_PLACEHOLDER_SHELL_STYLE}
			statItems={RICK_PLACEHOLDER_STAT_ITEMS}
			theme={RICK_PLACEHOLDER_THEME.theme}
		/>
	);
}

function buildWrappedGuestCardRow(profile: WrappedGuestPreviewProfile | null) {
	if (!profile) {
		return RICK_PLACEHOLDER_ROW;
	}

	return {
		...RICK_PLACEHOLDER_ROW,
		displayName: profile.displayName,
		imageUrl: profile.imageUrl,
		userId: `wrapped-guest:${profile.username}`,
	};
}
