import { describe, expect, it } from "bun:test";
import { RudelClaudeSessionsRowSchema } from "../generated/chkit-types";

describe("RudelClaudeSessionsRowSchema", () => {
	const validRow = {
		session_date: "2026-02-13T09:24:27.180Z",
		last_interaction_date: "2026-02-13T09:24:27.180Z",
		session_id: "sess_abc123",
		organization_id: "org_xyz",
		project_path: "/Users/dev/project",
		git_remote: "github.com/org/repo",
		package_name: "my-project",
		package_type: "package.json",
		content: "session transcript content",
		subagents: { agent1: "result1" },
		ingested_at: "2026-02-13T09:24:27.180Z",
		user_id: "user_123",
		git_branch: "main",
		git_sha: "abc123def456",
		tag: "production",
	};

	it("parses a valid row", () => {
		const result = RudelClaudeSessionsRowSchema.parse(validRow);
		expect(result.session_id).toBe("sess_abc123");
		expect(result.organization_id).toBe("org_xyz");
		expect(result.subagents).toEqual({ agent1: "result1" });
	});

	it("accepts null for nullable fields", () => {
		const row = {
			...validRow,
			git_branch: null,
			git_sha: null,
			tag: null,
		};
		const result = RudelClaudeSessionsRowSchema.parse(row);
		expect(result.git_branch).toBeNull();
		expect(result.git_sha).toBeNull();
		expect(result.tag).toBeNull();
	});

	it("rejects missing required fields", () => {
		const { session_id: _, ...incomplete } = validRow;
		expect(() => RudelClaudeSessionsRowSchema.parse(incomplete)).toThrow();
	});

	it("rejects wrong types", () => {
		expect(() =>
			RudelClaudeSessionsRowSchema.parse({ ...validRow, session_id: 1000 }),
		).toThrow();
	});
});
