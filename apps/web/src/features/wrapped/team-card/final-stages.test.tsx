import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import { WrappedTeamCardRevealStage } from "@/features/wrapped/team-card/final-stages";
import type { WrappedCardTiltController } from "@/features/wrapped/team-card/tilt/use-card-tilt";

vi.mock("motion/react", async () => {
	const React = await import("react");
	const createPrimitive = (tag: string) =>
		React.forwardRef<
			HTMLElement,
			Record<string, unknown> & { children?: React.ReactNode }
		>(
			(
				{
					animate: _animate,
					children,
					exit: _exit,
					initial: _initial,
					transition: _transition,
					...props
				},
				ref,
			) =>
				React.createElement(
					tag,
					{ ...props, ref },
					children as React.ReactNode,
				),
		);

	return {
		AnimatePresence: ({
			children,
		}: {
			children?: React.ReactNode;
			initial?: boolean;
			mode?: string;
		}) => <>{children}</>,
		motion: {
			div: createPrimitive("div"),
			h1: createPrimitive("h1"),
			h2: createPrimitive("h2"),
			p: createPrimitive("p"),
			span: createPrimitive("span"),
		},
		useReducedMotion: () => false,
	};
});

vi.mock("@/features/wrapped/team-card/card", () => ({
	WrappedTeamMemberCard: () => <div data-testid="wrapped-team-card" />,
}));

Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: vi.fn(),
		addListener: vi.fn(),
		dispatchEvent: vi.fn(),
		removeEventListener: vi.fn(),
		removeListener: vi.fn(),
	})),
});

const onboardingMetrics: WrappedOnboardingMetrics = {
	activeDays: 12,
	avgSessionMin: 24,
	commitRate: 41,
	commitSessions: 15,
	daysSinceFirst: 180,
	estimatedCostTokenBasis: 0,
	estimatedCostUsd: 42,
	favoriteModel: "claude-sonnet-4",
	longestSessionMin: 88,
	modelByMonth: [],
	repoPulse: {
		entries: [],
		leadRepoName: null,
		totalRepos: 0,
		totalSessions: 0,
	},
	skillsAdoptionRate: 62.16,
	sourceSplit: [
		{ session_count: 21, session_share_percent: 57, source: "claude_code" },
		{ session_count: 16, session_share_percent: 43, source: "codex" },
	],
	subagentsAdoptionRate: 10.81,
	successRate: 64,
	topProjectName: "geneva",
	topProjectSessions: 17,
	topProjectTokens: 58_000,
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
	totalSessions: 37,
	totalTokens: 124_000,
};

const row: TeamPageMemberRow = {
	activeDays: 12,
	cost: 42,
	displayName: "Avery Chen",
	email: "avery@example.com",
	favoriteModel: "claude-sonnet-4",
	hasActivity: true,
	imageUrl: null,
	inputTokens: 60_000,
	lastActiveDate: "2026-04-21",
	outputTokens: 64_000,
	role: "Engineer",
	totalSessions: 37,
	totalTokens: 124_000,
	userId: "user_123",
};

