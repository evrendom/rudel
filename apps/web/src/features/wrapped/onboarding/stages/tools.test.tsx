import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WrappedOnboardingToolsStage } from "@/features/wrapped/onboarding/stages/tools";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";

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

const emptyToolsMetrics: WrappedOnboardingMetrics = {
	activeDays: 0,
	avgSessionMin: null,
	commitRate: null,
	commitSessions: 0,
	daysSinceFirst: 0,
	distinctProjectCount: 0,
	estimatedCostTokenBasis: 0,
	estimatedCostUsd: 0,
	favoriteModel: null,
	longestSessionMin: null,
	modelByMonth: [],
	repoPulse: {
		entries: [],
		leadRepoName: null,
		totalRepos: 0,
		totalSessions: 0,
	},
	skillsAdoptionRate: null,
	slashCommandsAdoptionRate: null,
	sourceSplit: [],
	subagentsAdoptionRate: null,
	successRate: null,
	topProjectName: null,
	topProjectSessions: 0,
	topProjectTokens: 0,
	topSkills: [],
	topSlashCommand: null,
	topSlashCommandCount: null,
	topSlashCommands: [],
	topSubagent: null,
	topSubagentCount: null,
	topSubagents: [],
	totalSessions: 0,
	totalTokens: 0,
};

afterEach(() => {
	vi.clearAllTimers();
	vi.useRealTimers();
});

describe("WrappedOnboardingToolsStage", () => {
	it("renders the text-only base-model sequence and completes it", () => {
		vi.useFakeTimers();
		const onBaseModelSequenceComplete = vi.fn();

		render(
			<WrappedOnboardingToolsStage
				onBaseModelSequenceComplete={onBaseModelSequenceComplete}
				onboardingMetrics={emptyToolsMetrics}
				previewState="base-model"
			/>,
		);

		expect(
			screen.getByRole("heading", { name: /you used no slash commands/i }),
		).toBeInTheDocument();
		expect(screen.getByText("No subagents.")).toBeInTheDocument();
		expect(screen.getByText("Just vibes.")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Solo mode. Zero side quests" }),
		).toBeNull();
		expect(
			screen.getAllByText(
				(_, element) =>
					element?.textContent ===
					"You should try them out tho: slash commands and subagents.",
			),
		).toHaveLength(2);
		expect(
			screen.getByRole("link", { name: "slash commands" }),
		).toHaveAttribute(
			"href",
			"https://docs.anthropic.com/en/docs/claude-code/commands",
		);
		expect(screen.getByRole("link", { name: "subagents" })).toHaveAttribute(
			"href",
			"https://docs.anthropic.com/en/docs/claude-code/sub-agents",
		);

		act(() => {
			vi.runAllTimers();
		});

		expect(onBaseModelSequenceComplete).toHaveBeenCalledTimes(1);
	});

	it("renders tiny slash-command usage as the empty recap", () => {
		const onBaseModelSequenceComplete = vi.fn();

		render(
			<WrappedOnboardingToolsStage
				onBaseModelSequenceComplete={onBaseModelSequenceComplete}
				onboardingMetrics={{
					...emptyToolsMetrics,
					slashCommandsAdoptionRate: 5,
					topSlashCommand: "/fix",
					topSlashCommandCount: 1,
					topSlashCommands: [{ count: 1, name: "/fix" }],
					totalSessions: 20,
				}}
				previewState="live"
			/>,
		);

		expect(
			screen.getByRole("heading", {
				name: /you didn't use slash commands enough/i,
			}),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				"Use slash commands in at least 20% of sessions to create a slash-command recap.",
			),
		).toBeInTheDocument();
		expect(screen.getByText("404")).toBeInTheDocument();
		expect(screen.queryByText("No subagents.")).toBeNull();
		expect(
			screen.queryByRole("button", { name: "/fix. 5% of sessions" }),
		).toBeNull();
		expect(screen.queryByRole("link", { name: "slash commands" })).toBeNull();
		expect(onBaseModelSequenceComplete).toHaveBeenCalledTimes(1);
	});

	it("shows the zero slash-command recap before subagent-only copy", () => {
		vi.useFakeTimers();
		const onBaseModelSequenceComplete = vi.fn();

		render(
			<WrappedOnboardingToolsStage
				onBaseModelSequenceComplete={onBaseModelSequenceComplete}
				onboardingMetrics={{
					...emptyToolsMetrics,
					slashCommandsAdoptionRate: 0,
					subagentsAdoptionRate: 20,
					topSubagent: "Reviewer",
					topSubagentCount: 4,
					topSubagents: [{ count: 4, name: "Reviewer" }],
					totalSessions: 20,
				}}
				previewState="live"
			/>,
		);

		expect(
			screen.getByRole("heading", { name: /you used no slash commands/i }),
		).toBeInTheDocument();
		expect(screen.getByText("Subagents did show up.")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Reviewer. 20% of sessions" }),
		).toBeNull();

		act(() => {
			vi.runAllTimers();
		});

		expect(onBaseModelSequenceComplete).toHaveBeenCalledTimes(1);
	});

	it("hands the regular tools sequence off to a separate final scene", () => {
		vi.useFakeTimers();
		const onBaseModelSequenceComplete = vi.fn();

		render(
			<WrappedOnboardingToolsStage
				onBaseModelSequenceComplete={onBaseModelSequenceComplete}
				onboardingMetrics={emptyToolsMetrics}
				previewState="both"
			/>,
		);

		expect(
			screen.getByRole("heading", {
				name: "Your workflow grew beyond the base model.",
			}),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("heading", {
				name: "/fix led. Reviewer backed it up.",
			}),
		).toBeNull();

		act(() => {
			vi.runAllTimers();
		});

		expect(
			screen.getByRole("heading", {
				name: "/fix led. Reviewer backed it up.",
			}),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("heading", {
				name: "Your workflow grew beyond the base model.",
			}),
		).toBeNull();
		expect(
			screen.getByRole("button", { name: "/fix. 58% of sessions" }),
		).toBeInTheDocument();
		expect(onBaseModelSequenceComplete).toHaveBeenCalledTimes(1);
	});
});
