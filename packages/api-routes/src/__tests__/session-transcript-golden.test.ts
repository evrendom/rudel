import { describe, expect, test } from "bun:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
	buildConversationTrace,
	extractSessionTurnMetrics,
	getSessionTurnId,
	groupTraceIntoTurns,
	parseConversations,
} from "../index.js";

function line(value: unknown) {
	return JSON.stringify(value);
}

function deriveTranscriptSnapshot(content: string, fallbackModel?: string) {
	const conversations = parseConversations(content);
	const trace = buildConversationTrace(conversations);
	const turns = groupTraceIntoTurns(trace);
	const metrics = extractSessionTurnMetrics(content, {
		fallbackModel,
		turns,
	});

	return JSON.stringify({
		conversations,
		metrics,
		trace,
		turnIds: turns.map(getSessionTurnId),
	});
}

function sha256(value: string) {
	return createHash("sha256").update(value).digest("hex");
}

const CLAUDE_TRANSCRIPT = [
	line({
		message: { content: "  Please   inspect 🙂\nnow ", role: "user" },
		sessionId: "s",
		timestamp: "2026-08-16T10:00:00.000Z",
		type: "user",
		uuid: "u1",
	}),
	line({
		message: {
			content: [
				{ thinking: "Checking", type: "thinking" },
				{
					id: "tool-1",
					input: { file_path: "src/a.ts" },
					name: "Write",
					type: "tool_use",
				},
				{ text: "Done\ncleanly", type: "text" },
			],
			model: "claude-opus-5",
			role: "assistant",
			usage: { input_tokens: 100, output_tokens: 20 },
		},
		sessionId: "s",
		timestamp: "2026-08-16T10:00:10.000Z",
		type: "assistant",
		uuid: "a1",
	}),
	line({
		message: {
			content: [{ content: "ok", tool_use_id: "tool-1", type: "tool_result" }],
			role: "user",
		},
		sessionId: "s",
		timestamp: "2026-08-16T10:00:20.000Z",
		type: "user",
		uuid: "r1",
	}),
	line({
		message: { content: "Next", role: "user" },
		sessionId: "s",
		timestamp: "2026-08-16T10:01:00.000Z",
		type: "user",
		uuid: "u2",
	}),
	line({
		message: {
			content: [{ text: "Second", type: "text" }],
			model: "claude-fable-5",
			role: "assistant",
			usage: {
				cache_read_input_tokens: 200,
				input_tokens: 0,
				output_tokens: 10,
			},
		},
		sessionId: "s",
		timestamp: "2026-08-16T10:01:05.000Z",
		type: "assistant",
		uuid: "a2",
	}),
].join("\n");

const CODEX_USER_LINE = line({
	payload: {
		content: [{ text: "Do thing", type: "input_text" }],
		role: "user",
		type: "message",
	},
	timestamp: "2026-08-16T11:00:02.000Z",
	type: "response_item",
});

const CODEX_TRANSCRIPT = [
	line({
		payload: { id: "codex-s" },
		timestamp: "2026-08-16T11:00:00.000Z",
		type: "session_meta",
	}),
	line({
		payload: { collaboration_mode_kind: "default", type: "task_started" },
		timestamp: "2026-08-16T11:00:01.000Z",
		type: "event_msg",
	}),
	CODEX_USER_LINE,
	line({
		payload: {
			content: [{ text: "Did thing", type: "output_text" }],
			role: "assistant",
			type: "message",
		},
		timestamp: "2026-08-16T11:00:03.000Z",
		type: "response_item",
	}),
	line({
		payload: {
			info: {
				last_token_usage: {
					cached_input_tokens: 100,
					input_tokens: 1_000,
					output_tokens: 50,
				},
				model_context_window: 300_000,
				total_token_usage: {
					cached_input_tokens: 100,
					input_tokens: 1_000,
					output_tokens: 50,
				},
			},
			model: "gpt-5.6-sol",
			type: "token_count",
		},
		timestamp: "2026-08-16T11:00:04.000Z",
		type: "event_msg",
	}),
].join("\n");