const tiltController: WrappedCardTiltController = {
	cardTiltRef: { current: null },
	enableGyroscope: vi.fn(async () => {}),
	gyroscopeState: "idle",
	gyroscopeStatusMessage: null,
	handlePointerLeave: vi.fn(),
	handlePointerMove: vi.fn(),
	isGyroscopePromptVisible: false,
	isGyroscopeSupported: false,
};

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("WrappedTeamCardRevealStage", () => {
	it("drops the back of the card first and flips to the front on click", () => {
		vi.useFakeTimers();

		render(
			<WrappedTeamCardRevealStage
				activeArchetype={{
					displayLabel: "Smooth Operator",
					id: "npc",
					kind: "taxonomy",
					shellClassName: "bg-sky-200",
					taxonomyLabel: "NPC",
					theme: "light",
				}}
				headerLeftMetric={{
					title: "$42 estimated spend",
					value: "$42",
				}}
				headerRightMetric={{
					title: "Smooth Operator",
					value: "Smooth Operator",
				}}
				onboardingMetrics={onboardingMetrics}
				row={row}
				shellClassName="bg-sky-200"
				shellStyle={{}}
				shareCardCreatedAtLabel="04/24/2026"
				statItems={[]}
				statLayerOpacities={{
					rainbowShineOpacity: 0.3,
					textureOpacity: 1,
					tileBorderOpacity: 1,
					tileFillOpacity: 0.08,
					tileInsetShadowOpacity: 0.5,
					tileTopStrokeOpacity: 0.08,
				}}
				theme="light"
				tiltController={tiltController}
			/>,
		);

		expect(screen.queryByRole("heading")).toBeNull();
		expect(
			screen.getByText("Avery, you became the person the work could count on."),
		).toBeInTheDocument();
		expect(
			screen.getByTestId("wrapped-team-card").closest("[data-card-state]"),
		).toHaveAttribute("data-card-state", "waiting");

		act(() => {
			vi.advanceTimersByTime(1_700);
		});

		expect(
			screen.getByText(
				"37 sessions over 12 active days. 41% ended in a commit.",
			),
		).toBeInTheDocument();

		act(() => {
			vi.advanceTimersByTime(1_900);
		});

		expect(screen.getByText("Smooth by default.")).toBeInTheDocument();
		expect(
			screen.getByTestId("wrapped-team-card").closest("[data-card-state]"),
		).toHaveAttribute("data-card-state", "waiting");

		act(() => {
			vi.advanceTimersByTime(1_250);
		});

		expect(screen.getByText("Smooth by default.")).toBeInTheDocument();
		expect(
			screen.getByTestId("wrapped-team-card").closest("[data-card-state]"),
		).toHaveAttribute("data-card-state", "dropped");
		expect(
			screen
				.getByTestId("wrapped-team-card-back")
				.querySelector(".mymind-wrapped-team-card-back__content"),
		).not.toBeNull();
		expect(screen.getByRole("img", { name: "Rudel" })).toBeInTheDocument();
		expect(screen.queryByText("Last 365 days")).toBeNull();
		expect(screen.queryByText("Smooth Operator")).toBeNull();
		expect(screen.queryByText("Project: geneva")).toBeNull();
		expect(screen.queryByText("Skill: Refactor")).toBeNull();
		expect(screen.getByText("Claude/Codex %")).toBeInTheDocument();
		expect(screen.getByText("57%/43%")).toBeInTheDocument();
		expect(screen.getByText("Input/output tokens")).toBeInTheDocument();
		expect(screen.getByText("60000/64000")).toBeInTheDocument();
		expect(screen.getByText("Skills used")).toBeInTheDocument();
		expect(screen.getByText("23")).toBeInTheDocument();
		expect(screen.getByText("Favorite skill")).toBeInTheDocument();
		expect(screen.getByText("Refactor")).toBeInTheDocument();
		expect(screen.getByText("Commands used")).toBeInTheDocument();
		expect(screen.getAllByText("11")[0]).toBeInTheDocument();
		expect(screen.getByText("Sub-agents used")).toBeInTheDocument();
		expect(screen.getByText("Repos touched")).toBeInTheDocument();
		expect(screen.getByText("Spent")).toBeInTheDocument();
		expect(screen.getByText("Dollar per commit")).toBeInTheDocument();
		expect(screen.getByText("2.8")).toBeInTheDocument();
		expect(screen.getByText("04/24/2026")).toBeInTheDocument();
		const revealButton = screen.getByRole("button", {
			name: "Reveal front of card",
		});
		expect(revealButton).toHaveAttribute("data-card-face", "back");

		fireEvent.click(revealButton);

		expect(tiltController.handlePointerLeave).toHaveBeenCalledTimes(1);
		expect(
			screen.getByRole("button", {
				name: "Show back of card",
			}),
		).toHaveAttribute("data-card-face", "front");
	});
});
