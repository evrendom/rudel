import { describe, expect, test } from "bun:test";
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
