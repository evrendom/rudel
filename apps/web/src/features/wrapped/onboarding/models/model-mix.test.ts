import { describe, expect, it } from "vitest";
import { resolveModelStageModel } from "./model-mix";

describe("resolveModelStageModel", () => {
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
