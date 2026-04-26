import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import { WRAPPED_ARCHETYPE_CARD_THEMES } from "@/features/wrapped/team-card/archetypes";
import { buildWrappedTeamCardBackMetrics } from "@/features/wrapped/team-card/back-metrics";
import {
	WrappedTeamCardRevealStage,
	WrappedTeamCardShareStage,
} from "@/features/wrapped/team-card/final-stages";
import { WrappedTeamCardSharePreview } from "@/features/wrapped/team-card/share-preview";
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
					layout: _layout,
					layoutId: _layoutId,
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
	WrappedTeamMemberCard: ({
		headerRightMetric,
	}: {
		headerRightMetric?: { value: string };
	}) => (
		<div
			data-header-right={headerRightMetric?.value ?? ""}
			data-testid="wrapped-team-card"
		/>
	),
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
	handlePointerEnter: vi.fn(),
	handlePointerLeave: vi.fn(),
	handlePointerMove: vi.fn(),
	isGyroscopePromptVisible: false,
	isGyroscopeSupported: false,
};

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("buildWrappedTeamCardBackMetrics", () => {
	it("rounds token metrics to compact second-digit labels", () => {
		const metrics = buildWrappedTeamCardBackMetrics({
			onboardingMetrics: {
				...onboardingMetrics,
				totalTokens: 1_920_000,
			},
			row: {
				...row,
				inputTokens: 1_180_000,
				outputTokens: 740_000,
				totalTokens: 1_920_000,
			},
			shareCardCreatedAtLabel: "04/24/2026",
		});

		expect(
			metrics.find((metric) => metric.label === "Input/output tokens")?.value,
		).toBe("1.2M/740K");
		expect(
			metrics.find((metric) => metric.label === "Total tokens")?.value,
		).toBe("1.9M");
	});
});

describe("WrappedTeamCardSharePreview", () => {
	it("renders every archetype theme without crashing", () => {
		for (const archetype of WRAPPED_ARCHETYPE_CARD_THEMES) {
			const { unmount } = render(
				<WrappedTeamCardSharePreview
					appearance={{ layoutMode: "front", showArchetypeLabel: true }}
					headerLeftMetric={{ title: "$42 estimated spend", value: "$42" }}
					headerRightMetric={{
						title: archetype.displayLabel,
						value: archetype.displayLabel,
					}}
					row={row}
					shareCardCreatedAtLabel="04/24/2026"
					shellClassName={archetype.shellClassName}
					shellStyle={{}}
					statItems={[]}
					theme={archetype.theme}
				/>,
			);

			expect(screen.getByTestId("wrapped-team-card")).toHaveAttribute(
				"data-header-right",
				archetype.displayLabel,
			);

			unmount();
		}
	});

	it("shows the archetype on the one-card variant without caption text", () => {
		const { container } = render(
			<WrappedTeamCardSharePreview
				appearance={{ layoutMode: "front", showArchetypeLabel: true }}
				headerLeftMetric={{ title: "$42 estimated spend", value: "$42" }}
				headerRightMetric={{
					title: "Smooth Operator",
					value: "Smooth Operator",
				}}
				row={row}
				shareCardCreatedAtLabel="04/24/2026"
				shellClassName="bg-sky-200"
				shellStyle={{}}
				statItems={[]}
				theme="light"
			/>,
		);

		expect(container.querySelectorAll("p")).toHaveLength(0);
		expect(screen.getByTestId("wrapped-team-card")).toHaveAttribute(
			"data-header-right",
			"Smooth Operator",
		);
	});

	it("shows the archetype on the two-card variant without caption text", () => {
		const { container } = render(
			<WrappedTeamCardSharePreview
				appearance={{ layoutMode: "front_back", showArchetypeLabel: true }}
				backMetrics={buildWrappedTeamCardBackMetrics({
					onboardingMetrics,
					row,
					shareCardCreatedAtLabel: "04/24/2026",
				})}
				headerLeftMetric={{ title: "$42 estimated spend", value: "$42" }}
				headerRightMetric={{
					title: "Smooth Operator",
					value: "Smooth Operator",
				}}
				row={row}
				shareCardCreatedAtLabel="04/24/2026"
				shellClassName="bg-sky-200"
				shellStyle={{}}
				statItems={[]}
				theme="light"
			/>,
		);

		expect(container.querySelectorAll("p")).toHaveLength(0);
		expect(screen.getByTestId("wrapped-team-card")).toHaveAttribute(
			"data-header-right",
			"Smooth Operator",
		);
		expect(screen.getByText("Input/output tokens")).toBeInTheDocument();
	});
});

