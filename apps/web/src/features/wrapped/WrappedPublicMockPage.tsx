import type { CSSProperties, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { appRoutes } from "@/app/routes";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import { WRAPPED_ARCHETYPE_CARD_THEMES } from "@/features/wrapped/team-card/archetypes";
import { buildWrappedTeamCardBackMetrics } from "@/features/wrapped/team-card/back-metrics";
import type {
	WrappedTeamMemberCardHeaderMetric,
	WrappedTeamMemberCardStatItem,
	WrappedTeamMemberCardStatLayerOpacities,
} from "@/features/wrapped/team-card/card";
import {
	WrappedPublicCardAction,
	WrappedPublicCardScreen,
} from "@/features/wrapped/WrappedPublicCardScreen";
import { useMountEffect } from "@/hooks/useMountEffect";
import "@/features/wrapped/wrapped.css";

interface WrappedPublicMockPageProps {
	debugControls?: ReactNode;
}

interface WrappedPublicMockCardShellStyle extends CSSProperties {
	"--team-lineup-card-grain-opacity": string;
	"--team-lineup-card-grain-size": string;
}

const MOCK_PUBLIC_SHARE_ROW = {
	activeDays: 42,
	cost: 687,
	displayName: "Maya Chen",
	email: null,
	favoriteModel: "claude-sonnet-4.5",
	hasActivity: true,
	imageUrl: null,
	inputTokens: 3_820_400,
	lastActiveDate: "2026-04-27",
	outputTokens: 1_247_900,
	role: "Founding Engineer",
	totalSessions: 312,
	totalTokens: 5_068_300,
	userId: "wrapped-public-mock-maya",
} satisfies TeamPageMemberRow;

const MOCK_PUBLIC_SHARE_HEADER_LEFT_METRIC = {
	title: "$687 estimated spend",
	value: "$687",
} satisfies WrappedTeamMemberCardHeaderMetric;

const MOCK_PUBLIC_SHARE_HEADER_RIGHT_METRIC = {
	title: "Roadrunner",
	value: "Roadrunner",
} satisfies WrappedTeamMemberCardHeaderMetric;

const MOCK_PUBLIC_SHARE_STAT_ITEMS = [
	{
		icon: "codex",
		key: "codex-share",
		title: "58% of wrapped sessions came from Codex",
		value: "58%",
	},
	{
		icon: "claude",
		key: "claude-share",
		title: "42% of wrapped sessions came from Claude Code",
		value: "42%",
	},
	{
		key: "sessions",
		label: "SESS",
		title: "312 sessions",
		value: "312",
	},
	{
		key: "days",
		label: "DAYS",
		title: "42 active days across the tracked window",
		value: "42",
	},
	{
		key: "tokens",
		label: "TOK",
		title: "5,068,300 total tokens",
		value: "5.1M",
	},
	{
		key: "repos",
		label: "REPOS",
		title: "14 distinct tracked projects",
		value: "14",
	},
] as const satisfies readonly WrappedTeamMemberCardStatItem[];

const MOCK_PUBLIC_SHARE_STAT_LAYER_OPACITIES = {
	rainbowShineOpacity: 0.82,
	tileBorderOpacity: 1,
	tileFillOpacity: 0.03,
	tileInsetShadowOpacity: 0.64,
	tileTopStrokeOpacity: 0.04,
	textureOpacity: 0.76,
} satisfies WrappedTeamMemberCardStatLayerOpacities;

const MOCK_PUBLIC_SHARE_ONBOARDING_METRICS = {
	activeDays: 42,
	avgSessionMin: 18,
	commitRate: 71,
	commitSessions: 118,
	daysSinceFirst: 94,
	estimatedCostTokenBasis: 5_068_300,
	estimatedCostUsd: 687,
	favoriteModel: "claude-sonnet-4.5",
	longestSessionMin: 124,
	modelByMonth: [],
	repoPulse: {
		entries: [
			{
				id: "rudel-web",
				repoName: "rudel-web",
				sessionCountLabel: "94 sessions",
				totalHoursLabel: "29h",
				totalSpendLabel: "$218",
			},
			{
				id: "data-pipeline",
				repoName: "data-pipeline",
				sessionCountLabel: "61 sessions",
				totalHoursLabel: "18h",
				totalSpendLabel: "$146",
			},
			{
				id: "design-system",
				repoName: "design-system",
				sessionCountLabel: "38 sessions",
				totalHoursLabel: "11h",
				totalSpendLabel: "$92",
			},
		],
		leadRepoName: "rudel-web",
		totalRepos: 14,
		totalSessions: 312,
	},
	skillsAdoptionRate: 31,
	slashCommandsAdoptionRate: 46,
	sourceSplit: [
		{ session_count: 131, session_share_percent: 42, source: "claude_code" },
		{ session_count: 181, session_share_percent: 58, source: "codex" },
	],
	subagentsAdoptionRate: 12,
	successRate: 86,
	topProjectName: "rudel-web",
	topProjectSessions: 94,
	topProjectTokens: 1_180_000,
	topSkills: [
		{ count: 24, name: "Code review" },
		{ count: 19, name: "Refactor" },
		{ count: 14, name: "API testing" },
	],
	topSlashCommand: "/test",
	topSlashCommandCount: 31,
	topSlashCommands: [
		{ count: 31, name: "/test" },
		{ count: 22, name: "/review" },
	],
	topSubagent: "worker",
	topSubagentCount: 16,
	topSubagents: [
		{ count: 16, name: "worker" },
		{ count: 11, name: "explorer" },
	],
	totalSessions: 312,
	totalTokens: 5_068_300,
} satisfies WrappedOnboardingMetrics;

const MOCK_PUBLIC_SHARE_BACK_METRICS = buildWrappedTeamCardBackMetrics({
	onboardingMetrics: MOCK_PUBLIC_SHARE_ONBOARDING_METRICS,
	row: MOCK_PUBLIC_SHARE_ROW,
	shareCardCreatedAtLabel: "Apr 28, 2026",
});

const MOCK_PUBLIC_SHARE_SHELL_STYLE: WrappedPublicMockCardShellStyle = {
	"--team-lineup-card-grain-opacity": "0.18",
	"--team-lineup-card-grain-size": "38px",
};

const MOCK_PUBLIC_SHARE_ARCHETYPE = getMockPublicShareArchetype();

export function WrappedPublicMockPage(props: WrappedPublicMockPageProps) {
	const { debugControls } = props;
	const navigate = useNavigate();

	useMountEffect(() => {
		document.body.classList.add("mymind-wrapped-body");

		return () => {
			document.body.classList.remove("mymind-wrapped-body");
		};
	});

	function handleMakeYours() {
		navigate(appRoutes.wrappedTeamCard());
	}

	return (
		<WrappedPublicCardScreen
			action={
				<WrappedPublicCardAction
					href={appRoutes.wrappedTeamCard()}
					onClick={handleMakeYours}
				>
					Make yours
				</WrappedPublicCardAction>
			}
			activeArchetype={MOCK_PUBLIC_SHARE_ARCHETYPE}
			backMetrics={MOCK_PUBLIC_SHARE_BACK_METRICS}
			debugControls={debugControls}
			headerLeftMetric={MOCK_PUBLIC_SHARE_HEADER_LEFT_METRIC}
			headerRightMetric={MOCK_PUBLIC_SHARE_HEADER_RIGHT_METRIC}
			row={MOCK_PUBLIC_SHARE_ROW}
			shellClassName={MOCK_PUBLIC_SHARE_ARCHETYPE.shellClassName}
			shellStyle={MOCK_PUBLIC_SHARE_SHELL_STYLE}
			statItems={MOCK_PUBLIC_SHARE_STAT_ITEMS}
			statLayerOpacities={MOCK_PUBLIC_SHARE_STAT_LAYER_OPACITIES}
			theme={MOCK_PUBLIC_SHARE_ARCHETYPE.theme}
		/>
	);
}

function getMockPublicShareArchetype() {
	const archetype = WRAPPED_ARCHETYPE_CARD_THEMES.find(
		(candidate) => candidate.id === "roadrunner",
	);

	if (!archetype) {
		throw new Error("Wrapped public mock archetype is missing.");
	}

	return archetype;
}
