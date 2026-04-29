import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import { WRAPPED_ARCHETYPE_CARD_THEMES } from "@/features/wrapped/team-card/archetypes";
import { buildWrappedTeamCardBackMetrics } from "@/features/wrapped/team-card/back-metrics";
import {
	WrappedTeamCardPublicStage,
	WrappedTeamCardRevealStage,
	WrappedTeamCardShareStage,
} from "@/features/wrapped/team-card/final-stages";
import { DEFAULT_WRAPPED_SHARE_APPEARANCE } from "@/features/wrapped/team-card/share-appearance";
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
			aside: createPrimitive("aside"),
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
	distinctProjectCount: 6,
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

const REVEAL_INTRO_READY_MS = 2_140;
const REVEAL_CARD_DROP_DURATION_MS = 1_020;
const REVEAL_CARD_FLIP_DURATION_MS = 680;
const REVEAL_EXIT_TO_SHARE_MS = 580;

function advanceRevealIntroToGate() {
	act(() => {
		vi.advanceTimersByTime(REVEAL_INTRO_READY_MS);
	});
}

function continueFromRevealIntroGate() {
	fireEvent.click(
		screen.getByRole("button", {
			name: "Continue",
		}),
	);
}

function finishRevealCardDrop() {
	act(() => {
		vi.advanceTimersByTime(REVEAL_CARD_DROP_DURATION_MS);
	});
}

