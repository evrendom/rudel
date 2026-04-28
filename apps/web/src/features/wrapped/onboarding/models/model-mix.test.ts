import type { WrappedSourceSplit } from "@rudel/api-routes";
import { describe, expect, it } from "vitest";
import {
	hasModelStageSourceComparison,
	resolveModelStageModel,
} from "./model-mix";

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
	it("does not enable the MoM comparison when Codex has no uploaded sessions", () => {
		const model = resolveModelStageModel({
			modelByMonth: [
				{
					model: "claude-opus-4-6",
					month: "2026-04",
					session_count: 7,
				},
			],
			sourceSplit: claudeOnlySourceSplit,
		});

		expect(model.hasSourceComparison).toBe(false);
		expect(hasModelStageSourceComparison(claudeOnlySourceSplit)).toBe(false);
		expect(model.subline).toBe(
			"The full-run bar leaned Claude. The month-by-month comparison unlocks once both Claude and Codex have sessions.",
		);
	});

	it("does not enable the MoM comparison when Claude has no uploaded sessions", () => {
		const model = resolveModelStageModel({
			modelByMonth: [
				{
					model: "gpt-5.4",
					month: "2026-04",
					session_count: 9,
				},
			],
			sourceSplit: codexOnlySourceSplit,
		});

		expect(model.hasSourceComparison).toBe(false);
		expect(hasModelStageSourceComparison(codexOnlySourceSplit)).toBe(false);
		expect(model.subline).toBe(
			"The full-run bar leaned Codex. The month-by-month comparison unlocks once both Claude and Codex have sessions.",
		);
	});

	it("enables the MoM comparison when both sources have uploaded sessions", () => {
		const model = resolveModelStageModel({
			modelByMonth: [
				{
					model: "claude-opus-4-6",
					month: "2026-04",
					session_count: 7,
				},
				{
					model: "gpt-5.4",
					month: "2026-04",
					session_count: 3,
				},
			],
			sourceSplit: mixedSourceSplit,
		});

		expect(model.hasSourceComparison).toBe(true);
		expect(hasModelStageSourceComparison(mixedSourceSplit)).toBe(true);
	});

	it("does not count synthetic model rows as Codex in the monthly chart", () => {
		const model = resolveModelStageModel({
			modelByMonth: [
				{
					model: "<synthetic>",
					month: "2026-04",
					session_count: 7,
				},
				{
					model: "gpt-5.4",
					month: "2026-04",
					session_count: 3,
				},
				{
					model: "claude-opus-4-6",
					month: "2026-04",
					session_count: 2,
				},
			],
			sourceSplit: [
				{
					session_count: 9,
					session_share_percent: 75,
					source: "claude_code",
				},
				{
					session_count: 3,
					session_share_percent: 25,
					source: "codex",
				},
			],
		});
		const aprilMonth = model.months.find(
			(month) => month.id === "model-month-2026-04",
		);

		expect(aprilMonth?.totalSessions).toBe(5);
		expect(aprilMonth?.segments).toEqual([
			{
				id: "2026-04:claude_code",
				label: "Claude",
				sessionCount: 2,
				share: 40,
				source: "claude_code",
			},
			{
				id: "2026-04:codex",
				label: "Codex",
				sessionCount: 3,
				share: 60,
				source: "codex",
			},
		]);
	});
});
