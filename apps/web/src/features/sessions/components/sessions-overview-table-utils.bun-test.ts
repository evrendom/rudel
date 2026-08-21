import { describe, expect, test } from "bun:test";
import type { SessionAnalytics } from "@rudel/api-routes";
import {
	compareSessions,
	getRepositoryLabel,
} from "./sessions-overview-table-utils";

const session: SessionAnalytics = {
	avg_period_sec: 45,
	duration_min: 12,
	error_count: 0,
	has_commit: true,
	input_tokens: 6_000,
	model_used: "gpt-5.6",
	output_tokens: 4_000,
	project_path: "/opt/conductor/workspaces/rudel-v2/osaka",
	repository: "/opt/conductor/workspaces/rudel-v2/osaka",
	session_date: "2026-08-19T12:00:00Z",
	session_id: "session-1",
	skills: [],
	slash_commands: [],
	subagent_types: [],
	success_score: 80,
	total_interactions: 6,
	total_tokens: 10_000,
	used_plan_mode: false,
	user_id: "user-1",
	worktree: "osaka",
	member_swears: 0,
	member_apologies: 0,
	member_positive: 0,
	model_swears: 0,
	model_apologies: 0,
	model_positive: 0,
};

describe("getRepositoryLabel", () => {
	test("normalizes absolute Conductor paths from cached list payloads", () => {
		expect(getRepositoryLabel(session)).toBe("rudel-v2");
	});

	test("normalizes raw git remotes from cached list payloads", () => {
		expect(
			getRepositoryLabel({
				...session,
				git_remote: "github.com/example/rudel",
				project_path: "/opt/coding-projects/rudel",
				repository: "github.com/example/rudel",
				worktree: null,
			}),
		).toBe("example/rudel");
	});
});

describe("compareSessions", () => {
	test("sorts signal columns by total persisted language signals", () => {
		const louderSession: SessionAnalytics = {
			...session,
			member_swears: 2,
			model_positive: 1,
		};
		const quieterSession: SessionAnalytics = {
			...session,
			member_apologies: 1,
			session_id: "session-2",
		};

		expect(compareSessions(louderSession, quieterSession, "signals", {})).toBe(
			2,
		);
	});
});
