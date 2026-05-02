import type { WrappedSourceSplit } from "@rudel/api-routes";
import { describe, expect, it } from "vitest";
import { resolveModelStageModel } from "./model-mix";

const claudeOnlySourceSplit = [
	{
		session_count: 7,
		session_share_percent: 100,
		source: "claude_code",
	},
	{
		session_count: 0,
		session_share_percent: 0,
		source: "codex",
	},
] satisfies readonly WrappedSourceSplit[];

const codexOnlySourceSplit = [
	{
		session_count: 0,
		session_share_percent: 0,
		source: "claude_code",
	},
	{
		session_count: 9,
		session_share_percent: 100,
		source: "codex",
	},
] satisfies readonly WrappedSourceSplit[];

const mixedSourceSplit = [
	{
		session_count: 7,
		session_share_percent: 70,
		source: "claude_code",
	},
	{
		session_count: 3,
		session_share_percent: 30,
		source: "codex",
	},
] satisfies readonly WrappedSourceSplit[];

describe("resolveModelStageModel", () => {
	it("describes the all-time Claude split when Codex has no sessions", () => {
		const model = resolveModelStageModel({
			sourceSplit: claudeOnlySourceSplit,
		});

		expect(model.headline).toBe("Claude led the run");
		expect(model.subline).toBe("The all-time bar leaned Claude.");
	});

	it("describes the all-time Codex split when Claude has no sessions", () => {
		const model = resolveModelStageModel({
			sourceSplit: codexOnlySourceSplit,
		});

		expect(model.headline).toBe("Codex led the run");
		expect(model.subline).toBe("The all-time bar leaned Codex.");
	});

	it("describes mixed source usage without monthly trend copy", () => {
		const model = resolveModelStageModel({
			sourceSplit: mixedSourceSplit,
		});

		expect(model.headline).toBe("Claude led the run");
		expect(model.subline).toBe(
			"The all-time bar leaned Claude across the full run.",
		);
		expect(model.subline).not.toContain("month");
	});
});
