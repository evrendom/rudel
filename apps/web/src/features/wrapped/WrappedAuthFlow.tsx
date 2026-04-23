import { ArrowLeft } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { LoginForm } from "@/features/auth/LoginForm";
import { SignupForm } from "@/features/auth/SignupForm";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import { WrappedRouteStageShell } from "./route-stage-shell";
import { WRAPPED_ARCHETYPE_CARD_THEMES } from "./team-card/archetypes";
import {
	WrappedTeamMemberCard,
	type WrappedTeamMemberCardHeaderMetric,
	type WrappedTeamMemberCardStatItem,
} from "./team-card/card";

type WrappedAuthMode = "login" | "signup" | null;

const AUTH_PLAYER_CARD_THEME =
	WRAPPED_ARCHETYPE_CARD_THEMES.find(({ id }) => id === "npc") ??
	WRAPPED_ARCHETYPE_CARD_THEMES[0];

const AUTH_PLAYER_CARD_SHELL_STYLE = {
	"--team-lineup-card-grain-opacity": "0",
	"--team-lineup-card-grain-size": "40px",
} as CSSProperties;

const AUTH_PLAYER_CARD_ROW: TeamPageMemberRow = {
	userId: "wrapped-auth-preview",
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

const AUTH_PLAYER_CARD_HEADER_LEFT_METRIC: WrappedTeamMemberCardHeaderMetric = {
	title: "$182 estimated spend",
	value: "$182",
};

const AUTH_PLAYER_CARD_HEADER_RIGHT_METRIC: WrappedTeamMemberCardHeaderMetric =
	{
		title: "Smooth Operator",
		value: "Smooth Operator",
	};

const AUTH_PLAYER_CARD_STAT_ITEMS = [
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

const WRAPPED_AUTH_INTRO_TITLE = (
	<span className="mymind-wrapped-auth-intro-title">
		<span className="mymind-wrapped-auth-intro-title__line">
			Find out what your
		</span>
		<span className="mymind-wrapped-auth-intro-title__line">
			Claude Code / Codex
		</span>
		<span className="mymind-wrapped-auth-intro-title__line">
			sessions tell about you
		</span>
	</span>
);

interface WrappedAuthIntentProps {
	onChooseMode: (mode: Exclude<WrappedAuthMode, null>) => void;
}

function WrappedAuthIntent(props: WrappedAuthIntentProps) {
	const { onChooseMode } = props;

	return (
		<div className="mymind-wrapped-auth-panel mymind-wrapped-auth-panel--intro">
			<WrappedAuthPlayerCardPreview />
			<div className="mymind-wrapped-auth-panel__actions">
				<button
					type="button"
					className="mymind-wrapped-entry-action h-11 rounded-full px-7 [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold"
					onClick={() => onChooseMode("signup")}
				>
					Create account
				</button>
				<button
					type="button"
					className="mymind-wrapped-secondary-action rounded-full [font-family:var(--app-font-heading)] text-[1.0625rem] font-semibold"
					onClick={() => onChooseMode("login")}
				>
					Log in
				</button>
			</div>
		</div>
	);
}

function WrappedAuthPlayerCardPreview() {
	return (
		<section
			aria-label="Wrapped player card preview"
			className="mymind-wrapped-auth-card-preview team-lineup-surface-scope"
		>
			<div className="team-lineup-card-tilt-stage w-full max-w-[14.75rem]">
				<div
					data-tilt-active="true"
					className="team-lineup-card-tilt-shell mymind-wrapped-auth-card-preview__tilt"
				>
					<div className="grid justify-center">
						<WrappedTeamMemberCard
							headerLeftMetric={AUTH_PLAYER_CARD_HEADER_LEFT_METRIC}
							headerRightMetric={AUTH_PLAYER_CARD_HEADER_RIGHT_METRIC}
							hideHeaderLogo
							layoutPreset="team-card-preview"
							mediaPanelClassName="mx-auto"
							row={AUTH_PLAYER_CARD_ROW}
							shellClassName={AUTH_PLAYER_CARD_THEME.shellClassName}
							shellStyle={AUTH_PLAYER_CARD_SHELL_STYLE}
							statItems={AUTH_PLAYER_CARD_STAT_ITEMS}
							statTileClassName=""
							theme={AUTH_PLAYER_CARD_THEME.theme}
						/>
					</div>
				</div>
			</div>
		</section>
	);
}

export function WrappedAuthFlow() {
	const [mode, setMode] = useState<WrappedAuthMode>(null);

	return (
		<WrappedRouteStageShell
			description={getWrappedAuthDescription(mode)}
			leadingControl={
				mode ? (
					<button
						type="button"
						aria-label="Go back"
						className="mymind-wrapped-back-button rounded-full transition-colors"
						onClick={() => setMode(null)}
					>
						<ArrowLeft className="size-4" />
					</button>
				) : null
			}
			objectClassName={
				mode
					? "mymind-wrapped-entry-stage__object--auth-form"
					: "mymind-wrapped-entry-stage__object--auth-intro"
			}
			stage={renderWrappedAuthStage(mode, setMode)}
			stageClassName="mymind-wrapped-entry-stage--auth"
			title={getWrappedAuthTitle(mode)}
			titleClassName={
				mode ? undefined : "mymind-wrapped-entry-stage__headline--auth-intro"
			}
		/>
	);
}

function renderWrappedAuthStage(
	mode: WrappedAuthMode,
	setMode: (mode: WrappedAuthMode) => void,
) {
	if (mode === "login") {
		return (
			<LoginForm
				variant="wrapped-story"
				onSwitchToSignup={() => setMode("signup")}
			/>
		);
	}

	if (mode === "signup") {
		return (
			<SignupForm
				variant="wrapped-story"
				onSwitchToLogin={() => setMode("login")}
			/>
		);
	}

	return <WrappedAuthIntent onChooseMode={setMode} />;
}

function getWrappedAuthDescription(mode: WrappedAuthMode) {
	if (mode === "login") {
		return "Use your Rudel account to continue.";
	}

	if (mode === "signup") {
		return "Create your Rudel account to continue.";
	}

	return undefined;
}

function getWrappedAuthTitle(mode: WrappedAuthMode) {
	if (mode === "login") {
		return "Log in";
	}

	if (mode === "signup") {
		return "Create account";
	}

	return WRAPPED_AUTH_INTRO_TITLE;
}
