import type { SessionAnalytics } from "@rudel/api-routes";
import { describe, expect, it } from "vitest";
import {
	buildSessionOverviewFilterOptions,
	matchesSessionOverviewFilters,
	type SessionOverviewExcludedFilterValues,
} from "./sessions-overview-table-utils";

const baseSession: SessionAnalytics = {
	avg_period_sec: 45,
	duration_min: 12,
	error_count: 3,
	has_commit: true,
	input_tokens: 6_000,
	model_used: "claude-sonnet-4",
	output_tokens: 4_000,
	project_path: "/Users/evren/rudel",
	repository: "obsessiondb/rudel",
	worktree: "podgorica",
	session_date: "2026-05-04T10:00:00.000Z",
	session_id: "session-1",
	skills: [],
	slash_commands: [],
	subagent_types: [],
	subagent_count: 2,
	success_score: 80,
	total_interactions: 7,
	total_tokens: 10_000,
	used_plan_mode: false,
	user_id: "user-1",
};

const otherSession: SessionAnalytics = {
	...baseSession,
	model_used: "gpt-5",
	repository: "openai/codex",
	session_id: "session-2",
	user_id: "user-2",
	worktree: null,
};

function createFilters(
	overrides: Partial<SessionOverviewExcludedFilterValues> = {},
): SessionOverviewExcludedFilterValues {
	return {
		model: new Set<string>(),
		repository: new Set<string>(),
		user: new Set<string>(),
		worktree: new Set<string>(),
		...overrides,
	};
}

describe("sessions overview filters", () => {
	it("builds sorted, deduplicated options with display labels", () => {
		const sessions = [
			baseSession,
			otherSession,
			{ ...baseSession, session_id: "3", worktree: "lansing" },
		];
		const userMap = { "user-1": "Evren", "user-2": "Ada" };

		expect(
			buildSessionOverviewFilterOptions(sessions, "repository", userMap),
		).toEqual([
			{
				label: "obsessiondb/rudel",
				value: "obsessiondb/rudel",
				worktrees: [
					{
						label: "lansing",
						value: "obsessiondb/rudel/lansing",
					},
					{
						label: "podgorica",
						value: "obsessiondb/rudel/podgorica",
					},
				],
			},
			{ label: "openai/codex", value: "openai/codex", worktrees: [] },
		]);
		expect(
			buildSessionOverviewFilterOptions(sessions, "user", userMap),
		).toEqual([
			{ label: "Ada", value: "user-2", worktrees: [] },
			{ label: "Evren", value: "user-1", worktrees: [] },
		]);
	});

	it("combines repository, user, and model exclusions", () => {
		const filters = createFilters({
			model: new Set([otherSession.model_used]),
			repository: new Set(["obsessiondb/rudel"]),
		});

		expect(matchesSessionOverviewFilters(baseSession, filters)).toBe(false);
		expect(matchesSessionOverviewFilters(otherSession, filters)).toBe(false);
		expect(
			matchesSessionOverviewFilters(
				{
					...baseSession,
					repository: "rudel/website",
					session_id: "session-3",
				},
				filters,
			),
		).toBe(true);
	});

	it("lets repository exclusions dominate individual worktree exclusions", () => {
		const lansingSession = {
			...baseSession,
			session_id: "session-lansing",
			worktree: "lansing",
		};
		const repositoryFilters = createFilters({
			repository: new Set(["obsessiondb/rudel"]),
		});

		expect(matchesSessionOverviewFilters(baseSession, repositoryFilters)).toBe(
			false,
		);
		expect(
			matchesSessionOverviewFilters(lansingSession, repositoryFilters),
		).toBe(false);

		const worktreeFilters = createFilters({
			worktree: new Set(["obsessiondb/rudel/podgorica"]),
		});
		expect(matchesSessionOverviewFilters(baseSession, worktreeFilters)).toBe(
			false,
		);
		expect(matchesSessionOverviewFilters(lansingSession, worktreeFilters)).toBe(
			true,
		);
	});
});
