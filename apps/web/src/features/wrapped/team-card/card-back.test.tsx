import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TeamPageMemberRow } from "@/features/team/use-team-page-data";
import type { WrappedOnboardingMetrics } from "@/features/wrapped/onboarding/types";
import { buildWrappedTeamCardBackMetrics } from "@/features/wrapped/team-card/back-metrics";
import {
	WrappedTeamMemberCardBack,
	type WrappedTeamMemberCardBackMetric,
} from "@/features/wrapped/team-card/card-back";

describe("WrappedTeamMemberCardBack", () => {
	it("marks start-truncated metric values", () => {
		const metrics = [
			{
				label: "FAV SKILL",
				value: "extremely-long-favorite-skill-name",
				valueTruncation: "start",
			},
		] satisfies readonly WrappedTeamMemberCardBackMetric[];

		render(<WrappedTeamMemberCardBack metrics={metrics} />);

		const metricRow = screen.getByText("FAV SKILL").closest("tr");
		expect(metricRow).toHaveClass(
			"mymind-wrapped-team-card-back__metric-row--value-truncate-start",
		);
		expect(
			screen.getByText("extremely-long-favorite-skill-name"),
		).toHaveAttribute("title", "extremely-long-favorite-skill-name");
	});

	it("replaces the Rudel logo with the Decimal edition lockup", () => {
		render(<WrappedTeamMemberCardBack edition="decimal" metrics={[]} />);

		expect(screen.getByText("Member of")).toBeInTheDocument();
		const decimalsText = screen.getByText("Decimals");
		const badge = decimalsText.closest(
			".mymind-wrapped-team-card-edition-badge",
		);
		expect(decimalsText).toHaveClass("sr-only");
		expect(badge).not.toHaveTextContent("Member of");
		expect(badge?.querySelectorAll("img")).toHaveLength(2);
		expect(screen.queryByLabelText("Rudel")).toBeNull();
	});

	it("marks the favorite skill metric for start truncation", () => {
		const metrics = buildWrappedTeamCardBackMetrics({
			onboardingMetrics,
			row,
			shareCardCreatedAtLabel: "Apr 28, 2026",
		});

		expect(
			metrics.find((metric) => metric.label === "FAV SKILL"),
		).toMatchObject({
			value: "long-context-refactor-orchestration",
			valueTruncation: "start",
		});
	});

	it("hides low-signal skills and slash commands from the card back", () => {
		const metrics = buildWrappedTeamCardBackMetrics({
			onboardingMetrics: {
				...onboardingMetrics,
				skillsAdoptionRate: 19,
				slashCommandsAdoptionRate: 19,
				topSkills: [{ count: 38, name: "low-signal-skill" }],
				topSlashCommand: "/low-signal",
				topSlashCommandCount: 38,
				topSlashCommands: [{ count: 38, name: "/low-signal" }],
				totalSessions: 100,
			},
			row: {
				...row,
				totalSessions: 100,
			},
			shareCardCreatedAtLabel: "Apr 28, 2026",
		});

		expect(
			metrics.find((metric) => metric.label === "Skills used")?.value,
		).toBe("0");
		expect(
			metrics.find((metric) => metric.label === "FAV SKILL"),
		).toMatchObject({
			value: "Skill issue",
			valueTruncation: "start",
		});
		expect(
			metrics.find((metric) => metric.label === "Commands used")?.value,
		).toBe("0");
	});
});

const row = {
	activeDays: 2,
	cost: 4,
	displayName: "Maya Chen",
	email: null,
	favoriteModel: "claude-sonnet-4.5",
	hasActivity: true,
	imageUrl: null,
	inputTokens: 1000,
	lastActiveDate: "2026-04-28",
	outputTokens: 2000,
	role: "Engineer",
	totalSessions: 8,
	totalTokens: 3000,
	userId: "user-1",
} satisfies TeamPageMemberRow;

const onboardingMetrics = {
	activeDays: 2,
	avgSessionMin: 12,
	commitRate: 50,
	commitSessions: 4,
	daysSinceFirst: 8,
	distinctProjectCount: 1,
	estimatedCostTokenBasis: 3000,
	estimatedCostUsd: 4,
	favoriteModel: "claude-sonnet-4.5",
	longestSessionMin: 32,
	modelByMonth: [],
	repoPulse: {
		entries: [],
		leadRepoName: null,
		totalRepos: 1,
		totalSessions: 8,
	},
	skillsAdoptionRate: 50,
	slashCommandsAdoptionRate: 25,
	sourceSplit: [],
	subagentsAdoptionRate: 0,
	successRate: 75,
	topProjectName: "rudel",
	topProjectSessions: 8,
	topProjectTokens: 3000,
	topSkills: [{ count: 4, name: "long-context-refactor-orchestration" }],
	topSlashCommand: "/test",
	topSlashCommandCount: 2,
	topSlashCommands: [{ count: 2, name: "/test" }],
	topSubagent: null,
	topSubagentCount: 0,
	topSubagents: [],
	totalSessions: 8,
	totalTokens: 3000,
} satisfies WrappedOnboardingMetrics;
