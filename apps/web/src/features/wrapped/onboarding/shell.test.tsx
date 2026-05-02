import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WrappedTeamCardOnboarding } from "@/features/wrapped/onboarding/shell";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";

Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: vi.fn().mockImplementation((query: string) => ({
		matches: query.includes("prefers-reduced-motion"),
		media: query,
		onchange: null,
		addEventListener: vi.fn(),
		addListener: vi.fn(),
		dispatchEvent: vi.fn(),
		removeEventListener: vi.fn(),
		removeListener: vi.fn(),
	})),
});

afterEach(() => {
	vi.clearAllMocks();
});

describe("WrappedTeamCardOnboarding model step", () => {
	it("advances to the next step when only one source has sessions", async () => {
		const { container } = renderWrappedTeamCardOnboarding(
			buildOnboardingMetrics({
				modelByMonth: [],
				sourceSplit: [
					{
						session_count: 12,
						session_share_percent: 100,
						source: "claude_code",
					},
					{
						session_count: 0,
						session_share_percent: 0,
						source: "codex",
					},
				],
			}),
		);

		expect(
			await screen.findByRole("heading", { name: "Claude pilled." }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled();

		act(() => {
			fireEvent.click(screen.getByRole("button", { name: "Continue" }));
		});

		expect(
			container.querySelector(".mymind-wrapped-route--step-pulse"),
		).not.toBeNull();
		expect(
			screen.getByRole("button", {
				name: "Go to onboarding step 9: Check repo pulse",
			}),
		).toHaveAttribute("aria-current", "step");
	});

	it("advances to the next step when both sources have sessions", async () => {
		const { container } = renderWrappedTeamCardOnboarding(
			buildOnboardingMetrics({
				modelByMonth: [],
				sourceSplit: [
					{
						session_count: 12,
						session_share_percent: 60,
						source: "claude_code",
					},
					{
						session_count: 8,
						session_share_percent: 40,
						source: "codex",
					},
				],
			}),
		);

		expect(
			await screen.findByRole("heading", { name: "Claude pilled." }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled();

		act(() => {
			fireEvent.click(screen.getByRole("button", { name: "Continue" }));
		});

		expect(
			container.querySelector(".mymind-wrapped-route--step-pulse"),
		).not.toBeNull();
		expect(
			screen.getByRole("button", {
				name: "Go to onboarding step 9: Check repo pulse",
			}),
		).toHaveAttribute("aria-current", "step");
	});
});

function renderWrappedTeamCardOnboarding(
	onboardingMetrics: WrappedOnboardingMetrics,
) {
	return render(
		<MemoryRouter initialEntries={["/wrapped?step=model"]}>
			<WrappedTeamCardOnboarding
				displayName="Ada"
				finalStage={<div>Final card</div>}
				onboardingMetrics={onboardingMetrics}
				totalSessions={onboardingMetrics.totalSessions}
			/>
		</MemoryRouter>,
	);
}

function buildOnboardingMetrics(input: {
	modelByMonth: WrappedOnboardingMetrics["modelByMonth"];
	sourceSplit: WrappedOnboardingMetrics["sourceSplit"];
}): WrappedOnboardingMetrics {
	const totalSessions = input.sourceSplit.reduce(
		(sum, sourceEntry) => sum + sourceEntry.session_count,
		0,
	);

	return {
		activeDays: 4,
		avgSessionMin: 24,
		commitRate: null,
		commitSessions: 0,
		daysSinceFirst: 12,
		distinctProjectCount: 0,
		estimatedCostTokenBasis: 0,
		estimatedCostUsd: 0,
		favoriteModel: null,
		longestSessionMin: 72,
		modelByMonth: input.modelByMonth,
		repoPulse: {
			entries: [],
			leadRepoName: null,
			totalRepos: 0,
			totalSessions: 0,
		},
		skillsAdoptionRate: null,
		slashCommandsAdoptionRate: null,
		sourceSplit: input.sourceSplit,
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
		totalSessions,
		totalTokens: 120_000,
	};
}
