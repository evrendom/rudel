import { describe, expect, test } from "bun:test";
import { SessionAnalyticsSchema } from "@rudel/api-routes";
import {
	mapSessionAnalyticsRow,
	type SessionAnalyticsRaw,
} from "../services/session-analytics.service.js";
import { summarizeSessionLanguageSignals } from "../services/session-language-signal-summary.js";

const rawSession: SessionAnalyticsRaw = {
	actual_duration_min: 12,
	avg_period_sec: 45,
	cost_is_complete: 1,
	error_count: 3,
	estimated_cost: 1.25,
	git_branch: "main",
	git_remote: "",
	git_sha: "abc123",
	has_commit: 1,
	input_tokens: 6_000,
	last_interaction_date: "2026-08-19T12:12:00Z",
	long_pauses: 0,
	median_period_sec: 40,
	model_used: "gpt-5.6",
	member_apologies: 0,
	member_positive: 0,
	member_swears: 0,
	model_apologies: 0,
	model_positive: 0,
	model_swears: 0,
	normal_responses: 4,
	organization_id: "org-1",
	output_tokens: 4_000,
	package_name: "",
	project_path: "/opt/conductor/workspaces/rudel-v2/osaka",
	quick_responses: 2,
	session_date: "2026-08-19T12:00:00Z",
	session_id: "session-1",
	source: "codex",
	skills: [],
	slash_commands: [],
	subagent_types: [],
	success_score: 80,
	total_interactions: 6,
	total_tokens: 10_000,
	used_plan_mode: 0,
	user_id: "user-1",
};

describe("mapSessionAnalyticsRow", () => {
	test("uses the canonical repository label for Conductor workspaces", () => {
		expect(mapSessionAnalyticsRow(rawSession)).toMatchObject({
			git_branch: "main",
			repository: "rudel-v2",
			worktree: "osaka",
		});
	});

	test("preserves list metrics through contract parsing", () => {
		const parsed = SessionAnalyticsSchema.parse(
			mapSessionAnalyticsRow(rawSession),
		);

		expect(parsed).toMatchObject({
			error_count: 3,
			git_branch: "main",
			total_interactions: 6,
		});
	});

	test("returns an unknown cost when server pricing is incomplete", () => {
		expect(
			mapSessionAnalyticsRow({
				...rawSession,
				cost_is_complete: 0,
			}).estimated_cost,
		).toBeNull();
	});
});

describe("summarizeSessionLanguageSignals", () => {
	test("returns persisted counts for member and model text", () => {
		const transcript = [
			{
				message: {
					content:
						"<system_instruction>Excellent work</system_instruction>Great, sorry, this feels fishy shit??",
					role: "user",
				},
				sessionId: "session-1",
				timestamp: "2026-08-19T12:00:00Z",
				type: "user",
				uuid: "user-1",
			},
			{
				message: {
					content: [
						{
							text: "Excellent, sorry, this feels fishy fuck??",
							type: "text",
						},
					],
					role: "assistant",
				},
				sessionId: "session-1",
				timestamp: "2026-08-19T12:00:01Z",
				type: "assistant",
				uuid: "assistant-1",
			},
		]
			.map((entry) => JSON.stringify(entry))
			.join("\n");

		expect(summarizeSessionLanguageSignals(transcript)).toEqual({
			member_apologies: 1,
			member_positive: 1,
			member_swears: 1,
			model_apologies: 1,
			model_positive: 0,
			model_swears: 1,
		});
	});
});
