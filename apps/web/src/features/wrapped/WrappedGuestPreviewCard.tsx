import type { CSSProperties } from "react";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { WRAPPED_ARCHETYPE_CARD_THEMES } from "./team-card/archetypes";
import {
	WrappedTeamMemberCard,
	type WrappedTeamMemberCardHeaderMetric,
	type WrappedTeamMemberCardStatItem,
} from "./team-card/card";
import type { WrappedGuestPreviewProfile } from "./wrapped-guest-preview";

const WRAPPED_GUEST_CARD_THEME =
	WRAPPED_ARCHETYPE_CARD_THEMES.find(({ id }) => id === "npc") ??
	WRAPPED_ARCHETYPE_CARD_THEMES[0];

const WRAPPED_GUEST_CARD_SHELL_STYLE = {
	"--team-lineup-card-grain-opacity": "0",
	"--team-lineup-card-grain-size": "40px",
} as CSSProperties;

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
}

export function WrappedGuestPreviewCard(props: WrappedGuestPreviewCardProps) {
	const { profile } = props;
	const row = buildWrappedGuestCardRow(profile);

	return (
		<section
			aria-label="Wrapped player card preview"
			className="mymind-wrapped-auth-card-preview team-lineup-surface-scope"
		>
			<div className="team-lineup-card-tilt-stage mymind-wrapped-auth-card-preview__tilt-stage">
				<div
					data-tilt-active="true"
					className="team-lineup-card-tilt-shell mymind-wrapped-auth-card-preview__tilt"
				>
					<div className="grid justify-center">
						<WrappedTeamMemberCard
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
