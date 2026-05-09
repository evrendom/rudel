import type { CSSProperties } from "react";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import type { WrappedOnboardingMetrics } from "./onboarding/types";
import { WRAPPED_ARCHETYPE_CARD_THEMES } from "./team-card/archetypes";
import type {
	WrappedTeamMemberCardHeaderMetric,
	WrappedTeamMemberCardStatItem,
	WrappedTeamMemberCardTheme,
} from "./team-card/card";
import type { WrappedGuestPreviewProfile } from "./wrapped-guest-preview";

interface WrappedGuestCardPreset {
	backIssuedAtLabel: string;
	flipDurationMs: number;
	headerLeftMetric: WrappedTeamMemberCardHeaderMetric;
	headerRightMetric: WrappedTeamMemberCardHeaderMetric;
	onboardingMetrics: WrappedOnboardingMetrics;
	row: TeamPageMemberRow;
	shellClassName: string;
	shellStyle: WrappedGuestCardShellStyle;
	statItems: readonly WrappedTeamMemberCardStatItem[];
	theme: WrappedTeamMemberCardTheme;
}

interface WrappedGuestCardShellStyle extends CSSProperties {
	"--team-lineup-card-grain-opacity": string;
	"--team-lineup-card-grain-size": string;
}

const RICK_PLACEHOLDER_THEME =
	WRAPPED_ARCHETYPE_CARD_THEMES.find(({ id }) => id === "maniac") ??
	WRAPPED_ARCHETYPE_CARD_THEMES[0];

const RICK_PLACEHOLDER_SHELL_STYLE = {
	"--team-lineup-card-grain-opacity": "0",
	"--team-lineup-card-grain-size": "40px",
} satisfies WrappedGuestCardShellStyle;

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
	distinctProjectCount: 12,
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

export const RICK_PLACEHOLDER_GUEST_CARD_PRESET: WrappedGuestCardPreset = {
	backIssuedAtLabel: "04/25/2026",
	flipDurationMs: 680,
	headerLeftMetric: {
		title: "$347 estimated spend",
		value: "$347",
	},
	headerRightMetric: {
		title: "Maniac",
		value: "Maniac",
	},
	onboardingMetrics: RICK_PLACEHOLDER_ONBOARDING_METRICS,
	row: RICK_PLACEHOLDER_ROW,
	shellClassName: RICK_PLACEHOLDER_THEME.shellClassName,
	shellStyle: RICK_PLACEHOLDER_SHELL_STYLE,
	statItems: RICK_PLACEHOLDER_STAT_ITEMS,
	theme: RICK_PLACEHOLDER_THEME.theme,
};

export const UNKNOWN_GUEST_CARD_PRESET: WrappedGuestCardPreset = {
	backIssuedAtLabel: RICK_PLACEHOLDER_GUEST_CARD_PRESET.backIssuedAtLabel,
	flipDurationMs: RICK_PLACEHOLDER_GUEST_CARD_PRESET.flipDurationMs,
	headerLeftMetric: {
		title: "Unknown estimated spend",
		value: "???",
	},
	headerRightMetric: {
		title: "Unknown Archetype",
		value: "Unknown Archetype",
	},
	onboardingMetrics: RICK_PLACEHOLDER_GUEST_CARD_PRESET.onboardingMetrics,
	row: RICK_PLACEHOLDER_GUEST_CARD_PRESET.row,
	shellClassName:
		"bg-[linear-gradient(180deg,_#FFFFFF_0%,_#FBFCFE_48%,_#EEF2F7_100%)]",
	shellStyle: RICK_PLACEHOLDER_GUEST_CARD_PRESET.shellStyle,
	statItems: RICK_PLACEHOLDER_GUEST_CARD_PRESET.statItems.map((statItem) => ({
		...statItem,
		title: "Unknown card value",
		value: "???",
	})),
	theme: "light",
};

export function buildRickPlaceholderGuestCardRow(
	profile: WrappedGuestPreviewProfile | null,
	displayNameOverride?: string,
) {
	if (!profile) {
		return {
			...RICK_PLACEHOLDER_GUEST_CARD_PRESET.row,
			displayName:
				displayNameOverride ??
				RICK_PLACEHOLDER_GUEST_CARD_PRESET.row.displayName,
		};
	}

	return {
		...RICK_PLACEHOLDER_GUEST_CARD_PRESET.row,
		displayName: displayNameOverride ?? profile.displayName,
		imageUrl: profile.imageUrl,
		userId: `wrapped-guest:${profile.username}`,
	};
}