describe("shared session transcript derivation", () => {
	test("preserves Claude and Codex model settings from their transcript records", () => {
		const claudeTranscript = [
			line({
				message: { content: "Inspect this", role: "user" },
				sessionId: "claude-setting",
				timestamp: "2026-08-19T08:00:00.000Z",
				type: "user",
				uuid: "user-setting",
			}),
			line({
				effort: "high",
				message: {
					content: [{ text: "Inspected", type: "text" }],
					role: "assistant",
				},
				sessionId: "claude-setting",
				timestamp: "2026-08-19T08:00:01.000Z",
				type: "assistant",
				uuid: "assistant-setting",
			}),
		].join("\n");
		const codexTranscript = [
			line({
				payload: { id: "codex-setting" },
				timestamp: "2026-08-19T09:00:00.000Z",
				type: "session_meta",
			}),
			line({
				payload: { effort: "xhigh" },
				timestamp: "2026-08-19T09:00:01.000Z",
				type: "turn_context",
			}),
			line({
				payload: {
					content: [{ text: "First turn", type: "input_text" }],
					role: "user",
					type: "message",
				},
				timestamp: "2026-08-19T09:00:02.000Z",
				type: "response_item",
			}),
			line({
				payload: {
					content: [{ text: "First answer", type: "output_text" }],
					role: "assistant",
					type: "message",
				},
				timestamp: "2026-08-19T09:00:03.000Z",
				type: "response_item",
			}),
			line({
				payload: { effort: "max" },
				timestamp: "2026-08-19T09:01:00.000Z",
				type: "turn_context",
			}),
			line({
				payload: {
					content: [{ text: "Second turn", type: "input_text" }],
					role: "user",
					type: "message",
				},
				timestamp: "2026-08-19T09:01:01.000Z",
				type: "response_item",
			}),
			line({
				payload: {
					content: [{ text: "Second answer", type: "output_text" }],
					role: "assistant",
					type: "message",
				},
				timestamp: "2026-08-19T09:01:02.000Z",
				type: "response_item",
			}),
		].join("\n");

		const claudeAgent = buildConversationTrace(
			parseConversations(claudeTranscript),
		).find((item) => item.kind === "agent");
		const codexTurns = groupTraceIntoTurns(
			buildConversationTrace(parseConversations(codexTranscript)),
		);

		expect(claudeAgent?.kind === "agent" && claudeAgent.modelSetting).toBe(
			"high",
		);
		expect(
			codexTurns.map((turn) =>
				turn.responseItems.find((item) => item.kind === "agent"),
			),
		).toMatchObject([{ modelSetting: "xhigh" }, { modelSetting: "max" }]);
	});

	test("does not copy the root setting onto an unattributed hosted subagent", () => {
		const transcript = [
			line({
				payload: { id: "codex-setting-isolation" },
				timestamp: "2026-08-19T10:00:00.000Z",
				type: "session_meta",
			}),
			line({
				payload: { effort: "xhigh" },
				timestamp: "2026-08-19T10:00:01.000Z",
				type: "turn_context",
			}),
			line({
				payload: {
					agent: { agent_name: "/root/reviewer" },
					content: [{ text: "Reviewed", type: "output_text" }],
					role: "assistant",
					type: "message",
				},
				timestamp: "2026-08-19T10:00:02.000Z",
				type: "response_item",
			}),
		].join("\n");
		const subagent = buildConversationTrace(
			parseConversations(transcript),
		).find(
			(item) => item.kind === "agent" && item.agentName === "/root/reviewer",
		);

		expect(subagent).not.toHaveProperty("modelSetting");
	});

	test("preserves the subagent identity on its delegation result", () => {
		const transcript = [
			line({
				message: { content: "Delegate this", role: "user" },
				sessionId: "s",
				timestamp: "2026-08-16T10:00:00.000Z",
				type: "user",
				uuid: "u1",
			}),
			line({
				message: {
					content: [
						{
							id: "tool-agent",
							input: { description: "Review the implementation" },
							name: "Agent",
							type: "tool_use",
						},
					],
					role: "assistant",
				},
				sessionId: "s",
				timestamp: "2026-08-16T10:00:01.000Z",
				type: "assistant",
				uuid: "a1",
			}),
			line({
				message: {
					content: [
						{
							content: "Review complete",
							tool_use_id: "tool-agent",
							type: "tool_result",
						},
					],
					role: "user",
				},
				sessionId: "s",
				timestamp: "2026-08-16T10:00:02.000Z",
				toolUseResult: { agentId: "agent-reviewer", status: "completed" },
				type: "user",
				uuid: "r1",
			}),
		].join("\n");
		const trace = buildConversationTrace(parseConversations(transcript));
		const agentItem = trace.find((item) => item.kind === "agent");
		assert(agentItem?.kind === "agent");
		const delegation = agentItem.events.find(
			(event) => event.kind === "tool" && event.toolName === "Agent",
		);
		assert(delegation?.kind === "tool");

		expect(delegation.result?.subagentId).toBe("agent-reviewer");
	});

	test("nests hosted Responses subagents under their spawn action", () => {
		const transcript = [
			line({
				payload: { id: "codex-multi-agent" },
				timestamp: "2026-08-18T10:00:00.000Z",
				type: "session_meta",
			}),
			line({
				payload: {
					content: [{ text: "Review this", type: "input_text" }],
					role: "user",
					type: "message",
				},
				timestamp: "2026-08-18T10:00:01.000Z",
				type: "response_item",
			}),
			line({
				payload: {
					action: "spawn_agent",
					agent: { agent_name: "/root" },
					arguments: JSON.stringify({
						message: "Review the parser",
						task_name: "reviewer",
					}),
					call_id: "call-spawn-reviewer",
					type: "multi_agent_call",
				},
				timestamp: "2026-08-18T10:00:02.000Z",
				type: "response_item",
			}),
			line({
				payload: {
					action: "spawn_agent",
					agent: { agent_name: "/root" },
					call_id: "call-spawn-reviewer",
					output: [
						{
							text: JSON.stringify({ task_name: "/root/reviewer" }),
							type: "output_text",
						},
					],
					type: "multi_agent_call_output",
				},
				timestamp: "2026-08-18T10:00:03.000Z",
				type: "response_item",
			}),
			line({
				payload: {
					agent: { agent_name: "/root/reviewer" },
					content: [
						{
							text: "The parser preserves the agent path.",
							type: "output_text",
						},
					],
					role: "assistant",
					type: "message",
				},
				timestamp: "2026-08-18T10:00:04.000Z",
				type: "response_item",
			}),
			line({
				payload: {
					agent: { agent_name: "/root" },
					content: [{ text: "Review complete.", type: "output_text" }],
					role: "assistant",
					type: "message",
				},
				timestamp: "2026-08-18T10:00:05.000Z",
				type: "response_item",
			}),
		].join("\n");
		const trace = buildConversationTrace(parseConversations(transcript));
		const rootItem = trace.find(
			(item) => item.kind === "agent" && item.agentName === "/root",
		);
		const subagentItem = trace.find(
			(item) => item.kind === "agent" && item.agentName === "/root/reviewer",
		);
		assert(rootItem?.kind === "agent");
		assert(subagentItem?.kind === "agent");
		const delegation = rootItem.events.find(
			(event) => event.kind === "tool" && event.toolName === "spawn_agent",
		);
		assert(delegation?.kind === "tool");

		expect(delegation.result?.subagentId).toBe("/root/reviewer");
		expect(subagentItem.events).toMatchObject([
			{ kind: "message", text: "The parser preserves the agent path." },
		]);
	});

	test("pairs interleaved parallel-subagent tool results with their calls", () => {
		const attributedItem = (
			agentName: string,
			payload: Record<string, unknown>,
			timestamp: string,
		) =>
			line({
				payload: { ...payload, agent: { agent_name: agentName } },
				timestamp,
				type: "response_item",
			});
		const transcript = [
			line({
				payload: { id: "codex-parallel" },
				timestamp: "2026-08-18T11:00:00.000Z",
				type: "session_meta",
			}),
			line({
				payload: {
					content: [{ text: "Inspect both", type: "input_text" }],
					role: "user",
					type: "message",
				},
				timestamp: "2026-08-18T11:00:01.000Z",
				type: "response_item",
			}),
			attributedItem(
				"/root/a",
				{
					arguments: JSON.stringify({ path: "a.ts" }),
					call_id: "call-a",
					name: "read_file",
					type: "function_call",
				},
				"2026-08-18T11:00:02.000Z",
			),
			attributedItem(
				"/root/b",
				{
					arguments: JSON.stringify({ path: "b.ts" }),
					call_id: "call-b",
					name: "read_file",
					type: "function_call",
				},
				"2026-08-18T11:00:03.000Z",
			),
			attributedItem(
				"/root/a",
				{
					call_id: "call-a",
					output: "A output",
					type: "function_call_output",
				},
				"2026-08-18T11:00:04.000Z",
			),
			attributedItem(
				"/root/b",
				{
					call_id: "call-b",
					output: "B output",
					type: "function_call_output",
				},
				"2026-08-18T11:00:05.000Z",
			),
		].join("\n");
		const trace = buildConversationTrace(parseConversations(transcript));
		const resultByAgent = new Map(
			trace.flatMap((item) =>
				item.kind === "agent"
					? item.events.flatMap((event) =>
							event.kind === "tool"
								? [[item.agentName, event.result?.content] as const]
								: [],
						)
					: [],
			),
		);

		expect(resultByAgent.get("/root/a")).toBe("A output");
		expect(resultByAgent.get("/root/b")).toBe("B output");
	});

	test("attributes subagent usage to its owning parent turn", () => {
		const turns = groupTraceIntoTurns(
			buildConversationTrace(parseConversations(CLAUDE_TRANSCRIPT)),
		);
		const baseline = extractSessionTurnMetrics(CLAUDE_TRANSCRIPT, {
			fallbackModel: undefined,
			turns,
		});
		const withSubagent = extractSessionTurnMetrics(CLAUDE_TRANSCRIPT, {
			fallbackModel: undefined,
			subagents: {
				"agent-1": [
					line({
						message: { content: "Start subagent", role: "user" },
						timestamp: "2026-08-16T10:00:30.000Z",
						type: "user",
					}),
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
						timestamp: "2026-08-16T10:01:30.000Z",
						type: "assistant",
					}),
				].join("\n"),
			},
			turns,
		});
		const baselineFirst = baseline[0];
		const baselineSecond = baseline[1];
		const enrichedFirst = withSubagent[0];
		const enrichedSecond = withSubagent[1];

		expect(baselineFirst).toBeDefined();
		expect(baselineSecond).toBeDefined();
		expect(enrichedFirst?.usageEvents).toEqual(baselineFirst?.usageEvents);
		expect(enrichedFirst?.estimatedCost).toBeCloseTo(
			(baselineFirst?.estimatedCost ?? 0) + 1,
		);
		expect(enrichedSecond).toEqual(baselineSecond);
	});

	test("pins Claude trace, turn, metric, and pricing bytes", () => {
		expect(sha256(deriveTranscriptSnapshot(CLAUDE_TRANSCRIPT))).toBe(
			"f8342dac13b4824748e2be8b1bf2e5ab9e44038025cfeeff3c41a74815fb6053",
		);
	});

	test("pins Codex trace, stable turn ID, metric, and pricing bytes", () => {
		expect(
			sha256(deriveTranscriptSnapshot(CODEX_TRANSCRIPT, "gpt-5.6-sol")),
		).toBe("1f2f3b1a3353ff7cf2bcbd24a1aeff55c8c6012dd87182152cf9f96f9cabaf53");
	});

	test("keeps a Codex turn ID stable when unrelated lines are inserted", () => {
		const baseline = deriveTranscriptSnapshot(CODEX_TRANSCRIPT, "gpt-5.6-sol");
		const withIgnoredLine = CODEX_TRANSCRIPT.replace(
			CODEX_USER_LINE,
			`${line({ payload: { type: "ignored" }, timestamp: "2026-08-16T11:00:01.500Z", type: "event_msg" })}\n${CODEX_USER_LINE}`,
		);
		const inserted = deriveTranscriptSnapshot(withIgnoredLine, "gpt-5.6-sol");

		expect(JSON.parse(inserted).turnIds).toEqual(JSON.parse(baseline).turnIds);
		expect(JSON.parse(inserted).turnIds).toEqual(["codex-wn409s77n350"]);
	});
});