afterEach(() => {
	vi.clearAllMocks();
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
	it("selects the two-card post variant by default", () => {
		render(
			<WrappedTeamCardShareStage
				appearance={DEFAULT_WRAPPED_SHARE_APPEARANCE}
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
				onAppearanceChange={vi.fn()}
				onBack={vi.fn()}
				onContinueToDashboard={vi.fn()}
				onCopy={vi.fn()}
				onCopyProfileUrl={vi.fn()}
				onDownload={vi.fn()}
				onShare={vi.fn()}
				profileUrlLabel="rudel.ai/wrapped/public-card"
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

		expect(screen.getByRole("button", { name: "One card" })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
		expect(screen.getByRole("button", { name: "Two cards" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(screen.getByText("Input/output tokens")).toBeInTheDocument();
	});

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
				onCopyProfileUrl={vi.fn()}
				onDownload={vi.fn()}
				onShare={vi.fn()}
				profileUrlLabel="rudel.ai/wrapped/public-card"
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

	it("shows a spinner in the X share button while copy is pending", () => {
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
				isSharePending
				onAppearanceChange={vi.fn()}
				onBack={vi.fn()}
				onContinueToDashboard={vi.fn()}
				onCopy={vi.fn()}
				onCopyProfileUrl={vi.fn()}
				onDownload={vi.fn()}
				onShare={vi.fn()}
				profileUrlLabel="rudel.ai/wrapped/public-card"
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

		const shareButton = screen.getByRole("button", {
			name: "Copying image...",
		});

		expect(shareButton).toBeDisabled();
		expect(shareButton).toHaveAttribute("aria-busy", "true");
		expect(shareButton.querySelector(".animate-spin")).not.toBeNull();
	});

	it("shows a copy profile URL bar below the X share button", () => {
		const onCopyProfileUrl = vi.fn();
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
				onAppearanceChange={vi.fn()}
				onBack={vi.fn()}
				onContinueToDashboard={vi.fn()}
				onCopy={vi.fn()}
				onCopyProfileUrl={onCopyProfileUrl}
				onDownload={vi.fn()}
				onShare={vi.fn()}
				profileUrlLabel="rudel.ai/wrapped/public-card"
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

		const shareButton = screen.getByRole("button", { name: "Share on X" });
		const profileUrlButton = screen.getByRole("button", {
			name: "Copy profile URL",
		});
		const dashboardButton = screen.getByRole("button", {
			name: "Continue to dashboard",
		});

		expect(
			screen.getByText("rudel.ai/wrapped/public-card"),
		).toBeInTheDocument();
		expect(shareButton).toHaveTextContent(/^Share on$/);
		expect(shareButton.querySelector("svg")).not.toBeNull();
		expect(shareButton.compareDocumentPosition(profileUrlButton)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);
		expect(profileUrlButton.compareDocumentPosition(dashboardButton)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		);

		fireEvent.click(profileUrlButton);

		expect(onCopyProfileUrl).toHaveBeenCalledTimes(1);
	});

	it("shows a spinner in the profile URL copy button while copy is pending", () => {
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
				isProfileUrlCopyPending
				onAppearanceChange={vi.fn()}
				onBack={vi.fn()}
				onContinueToDashboard={vi.fn()}
				onCopy={vi.fn()}
				onCopyProfileUrl={vi.fn()}
				onDownload={vi.fn()}
				onShare={vi.fn()}
				profileUrlLabel="Creating link..."
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

		const profileUrlButton = screen.getByRole("button", {
			name: "Copying URL...",
		});

		expect(profileUrlButton).toBeDisabled();
		expect(profileUrlButton).toHaveAttribute("aria-busy", "true");
		expect(profileUrlButton.querySelector(".animate-spin")).not.toBeNull();
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

	it("renders the Maniac reveal copy with activity, repo, and session density metrics", () => {
		vi.useFakeTimers();

		render(
			<WrappedTeamCardRevealStage
				activeArchetype={{
					displayLabel: "Maniac",
					id: "maniac",
					kind: "taxonomy",
					classifierKey: "maniac",
					shellClassName: "bg-red-200",
					theme: "light",
				}}
				headerLeftMetric={{
					title: "$42 estimated spend",
					value: "$42",
				}}
				headerRightMetric={{
					title: "Maniac",
					value: "Maniac",
				}}
				isPreviewPostVisible={false}
				onboardingMetrics={onboardingMetrics}
				onPreviewPost={vi.fn()}
				onRevealComplete={vi.fn()}
				row={row}
				shellClassName="bg-red-200"
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

		advanceRevealIntroToGate();

		expect(
			screen.getByText(
				"12 out of 180 days. 6 repos. Most people are consistent. Some people are everywhere at once. You're both. Somehow. 3.1 sessions every time you're active. We're a little scared honestly. Pls don't hurt someone",
			),
		).toBeInTheDocument();
	});

	it("renders the Company Card title and reveal copy with spend metrics", () => {
		vi.useFakeTimers();

		render(
			<WrappedTeamCardRevealStage
				activeArchetype={{
					displayLabel: "Company Card",
					id: "company_card",
					kind: "taxonomy",
					classifierKey: "company_card",
					shellClassName: "bg-yellow-200",
					theme: "light",
				}}
				headerLeftMetric={{
					title: "$44 estimated spend",
					value: "$44",
				}}
				headerRightMetric={{
					title: "Company Card",
					value: "Company Card",
				}}
				isPreviewPostVisible={false}
				onboardingMetrics={{
					...onboardingMetrics,
					commitRate: 48,
				}}
				onPreviewPost={vi.fn()}
				onRevealComplete={vi.fn()}
				row={{
					...row,
					cost: 44,
					totalSessions: 8,
				}}
				shellClassName="bg-yellow-200"
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
			vi.advanceTimersByTime(850);
		});

		expect(
			screen.getByRole("heading", {
				name: "Avery Chen, you got the Company Card?",
			}),
		).toBeInTheDocument();
		expect(
			document.querySelector(".mymind-wrapped-final-stage__intro-accent")
				?.childNodes[0]?.textContent,
		).toBe("Company Card");
		expect(
			document.querySelector(".mymind-wrapped-final-stage__intro-accent")
				?.nextElementSibling?.textContent,
		).toBe("?");

		act(() => {
			vi.advanceTimersByTime(REVEAL_INTRO_READY_MS - 850);
		});

		expect(
			screen.getByText(
				"8 sessions. 48% of them shipped something. $5.50 a session. $44 in total. Not saying it's a problem. We don't judge. Spend as much as you want. Dario & Sam are happy to have you.",
			),
		).toBeInTheDocument();
	});

	it("renders the ADHD Brain title and reveal copy with repo and commit metrics", () => {
		vi.useFakeTimers();

		render(
			<WrappedTeamCardRevealStage
				activeArchetype={{
					displayLabel: "ADHD Brain",
					id: "adhd_brain",
					kind: "taxonomy",
					classifierKey: "adhd_brain",
					shellClassName: "bg-fuchsia-200",
					theme: "light",
				}}
				headerLeftMetric={{
					title: "$42 estimated spend",
					value: "$42",
				}}
				headerRightMetric={{
					title: "ADHD Brain",
					value: "ADHD Brain",
				}}
				isPreviewPostVisible={false}
				onboardingMetrics={{
					...onboardingMetrics,
					commitRate: 48,
					distinctProjectCount: 6,
				}}
				onPreviewPost={vi.fn()}
				onRevealComplete={vi.fn()}
				row={row}
				shellClassName="bg-fuchsia-200"
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
			vi.advanceTimersByTime(850);
		});

		expect(
			screen.getByRole("heading", {
				name: "Avery Chen, you're an ADHD Brain.",
			}),
		).toBeInTheDocument();

		act(() => {
			vi.advanceTimersByTime(REVEAL_INTRO_READY_MS - 850);
		});

		expect(
			screen.getByText(
				"12 out of 180 days. 6 repos. 48% of sessions shipped something. You'd call yourself a DaVinci. We're just worried about the 6 repos.",
			),
		).toBeInTheDocument();
	});

	it("renders the Hit and Runner title and reveal copy with session, repo, and commit metrics", () => {
		vi.useFakeTimers();

		render(
			<WrappedTeamCardRevealStage
				activeArchetype={{
					displayLabel: "Hit and Runner",
					id: "hit_and_runner",
					kind: "taxonomy",
					classifierKey: "hit_and_runner",
					shellClassName: "bg-orange-200",
					theme: "light",
				}}
				headerLeftMetric={{
					title: "$42 estimated spend",
					value: "$42",
				}}
				headerRightMetric={{
					title: "Hit and Runner",
					value: "Hit and Runner",
				}}
				isPreviewPostVisible={false}
				onboardingMetrics={{
					...onboardingMetrics,
					avgSessionMin: 24,
					commitRate: 48,
					distinctProjectCount: 6,
				}}
				onPreviewPost={vi.fn()}
				onRevealComplete={vi.fn()}
				row={row}
				shellClassName="bg-orange-200"
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
			vi.advanceTimersByTime(850);
		});

		expect(
			screen.getByRole("heading", {
				name: "Avery Chen, you're a Hit and Runner.",
			}),
		).toBeInTheDocument();

		act(() => {
			vi.advanceTimersByTime(REVEAL_INTRO_READY_MS - 850);
		});

		expect(
			screen.getByText(
				"24 minutes average. 6 repos. 48% of sessions shipped something. Veni, vidi, commit. In at 24 minutes. Out before anyone noticed. You could be a hitman.",
			),
		).toBeInTheDocument();
	});

	it("renders the Cheapskate title and reveal copy with spend and commit metrics", () => {
		vi.useFakeTimers();

		render(
			<WrappedTeamCardRevealStage
				activeArchetype={{
					displayLabel: "Cheapskate",
					id: "cheapskate",
					kind: "taxonomy",
					classifierKey: "cheapskate",
					shellClassName: "bg-lime-200",
					theme: "light",
				}}
				headerLeftMetric={{
					title: "$44 estimated spend",
					value: "$44",
				}}
				headerRightMetric={{
					title: "Cheapskate",
					value: "Cheapskate",
				}}
				isPreviewPostVisible={false}
				onboardingMetrics={{
					...onboardingMetrics,
					commitRate: 48,
				}}
				onPreviewPost={vi.fn()}
				onRevealComplete={vi.fn()}
				row={{
					...row,
					cost: 44,
					totalSessions: 8,
				}}
				shellClassName="bg-lime-200"
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
			vi.advanceTimersByTime(850);
		});

		expect(
			screen.getByRole("heading", {
				name: "Avery Chen, you're a Cheapskate.",
			}),
		).toBeInTheDocument();

		act(() => {
			vi.advanceTimersByTime(REVEAL_INTRO_READY_MS - 850);
		});

		expect(
			screen.getByText(
				"$5.50 a session. 48% of those shipped something. Mr. Krabs is very proud of you. But you've never once picked up the check.",
			),
		).toBeInTheDocument();
	});

	it("renders the Tourist title and reveal copy with sessions, commit, and spend metrics", () => {
		vi.useFakeTimers();

		render(
			<WrappedTeamCardRevealStage
				activeArchetype={{
					displayLabel: "Tourist",
					id: "tourist",
					kind: "taxonomy",
					classifierKey: "tourist",
					shellClassName: "bg-emerald-200",
					theme: "light",
				}}
				headerLeftMetric={{
					title: "$44 estimated spend",
					value: "$44",
				}}
				headerRightMetric={{
					title: "Tourist",
					value: "Tourist",
				}}
				isPreviewPostVisible={false}
				onboardingMetrics={{
					...onboardingMetrics,
					commitRate: 48,
				}}
				onPreviewPost={vi.fn()}
				onRevealComplete={vi.fn()}
				row={{
					...row,
					cost: 44,
					totalSessions: 8,
				}}
				shellClassName="bg-emerald-200"
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
			vi.advanceTimersByTime(850);
		});

		expect(
			screen.getByRole("heading", {
				name: "Avery Chen, you're a Tourist.",
			}),
		).toBeInTheDocument();

		act(() => {
			vi.advanceTimersByTime(REVEAL_INTRO_READY_MS - 850);
		});

		expect(
			screen.getByText(
				"8 sessions. 48% shipped something. $5.50 a session. At least you tried it out! There's no prize for participation though",
			),
		).toBeInTheDocument();
	});

	it("renders the Obsessed title and reveal copy with repo, activity, commit, and cost metrics", () => {
		vi.useFakeTimers();

		render(
			<WrappedTeamCardRevealStage
				activeArchetype={{
					displayLabel: "Obsessed",
					id: "obsessed",
					kind: "taxonomy",
					classifierKey: "obsessed",
					shellClassName: "bg-black",
					theme: "dark",
				}}
				headerLeftMetric={{
					title: "$44 estimated spend",
					value: "$44",
				}}
				headerRightMetric={{
					title: "Obsessed",
					value: "Obsessed",
				}}
				isPreviewPostVisible={false}
				onboardingMetrics={{
					...onboardingMetrics,
					commitRate: 48,
					distinctProjectCount: 1,
				}}
				onPreviewPost={vi.fn()}
				onRevealComplete={vi.fn()}
				row={{
					...row,
					cost: 44,
					totalSessions: 8,
				}}
				shellClassName="bg-black"
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
				theme="dark"
				tiltController={tiltController}
			/>,
		);

		act(() => {
			vi.advanceTimersByTime(850);
		});

		expect(
			screen.getByRole("heading", {
				name: "Avery Chen, you're Obsessed.",
			}),
		).toBeInTheDocument();

		act(() => {
			vi.advanceTimersByTime(REVEAL_INTRO_READY_MS - 850);
		});

		expect(
			screen.getByText(
				"1 repo. That's it. 12 out of 180 days. All of it, same place. 48% of your sessions shipped something. At $5.50 a session. May god help anyone who tries to distract you.",
			),
		).toBeInTheDocument();
	});

	it("drops the back of the card first and flips to the front on click", () => {
		vi.useFakeTimers();
		const onRevealComplete = vi.fn();

		render(
			<WrappedTeamCardRevealStage
				activeArchetype={{
					displayLabel: "Smooth Operator",
					id: "smooth_operator",
					kind: "taxonomy",
					classifierKey: "smooth_operator",
					shellClassName: "bg-sky-200",
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

		expect(
			screen.getByRole("heading", {
				name: "Avery Chen,",
			}),
		).toBeInTheDocument();
		expect(screen.getByText("Smooth Operator")).toHaveAttribute(
			"data-accent-state",
			"waiting",
		);
		expect(
			screen.getByTestId("wrapped-team-card").closest("[data-card-state]"),
		).toHaveAttribute("data-card-state", "waiting");

		act(() => {
			vi.advanceTimersByTime(850);
		});

		expect(
			screen.getByRole("heading", {
				name: "Avery Chen, you're a Smooth Operator.",
			}),
		).toBeInTheDocument();
		expect(screen.getByText("Smooth Operator")).toHaveAttribute(
			"data-accent-state",
			"waiting",
		);

		act(() => {
			vi.advanceTimersByTime(670);
		});

		expect(screen.getByText("Smooth Operator")).toHaveAttribute(
			"data-accent-state",
			"active",
		);
		expect(
			screen.getByTestId("wrapped-team-card").closest("[data-card-state]"),
		).toHaveAttribute("data-card-state", "waiting");

		act(() => {
			vi.advanceTimersByTime(620);
		});

		expect(
			screen.getByText(
				"12 out of 180 days. 24 minutes average. 88 at your longest. You start. You build. You stop. 3.1 sessions a day, $1.14 a session, no chaos. A little to bit too smooth... bit suspicious.",
			),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", {
				name: "Continue",
			}),
		).toBeEnabled();
		expect(
			screen.getByTestId("wrapped-team-card").closest("[data-card-state]"),
		).toHaveAttribute("data-card-state", "waiting");
		expect(onRevealComplete).not.toHaveBeenCalled();

		finishRevealCardDrop();

		expect(
			screen.getByTestId("wrapped-team-card").closest("[data-card-state]"),
		).toHaveAttribute("data-card-state", "waiting");
		expect(onRevealComplete).not.toHaveBeenCalled();

		continueFromRevealIntroGate();

		expect(screen.queryByRole("heading")).toBeNull();
		expect(
			screen.getByTestId("wrapped-team-card").closest("[data-card-state]"),
		).toHaveAttribute("data-card-state", "dropped");
		expect(onRevealComplete).not.toHaveBeenCalled();

		finishRevealCardDrop();

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
		expect(screen.getByText("FAV SKILL")).toBeInTheDocument();
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
		const revealedButton = screen.getByRole("button", {
			name: "Show back of card",
		});
		expect(revealedButton).toHaveAttribute("data-card-face", "front");
		expect(revealedButton).toBeDisabled();

		act(() => {
			vi.advanceTimersByTime(REVEAL_CARD_FLIP_DURATION_MS);
		});

		expect(
			screen.getByRole("button", {
				name: "Show back of card",
			}),
		).toBeEnabled();
		expect(
			screen.getByRole("heading", {
				name: "Avery Chen, you're a Smooth Operator.",
			}),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				"12 out of 180 days. 24 minutes average. 88 at your longest. You start. You build. You stop. 3.1 sessions a day, $1.14 a session, no chaos. A little to bit too smooth... bit suspicious.",
			),
		).toBeInTheDocument();

		fireEvent.click(
			screen.getByRole("button", {
				name: "Show back of card",
			}),
		);

		expect(tiltController.handlePointerLeave).toHaveBeenCalledTimes(2);
		expect(
			screen.getByRole("button", {
				name: "Show front of card",
			}),
		).toHaveAttribute("data-card-face", "back");
		expect(
			screen.getByRole("heading", {
				name: "Avery Chen, you're a Smooth Operator.",
			}),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				"12 out of 180 days. 24 minutes average. 88 at your longest. You start. You build. You stop. 3.1 sessions a day, $1.14 a session, no chaos. A little to bit too smooth... bit suspicious.",
			),
		).toBeInTheDocument();
	});

	it("uses the footer action to turn the card around before continuing", () => {
		vi.useFakeTimers();
		const onPreviewPost = vi.fn();

		render(
			<WrappedTeamCardRevealStage
				activeArchetype={{
					displayLabel: "Smooth Operator",
					id: "smooth_operator",
					kind: "taxonomy",
					classifierKey: "smooth_operator",
					shellClassName: "bg-sky-200",
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

		advanceRevealIntroToGate();
		continueFromRevealIntroGate();
		finishRevealCardDrop();

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
			vi.advanceTimersByTime(REVEAL_CARD_FLIP_DURATION_MS);
		});

		const continueButton = screen.getByRole("button", {
			name: "Continue",
		});
		expect(continueButton).toBeEnabled();

		fireEvent.click(continueButton);

		expect(onPreviewPost).not.toHaveBeenCalled();

		act(() => {
			vi.advanceTimersByTime(REVEAL_EXIT_TO_SHARE_MS);
		});

		expect(onPreviewPost).toHaveBeenCalledTimes(1);
	});

	it("flips a user-turned back card to the front before sharing", () => {
		vi.useFakeTimers();
		const onPreviewPost = vi.fn();

		render(
			<WrappedTeamCardRevealStage
				activeArchetype={{
					displayLabel: "Smooth Operator",
					id: "smooth_operator",
					kind: "taxonomy",
					classifierKey: "smooth_operator",
					shellClassName: "bg-sky-200",
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

		advanceRevealIntroToGate();
		continueFromRevealIntroGate();
		finishRevealCardDrop();

		fireEvent.click(
			screen.getByRole("button", {
				name: "Reveal front of card",
			}),
		);

		act(() => {
			vi.advanceTimersByTime(REVEAL_CARD_FLIP_DURATION_MS);
		});

		expect(
			screen.getByRole("button", {
				name: "Continue",
			}),
		).toBeEnabled();

		expect(
			screen.getByRole("button", {
				name: "Show back of card",
			}),
		).toBeEnabled();
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
				name: "Show back of card",
			}),
		);

		expect(
			screen.getByRole("button", {
				name: "Show front of card",
			}),
		).toHaveAttribute("data-card-face", "back");

		act(() => {
			vi.advanceTimersByTime(REVEAL_CARD_FLIP_DURATION_MS);
		});

		fireEvent.click(
			screen.getByRole("button", {
				name: "Continue",
			}),
		);

		expect(onPreviewPost).not.toHaveBeenCalled();
		expect(
			screen.getByRole("button", {
				name: "Show back of card",
			}),
		).toHaveAttribute("data-card-face", "front");

		act(() => {
			vi.advanceTimersByTime(REVEAL_CARD_FLIP_DURATION_MS - 1);
		});

		expect(onPreviewPost).not.toHaveBeenCalled();

		act(() => {
			vi.advanceTimersByTime(1);
		});

		expect(onPreviewPost).not.toHaveBeenCalled();

		act(() => {
			vi.advanceTimersByTime(REVEAL_EXIT_TO_SHARE_MS);
		});

		expect(onPreviewPost).toHaveBeenCalledTimes(1);
	});
});

describe("WrappedTeamCardPublicStage", () => {
	it("asks the viewer to turn around before showing the make yours action", () => {
		vi.useFakeTimers();
		const activeArchetype = {
			displayLabel: "Smooth Operator",
			id: "smooth_operator",
			kind: "taxonomy",
			classifierKey: "smooth_operator",
			shellClassName: "bg-sky-200",
			theme: "light",
		} as const;

		render(
			<WrappedTeamCardPublicStage
				action={<button type="button">Make yours</button>}
				activeArchetype={activeArchetype}
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
				tiltController={tiltController}
			/>,
		);

		expect(
			screen.getByRole("heading", {
				name: "Avery Chen is a Smooth Operator.",
			}),
		).toBeInTheDocument();

		const showBackButton = screen.getByRole("button", {
			name: "Show back of card",
		});
		expect(showBackButton).toHaveAttribute("data-card-face", "front");

		expect(
			screen.getByRole("button", {
				name: "Turn around",
			}),
		).toBeEnabled();
		expect(
			screen.queryByRole("button", {
				name: "Make yours",
			}),
		).not.toBeInTheDocument();

		fireEvent.click(
			screen.getByRole("button", {
				name: "Turn around",
			}),
		);

		expect(tiltController.handlePointerLeave).toHaveBeenCalledTimes(1);
		expect(
			screen.getByRole("button", {
				name: "Show front of card",
			}),
		).toHaveAttribute("data-card-face", "back");
		expect(
			screen.getByRole("button", {
				name: "Turn around",
			}),
		).toBeDisabled();

		act(() => {
			vi.advanceTimersByTime(REVEAL_CARD_FLIP_DURATION_MS);
		});

		expect(
			screen.getByRole("button", {
				name: "Show front of card",
			}),
		).toBeEnabled();
		expect(
			screen.getByRole("button", {
				name: "Make yours",
			}),
		).toBeEnabled();

		fireEvent.click(
			screen.getByRole("button", {
				name: "Show front of card",
			}),
		);

		expect(
			screen.queryByRole("button", {
				name: "Turn around",
			}),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", {
				name: "Make yours",
			}),
		).toBeEnabled();

		act(() => {
			vi.advanceTimersByTime(REVEAL_CARD_FLIP_DURATION_MS);
		});

		expect(
			screen.getByRole("button", {
				name: "Make yours",
			}),
		).toBeEnabled();
	});
});
