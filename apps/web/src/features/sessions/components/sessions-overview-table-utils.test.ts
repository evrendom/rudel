import type { SessionAnalytics } from "@rudel/api-routes";
import { describe, expect, it } from "vitest";
import {
	buildSessionOverviewFilterOptions,
	buildSessionOverviewRangeBounds,
	compareSessions,
	getSessionOverviewCost,
	matchesSessionOverviewFilters,
	matchesSessionOverviewRangeFilters,
	SESSION_OVERVIEW_NO_SKILLS_FILTER_VALUE,
	type SessionOverviewExcludedFilterValues,
	type SessionOverviewRangeFilterValues,
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
	total_interactions: 6,
	total_tokens: 10_000,
	used_plan_mode: false,
	user_id: "user-1",
	member_swears: 0,
	member_apologies: 0,
	member_positive: 0,
	model_swears: 0,
	model_apologies: 0,
	model_positive: 0,
};

const otherSession: SessionAnalytics = {
	...baseSession,
	error_count: 0,
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
		skills: new Set<string>(),
		user: new Set<string>(),
		...overrides,
	};
}

function createRangeFilters(
	overrides: Partial<SessionOverviewRangeFilterValues> = {},
): SessionOverviewRangeFilterValues {
	return {
		cost: { maximum: null, minimum: null },
		duration: { maximum: null, minimum: null },
		errors: { maximum: null, minimum: null },
		input: { maximum: null, minimum: null },
		output: { maximum: null, minimum: null },
		subagents: { maximum: null, minimum: null },
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
			{ label: "obsessiondb/rudel", value: "obsessiondb/rudel" },
			{ label: "openai/codex", value: "openai/codex" },
		]);
		expect(
			buildSessionOverviewFilterOptions(sessions, "user", userMap),
		).toEqual([
			{ label: "Ada", value: "user-2" },
			{ label: "Evren", value: "user-1" },
		]);
		expect(
			buildSessionOverviewFilterOptions(
				[{ ...baseSession, skills: ["ui", "testing-bun"] }, otherSession],
				"skills",
				userMap,
			),
		).toEqual([
			{
				label: "No skills used",
				value: SESSION_OVERVIEW_NO_SKILLS_FILTER_VALUE,
			},
			{ label: "testing-bun", value: "testing-bun" },
			{ label: "ui", value: "ui" },
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

	it("filters sessions by skills and numeric ranges", () => {
		const skilledSession = {
			...baseSession,
			skills: ["ui", "testing-bun"],
		};

		expect(
			matchesSessionOverviewFilters(
				skilledSession,
				createFilters({ skills: new Set(["ui"]) }),
			),
		).toBe(false);
		expect(
			matchesSessionOverviewFilters(
				baseSession,
				createFilters({
					skills: new Set([SESSION_OVERVIEW_NO_SKILLS_FILTER_VALUE]),
				}),
			),
		).toBe(false);

		const largerSession = {
			...otherSession,
			duration_min: 25,
			input_tokens: 12_000,
			output_tokens: 8_000,
		};
		const bounds = buildSessionOverviewRangeBounds([
			baseSession,
			largerSession,
		]);
		expect(bounds.input).toMatchObject({ maximum: 12_000, minimum: 6_000 });
		expect(bounds.output).toMatchObject({ maximum: 8_000, minimum: 4_000 });
		expect(bounds.duration).toMatchObject({ maximum: 25, minimum: 12 });
		expect(
			matchesSessionOverviewRangeFilters(
				baseSession,
				createRangeFilters({ errors: { maximum: null, minimum: 1 } }),
			),
		).toBe(true);
		expect(
			matchesSessionOverviewRangeFilters(
				otherSession,
				createRangeFilters({ errors: { maximum: null, minimum: 1 } }),
			),
		).toBe(false);
	});

	it("uses one unknown-aware cost value for sorting and range filtering", () => {
		const pricedSession: SessionAnalytics = {
			...baseSession,
			estimated_cost: 5,
		};
		const incompleteCostSession: SessionAnalytics = {
			...otherSession,
			estimated_cost: null,
		};

		expect(getSessionOverviewCost(pricedSession)).toBe(5);
		expect(getSessionOverviewCost(incompleteCostSession)).toBeNull();
		expect(
			compareSessions(incompleteCostSession, pricedSession, "cost", {}),
		).toBeLessThan(0);
		expect(
			buildSessionOverviewRangeBounds([pricedSession, incompleteCostSession])
				.cost,
		).toMatchObject({ maximum: 5, minimum: 5 });

		const activeCostRange = createRangeFilters({
			cost: { maximum: null, minimum: 0 },
		});
		expect(
			matchesSessionOverviewRangeFilters(pricedSession, activeCostRange),
		).toBe(true);
		expect(
			matchesSessionOverviewRangeFilters(
				incompleteCostSession,
				activeCostRange,
			),
		).toBe(false);
	});
});
