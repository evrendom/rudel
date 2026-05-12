import { describe, expect, it } from "vitest";
import { buildSessionDetailViewModel } from "./session-detail-view-model";

const userEntry = JSON.stringify({
	type: "user",
	uuid: "entry-user",
	timestamp: "2026-05-12T10:00:00.000Z",
	sessionId: "session-1",
	message: {
		role: "user",
		content: "please help",
	},
});

const assistantEntry = JSON.stringify({
	type: "assistant",
	uuid: "entry-assistant",
	timestamp: "2026-05-12T10:01:00.000Z",
	sessionId: "session-1",
	message: {
		role: "assistant",
		content: [{ type: "text", text: "done" }],
	},
});

describe("buildSessionDetailViewModel", () => {
	it("normalizes session detail values without changing display labels", () => {
		const model = buildSessionDetailViewModel(
			{
				content: `${userEntry}\n${assistantEntry}`,
				duration_min: "42",
				git_branch: "main",
				git_sha: "abcdef123456",
				input_tokens: "1200",
				model_used: "claude-sonnet-4-5",
				output_tokens: 3400,
				repository: "rudel",
				session_archetype: "deep_work",
				session_date: "2026-05-12",
				session_id: "session-123456",
				skills: ["refactor", 12, "tests"],
				slash_commands: ["plan", null, "review"],
				subagents: {
					explorer: "read code",
					ignored: 42,
					worker: "patched code",
				},
				success_score: "88.5",
				total_interactions: "7",
				user_id: "user-1",
			},
			{ "user-1": "Ada Lovelace" },
		);

		expect(model.safeSessionId).toBe("session-123456");
		expect(model.safeSessionDate).toBe("2026-05-12");
		expect(model.safeUserDisplayName).toBe("Ada Lovelace");
		expect(model.safeDurationMin).toBe(42);
		expect(model.safeTotalInteractions).toBe(7);
		expect(model.safeSuccessScore).toBe(88.5);
		expect(model.safeSkills).toEqual(["refactor", "tests"]);
		expect(model.safeSlashCommands).toEqual(["plan", "review"]);
		expect(model.subagentNames).toEqual(["explorer", "worker"]);
		expect(model.tokenUsageLabel).toBe("1,200 / 3,400");
		expect(model.costLabel).toMatch(/^\$\d+\.\d{4}$/);
		expect(model.safeSessionArchetype).toBe("deep_work");
		expect(model.conversationSummary).toEqual({
			assistantMessages: 1,
			systemMessages: 0,
			totalMessages: 2,
			userMessages: 1,
		});
		expect(model.metadataBadges.map((badge) => badge.label)).toEqual([
			"rudel",
			"main",
		]);
	});

	it("uses stable fallbacks for missing or malformed session detail fields", () => {
		const model = buildSessionDetailViewModel(
			{
				content: { unsupported: true },
				duration_min: Number.NaN,
				input_tokens: "invalid",
				output_tokens: null,
				session_id: "",
				subagents: [
					["reviewer", "checked"],
					["ignored", 100],
				],
				total_interactions: undefined,
				user_id: "",
			},
			{},
		);

		expect(model.safeSessionId).toBe("unknown-session");
		expect(model.safeSessionDate).toBe("");
		expect(model.safeUserDisplayName).toBe("User");
		expect(model.safeDurationMin).toBe(0);
		expect(model.safeTotalInteractions).toBeUndefined();
		expect(model.safeSkills).toEqual([]);
		expect(model.safeSlashCommands).toEqual([]);
		expect(model.subagentNames).toEqual(["reviewer"]);
		expect(model.tokenUsageLabel).toBe("0 / 0");
		expect(model.costLabel).toBe("$0.0000");
		expect(model.conversationSummary).toBeNull();
		expect(model.metadataBadges).toEqual([]);
		expect(model.safeContent).toBe('{\n  "unsupported": true\n}');
	});
});
