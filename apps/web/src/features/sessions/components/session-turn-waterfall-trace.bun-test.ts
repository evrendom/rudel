import { describe, expect, test } from "bun:test";
import type { SessionAdalineSpan } from "./session-adaline-model";
import { buildSessionTurnWaterfallTrace } from "./session-turn-waterfall-trace";

function createSpan(
	id: string,
	kind: SessionAdalineSpan["kind"],
	label: string,
): SessionAdalineSpan {
	return {
		depth: kind === "member" ? 0 : 1,
		durationMs: 1_000,
		id,
		kind,
		label,
		preview: `${label} preview`,
		raw: {},
		status: "success",
		timestamp: `2026-08-11T10:00:0${id.length}.000Z`,
	};
}

describe("session turn waterfall trace", () => {
	test("nests tools and skills under their reasoning or message branch", () => {
		const spans = [
			createSpan("member", "member", "Member message"),
			createSpan("reasoning", "reasoning", "Reasoning"),
			createSpan("tool", "tool", "apply_patch"),
			createSpan("skill", "tool", "Skill"),
			createSpan("message", "message", "Assistant message"),
		];

		const branches = buildSessionTurnWaterfallTrace(spans, [
			"ui",
			"testing-bun",
		]);

		expect(branches.map((branch) => branch.row.kind)).toEqual([
			"reasoning",
			"message",
		]);
		expect(
			branches[0]?.children.map((child) => [child.kind, child.label]),
		).toEqual([
			["tool", "apply_patch"],
			["skill", "Skill · ui"],
		]);
		expect(branches[1]?.children.map((child) => child.label)).toEqual([
			"Skill · testing-bun",
		]);
	});

	test("keeps unparented tools visible under an explicit activity branch", () => {
		const branches = buildSessionTurnWaterfallTrace(
			[createSpan("tool", "tool", "Read")],
			[],
		);

		expect(branches[0]?.row.kind).toBe("activity");
		expect(branches[0]?.children[0]?.kind).toBe("tool");
	});
});
