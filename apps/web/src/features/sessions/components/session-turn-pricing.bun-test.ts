import { describe, expect, test } from "bun:test";
import type { TraceItem } from "@/components/conversation/conversation-trace";
import { getSessionEstimatedCost } from "../session-cost";
import {
	extractSessionTurnMetrics,
	extractTranscriptUsageMetrics,
} from "./session-turn-metadata";
import type { SessionTurn } from "./session-turns";

function line(value: unknown) {
	return JSON.stringify(value);
}

function turn(id: string, timestamp: string): SessionTurn {
	const userItem: TraceItem = { content: id, id, kind: "user", timestamp };
	return { responseItems: [], userItems: [userItem] };
}

describe("session turn pricing", () => {
	test("prices standalone subagent transcripts without parent turn anchors", () => {
		const metrics = extractTranscriptUsageMetrics(
			line({
				message: {
					content: [],
					id: "subagent-assistant-1",
					model: "claude-fable-5",
					usage: {
						cache_read_input_tokens: 1_000_000,
						input_tokens: 0,
						output_tokens: 0,
					},
				},
				timestamp: "2026-08-10T10:00:10.000Z",
				type: "assistant",
			}),
			undefined,
		);

		expect(metrics.usageEvents).toHaveLength(1);
		expect(metrics.estimatedCost).toBe(1);
	});

	test("prices Claude 1-hour cache writes at their recorded tier", () => {
		const metrics = extractSessionTurnMetrics(
			line({
				message: {
					content: [],
					id: "assistant-1",
					model: "claude-opus-5",
					usage: {
						cache_creation: {
							ephemeral_1h_input_tokens: 1_000_000,
							ephemeral_5m_input_tokens: 0,
						},
						cache_creation_input_tokens: 1_000_000,
						input_tokens: 0,
						output_tokens: 0,
					},
				},
				timestamp: "2026-08-10T10:00:10.000Z",
				type: "assistant",
			}),
			{
				fallbackModel: undefined,
				turns: [turn("user-1", "2026-08-10T10:00:00.000Z")],
			},
		);

		expect(metrics[0]?.estimatedCost).toBe(10);
	});

	test("matches the golden per-turn and full-session request totals", () => {
		const turns = [
			turn("user-1", "2026-08-10T10:00:00.000Z"),
			turn("user-2", "2026-08-10T10:01:00.000Z"),
		];
		const content = [
			line({
				message: {
					content: [],
					id: "assistant-1",
					model: "claude-fable-5",
					usage: {
						cache_read_input_tokens: 1_000_000,
						input_tokens: 0,
						output_tokens: 0,
					},
				},
				timestamp: "2026-08-10T10:00:10.000Z",
				type: "assistant",
			}),
			line({
				message: {
					content: [],
					id: "assistant-2",
					model: "claude-opus-5",
					usage: {
						cache_creation: {
							ephemeral_1h_input_tokens: 1_000_000,
							ephemeral_5m_input_tokens: 0,
						},
						cache_creation_input_tokens: 1_000_000,
						input_tokens: 0,
						output_tokens: 0,
					},
				},
				timestamp: "2026-08-10T10:01:10.000Z",
				type: "assistant",
			}),
		].join("\n");
		const subagent = extractTranscriptUsageMetrics(
			line({
				message: {
					content: [],
					id: "subagent-assistant-1",
					model: "claude-fable-5",
					usage: {
						cache_read_input_tokens: 1_000_000,
						input_tokens: 0,
						output_tokens: 0,
					},
				},
				timestamp: "2026-08-10T10:00:30.000Z",
				type: "assistant",
			}),
			undefined,
		);

		const turnMetrics = extractSessionTurnMetrics(content, {
			fallbackModel: undefined,
			turns,
		});

		expect(turnMetrics.map((metrics) => metrics.estimatedCost)).toEqual([
			1, 10,
		]);
		expect(subagent.estimatedCost).toBe(1);
		expect(getSessionEstimatedCost([...turnMetrics, subagent])).toBe(12);
	});
});