describe("WrappedTeamCardShareStage", () => {
	it("shows a spinner in the download button while export is pending", () => {
		render(
			<WrappedTeamCardShareStage
				appearance={{ layoutMode: "front_back", showArchetypeLabel: true }}
				backMetrics={buildWrappedTeamCardBackMetrics({
					onboardingMetrics,
					row,
					shareCardCreatedAtLabel: "04/24/2026",
				})}
				headerLeftMetric={{ title: "$42 estimated spend", value: "$42" }}
				headerRightMetric={{
					title: "Smooth Operator",
					value: "Smooth Operator",
				}}
				isDownloadPending
				onAppearanceChange={vi.fn()}
				onBack={vi.fn()}
				onContinueToDashboard={vi.fn()}
				onCopy={vi.fn()}
				onDownload={vi.fn()}
				onShare={vi.fn()}
				row={row}
				shareCardCreatedAtLabel="04/24/2026"
				sharePostRef={{ current: null }}
				shellClassName="bg-sky-200"
				shellStyle={{}}
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
			/>,
		);

		const downloadButton = screen.getByRole("button", {
			name: "Downloading PNG",
		});

		expect(downloadButton).toBeDisabled();
		expect(downloadButton).toHaveAttribute("aria-busy", "true");
		expect(downloadButton.querySelector(".animate-spin")).not.toBeNull();
	});
});

describe("WrappedTeamCardRevealStage", () => {
	it("renders every archetype theme in the reveal stage", () => {
		for (const archetype of WRAPPED_ARCHETYPE_CARD_THEMES) {
			const { unmount } = render(
				<WrappedTeamCardRevealStage
					activeArchetype={archetype}
					headerLeftMetric={{
						title: "$42 estimated spend",
						value: "$42",
					}}
					headerRightMetric={{
						title: archetype.displayLabel,
						value: archetype.displayLabel,
					}}
					isPreviewPostVisible={false}
					onboardingMetrics={onboardingMetrics}
					onPreviewPost={vi.fn()}
					onRevealComplete={vi.fn()}
					row={row}
					shellClassName={archetype.shellClassName}
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
					theme={archetype.theme}
					tiltController={tiltController}
				/>,
			);

			expect(
				screen.getByTestId("wrapped-team-card").closest("[data-card-state]"),
			).toHaveAttribute("data-card-state", "waiting");

			unmount();
		}
	});

	it("drops the back of the card first and flips to the front on click", () => {
		vi.useFakeTimers();
		const onRevealComplete = vi.fn();

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
				isPreviewPostVisible={false}
				onboardingMetrics={onboardingMetrics}
				onPreviewPost={vi.fn()}
				onRevealComplete={onRevealComplete}
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

		expect(screen.queryByText("Smooth by default.")).toBeNull();
		expect(
			screen.getByTestId("wrapped-team-card").closest("[data-card-state]"),
		).toHaveAttribute("data-card-state", "dropped");
		expect(onRevealComplete).not.toHaveBeenCalled();

		act(() => {
			vi.advanceTimersByTime(1_020);
		});

		expect(onRevealComplete).toHaveBeenCalledTimes(1);
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
		expect(screen.getByText("60K/64K")).toBeInTheDocument();
		expect(screen.getByText("Total tokens")).toBeInTheDocument();
		expect(screen.getByText("120K")).toBeInTheDocument();
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

	it("uses the footer action to turn the card around before continuing", () => {
		vi.useFakeTimers();
		const onPreviewPost = vi.fn();

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
				isPreviewPostVisible
				onboardingMetrics={onboardingMetrics}
				onPreviewPost={onPreviewPost}
				onRevealComplete={vi.fn()}
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

		act(() => {
			vi.advanceTimersByTime(1_700 + 1_900 + 1_250 + 1_020);
		});

		const turnAroundButton = screen.getByRole("button", {
			name: "Continue",
		});
		fireEvent.click(turnAroundButton);

		expect(onPreviewPost).not.toHaveBeenCalled();
		expect(
			screen.getByRole("button", {
				name: "Show back of card",
			}),
		).toHaveAttribute("data-card-face", "front");

		act(() => {
			vi.advanceTimersByTime(680);
		});

		const continueButton = screen.getByRole("button", {
			name: "Continue",
		});
		expect(continueButton).toBeEnabled();

		fireEvent.click(continueButton);

		expect(onPreviewPost).toHaveBeenCalledTimes(1);
	});

	it("keeps the footer action as continue after the user has revealed the front", () => {
		vi.useFakeTimers();
		const onPreviewPost = vi.fn();

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
				isPreviewPostVisible
				onboardingMetrics={onboardingMetrics}
				onPreviewPost={onPreviewPost}
				onRevealComplete={vi.fn()}
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

		act(() => {
			vi.advanceTimersByTime(1_700 + 1_900 + 1_250 + 1_020);
		});

		fireEvent.click(
			screen.getByRole("button", {
				name: "Reveal front of card",
			}),
		);

		act(() => {
			vi.advanceTimersByTime(680);
		});

		expect(
			screen.getByRole("button", {
				name: "Continue",
			}),
		).toBeEnabled();

		fireEvent.click(
			screen.getByRole("button", {
				name: "Show back of card",
			}),
		);

		act(() => {
			vi.advanceTimersByTime(680);
		});

		expect(
			screen.getByRole("button", {
				name: "Continue",
			}),
		).toBeEnabled();
		expect(
			screen.queryByRole("button", {
				name: "Turn around",
			}),
		).not.toBeInTheDocument();

		fireEvent.click(
			screen.getByRole("button", {
				name: "Continue",
			}),
		);

		expect(onPreviewPost).toHaveBeenCalledTimes(1);
	});
});
