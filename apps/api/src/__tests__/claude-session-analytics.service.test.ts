import { describe, expect, test } from "bun:test";
import { buildClaudeSessionAnalyticsRow } from "../services/claude-session-analytics.service.js";

describe("buildClaudeSessionAnalyticsRow", () => {
	test("writes corrected Claude token totals and keeps timing metrics parent-scoped", () => {
		const row = buildClaudeSessionAnalyticsRow({
			session_id: "session-1",
			organization_id: "org-1",
			project_path: "/tmp/project",
			git_remote: "git@github.com:obsessiondb/rudel.git",
			package_name: "rudel",
			package_type: "app",
			content: [
				'{"type":"user","timestamp":"2026-04-23T10:00:00Z","message":{"role":"user","content":"start"}}',
				'{"type":"assistant","timestamp":"2026-04-23T10:00:05Z","message":{"id":"msg-parent-1","model":"claude-sonnet-4-20250514","usage":{"input_tokens":10,"cache_read_input_tokens":100,"output_tokens":3},"stop_reason":null}}',
				'{"type":"assistant","timestamp":"2026-04-23T10:00:06Z","message":{"id":"msg-parent-1","model":"claude-sonnet-4-20250514","usage":{"input_tokens":10,"cache_read_input_tokens":100,"output_tokens":8},"stop_reason":"end_turn"}}',
				'{"type":"user","timestamp":"2026-04-23T10:00:10Z","message":{"role":"user","content":"continue"}}',
				'{"type":"assistant","timestamp":"2026-04-23T10:00:20Z","message":{"id":"msg-parent-2","model":"claude-sonnet-4-20250514","usage":{"input_tokens":5,"cache_creation_input_tokens":20,"output_tokens":4},"stop_reason":"end_turn"}}',
			].join("\n"),
			subagents: {
				agent_1: [
					'{"type":"assistant","timestamp":"2026-04-23T10:00:07Z","message":{"id":"msg-subagent","usage":{"input_tokens":2,"cache_read_input_tokens":4,"output_tokens":1},"stop_reason":"end_turn"}}',
				].join("\n"),
			},
			user_id: "user-1",
			git_branch: "evrendom/claude-token-v2",
			git_sha: "abc123",
			tag: "research",
		});

		expect(row.input_tokens).toBe("141");
		expect(row.output_tokens).toBe("13");
		expect(row.total_tokens).toBe("154");
		expect(row.parent_total_tokens).toBe("147");
		expect(row.subagent_total_tokens).toBe("7");
		expect(row.token_accounting_version).toBe(2);
		expect(row.total_interactions).toBe(5);
		expect(row.inference_duration_sec).toBe(15);
		expect(row.human_duration_sec).toBe(4);
		expect(row.model_used).toBe("claude-sonnet-4-20250514");
	});
});
