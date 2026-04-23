import { describe, expect, test } from "bun:test";
import {
	buildClaudeSessionTokenBreakdown,
	deriveClaudeUncachedInputTokens,
} from "../claude-token-accounting.js";

describe("claude token accounting", () => {
	test("uses the final usage snapshot for each Claude message id", () => {
		const content = [
			'{"type":"assistant","timestamp":"2026-04-23T10:00:00Z","message":{"id":"msg-parent-1","usage":{"input_tokens":10,"cache_read_input_tokens":100,"output_tokens":3},"stop_reason":null}}',
			'{"type":"assistant","timestamp":"2026-04-23T10:00:01Z","message":{"id":"msg-parent-1","usage":{"input_tokens":10,"cache_read_input_tokens":100,"output_tokens":8},"stop_reason":"end_turn"}}',
			'{"type":"assistant","timestamp":"2026-04-23T10:00:02Z","message":{"id":"msg-parent-2","usage":{"input_tokens":5,"cache_creation_input_tokens":20,"output_tokens":4},"stop_reason":"end_turn"}}',
		].join("\n");

		const breakdown = buildClaudeSessionTokenBreakdown(content, {});

		expect(breakdown.parent.input_tokens).toBe(135);
		expect(breakdown.parent.output_tokens).toBe(12);
		expect(breakdown.parent.cache_read_input_tokens).toBe(100);
		expect(breakdown.parent.cache_creation_input_tokens).toBe(20);
		expect(breakdown.parent.uncached_input_tokens).toBe(15);
		expect(breakdown.parent.total_tokens).toBe(147);
		expect(breakdown.timeline).toHaveLength(2);
		expect(breakdown.timeline[0]?.output_tokens).toBe(8);
	});

	test("adds subagent transcript tokens into the session-wide Claude total", () => {
		const parentContent = [
			'{"type":"assistant","timestamp":"2026-04-23T10:00:00Z","message":{"id":"msg-parent","usage":{"input_tokens":10,"output_tokens":3},"stop_reason":"end_turn"}}',
		].join("\n");
		const subagents = {
			agent_1: [
				'{"type":"assistant","timestamp":"2026-04-23T10:00:00.500Z","message":{"id":"msg-subagent","usage":{"input_tokens":2,"cache_read_input_tokens":4,"output_tokens":1},"stop_reason":"end_turn"}}',
			].join("\n"),
		};

		const breakdown = buildClaudeSessionTokenBreakdown(
			parentContent,
			subagents,
		);

		expect(breakdown.parent.total_tokens).toBe(13);
		expect(breakdown.subagent.total_tokens).toBe(7);
		expect(breakdown.session.total_tokens).toBe(20);
		expect(breakdown.timeline.map((point) => point.source)).toEqual([
			"parent",
			"subagent",
		]);
	});

	test("derives Claude uncached input from processed input and cache usage", () => {
		expect(deriveClaudeUncachedInputTokens(2_662_604, 2_370_740, 191_681)).toBe(
			100_183,
		);
	});
});
