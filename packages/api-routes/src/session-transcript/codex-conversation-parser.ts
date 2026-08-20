import type {
	AssistantEntry,
	Conversation,
	ConversationExecutionMode,
	SystemEntry,
	TextContent,
	ThinkingContent,
	ToolResultContent,
	ToolUseContent,
	UserEntry,
} from "./conversation-schema.js";

interface CodexLine {
	timestamp: string;
	type: string;
	payload: Record<string, unknown>;
}

interface CodexContentBlock {
	type: string;
	text?: string;
}

interface CodexMessagePayload {
	type: string;
	role: string;
	content: Array<CodexContentBlock>;
}

interface CodexReasoningPayload {
	type: "reasoning";
	summary: Array<{ type: string; text: string }>;
}

interface CodexToolCallPayload {
	type: "function_call" | "custom_tool_call" | "tool_search_call";
	name?: string;
	arguments?: unknown;
	input?: string;
	call_id?: string;
}

interface CodexToolOutputPayload {
	type:
		| "function_call_output"
		| "custom_tool_call_output"
		| "tool_search_output";
	call_id?: string;
	output?: unknown;
	tools?: unknown;
}

function hashCodexEntryContent(value: string) {
	let first = 0x81_1c_9d_c5;
	let second = 0x9e_37_79_b9;

	for (let index = 0; index < value.length; index++) {
		const codeUnit = value.charCodeAt(index);
		first = Math.imul(first ^ codeUnit, 0x01_00_01_93);
		second = Math.imul(second ^ codeUnit, 0x85_eb_ca_6b);
	}

	return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}

function getCodexEntryId(rawLine: string) {
	return `codex-${hashCodexEntryContent(rawLine)}`;
}

function readCodexExecutionMode(
	line: CodexLine,
): ConversationExecutionMode | undefined {
	if (
		line.type === "event_msg" &&
		line.payload.type === "task_started" &&
		typeof line.payload.collaboration_mode_kind === "string"
	) {
		return line.payload.collaboration_mode_kind === "plan" ? "plan" : "default";
	}

	const collaborationMode = line.payload.collaboration_mode;
	if (
		line.type !== "turn_context" ||
		typeof collaborationMode !== "object" ||
		collaborationMode === null ||
		!("mode" in collaborationMode) ||
		typeof collaborationMode.mode !== "string"
	) {
		return undefined;
	}

	return collaborationMode.mode === "plan" ? "plan" : "default";
}

// Same failure heuristic the turn metadata extractor applies to Codex tool
// outputs, so trace-level error marks agree with turn-level error counts.
const CODEX_TOOL_FAILURE_PATTERN =
	/(?:Error|Exception):|apply_patch verification failed:/iu;

function toToolInput(payload: CodexToolCallPayload): Record<string, unknown> {
	if (payload.type === "custom_tool_call") {
		return { input: payload.input ?? "" };
	}
	if (payload.type === "tool_search_call") {
		return typeof payload.arguments === "object" &&
			payload.arguments !== null &&
			!Array.isArray(payload.arguments)
			? (payload.arguments as Record<string, unknown>)
			: {};
	}
	if (typeof payload.arguments !== "string" || !payload.arguments) {
		return {};
	}
	try {
		const parsed = JSON.parse(payload.arguments) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// Fall through to the raw-string wrapper.
	}
	return { arguments: payload.arguments };
}

// Tool outputs arrive as plain strings, block arrays, or JSON-encoded block
// arrays; normalize them to the display string tool_result carriers expect.
function toToolOutputText(output: unknown): string {
	let blocks: unknown = output;
	if (typeof output === "string") {
		if (!output.startsWith("[") && !output.startsWith("{")) {
			return output;
		}
		try {
			blocks = JSON.parse(output);
		} catch {
			return output;
		}
	}
	if (Array.isArray(blocks)) {
		const texts = blocks
			.map((block) =>
				block &&
				typeof block === "object" &&
				typeof (block as { text?: unknown }).text === "string"
					? (block as { text: string }).text
					: "",
			)
			.filter(Boolean);
		if (texts.length > 0) {
			return texts.join("\n");
		}
	}
	return typeof output === "string" ? output : JSON.stringify(output ?? "");
}

/**
 * Detect whether JSONL content is in Codex format by checking the first line.
 */
export function isCodexFormat(content: string): boolean {
	const firstNewline = content.indexOf("\n");
	const firstLine =
		firstNewline === -1 ? content : content.slice(0, firstNewline);
	if (!firstLine) return false;
	try {
		const parsed = JSON.parse(firstLine) as { type?: string };
		return parsed.type === "session_meta";
	} catch {
		return false;
	}
}

/**
 * Parse Codex JSONL content into the Conversation[] format used by ConversationView.
 *
 * Codex entries have: { timestamp, type, payload }
 * We extract user/assistant messages from `response_item` lines and reasoning
 * from `reasoning` response items, skipping internal events.
 */
export function parseCodexConversations(content: string): Array<Conversation> {
	const conversations: Array<Conversation> = [];
	const lines = content.split("\n").filter(Boolean);

	let sessionId = "";
	let executionMode: ConversationExecutionMode = "unknown";

	for (const line of lines) {
		let parsed: CodexLine;
		try {
			parsed = JSON.parse(line) as CodexLine;
		} catch {
			continue;
		}

		if (parsed.type === "session_meta") {
			sessionId = (parsed.payload as { id?: string }).id ?? "codex-session";
			continue;
		}

		const nextExecutionMode = readCodexExecutionMode(parsed);
		if (nextExecutionMode !== undefined) {
			executionMode = nextExecutionMode;
		}

		if (parsed.type === "event_msg" && parsed.payload.type === "turn_aborted") {
			const entry: SystemEntry = {
				uuid: getCodexEntryId(line),
				timestamp: parsed.timestamp,
				sessionId,
				type: "system",
				message: { content: "Turn aborted" },
			};
			conversations.push(entry);
			continue;
		}

		if (parsed.type !== "response_item") continue;

		const payload = parsed.payload as unknown as
			| CodexMessagePayload
			| CodexReasoningPayload;

		// Handle reasoning blocks — map to assistant entry with thinking content
		if (payload.type === "reasoning") {
			const reasoning = payload as CodexReasoningPayload;
			const summaryText = reasoning.summary
				.map((s) => s.text)
				.filter(Boolean)
				.join("\n");
			if (!summaryText) continue;

			const thinkingBlock: ThinkingContent = {
				type: "thinking",
				thinking: summaryText,
			};

			const entry: AssistantEntry = {
				executionMode,
				uuid: getCodexEntryId(line),
				timestamp: parsed.timestamp,
				sessionId,
				type: "assistant",
				message: {
					role: "assistant",
					content: [thinkingBlock],
				},
			};
			conversations.push(entry);
			continue;
		}

		// Tool calls become assistant tool_use blocks and their outputs become
		// tool_result carriers, so Codex shell/tool activity shows up in the
		// trace the same way Claude Code tool events do.
		if (
			payload.type === "function_call" ||
			payload.type === "custom_tool_call" ||
			payload.type === "tool_search_call"
		) {
			const call = payload as CodexToolCallPayload;
			const entryId = getCodexEntryId(line);
			const toolUse: ToolUseContent = {
				type: "tool_use",
				id: call.call_id ?? `${entryId}-call`,
				name:
					call.type === "tool_search_call"
						? "tool_search"
						: (call.name ?? "tool"),
				input: toToolInput(call),
			};
			const entry: AssistantEntry = {
				executionMode,
				uuid: entryId,
				timestamp: parsed.timestamp,
				sessionId,
				type: "assistant",
				message: { role: "assistant", content: [toolUse] },
			};
			conversations.push(entry);
			continue;
		}

		if (
			payload.type === "function_call_output" ||
			payload.type === "custom_tool_call_output" ||
			payload.type === "tool_search_output"
		) {
			const output = payload as CodexToolOutputPayload;
			if (!output.call_id) continue;
			const text =
				output.type === "tool_search_output"
					? toToolOutputText(output.tools)
					: toToolOutputText(output.output);
			const resultBlock: ToolResultContent = {
				type: "tool_result",
				tool_use_id: output.call_id,
				content: text,
				is_error: CODEX_TOOL_FAILURE_PATTERN.test(text) ? true : undefined,
			};
			const entry: UserEntry = {
				uuid: getCodexEntryId(line),
				timestamp: parsed.timestamp,
				sessionId,
				type: "user",
				message: { role: "user", content: [resultBlock] },
			};
			conversations.push(entry);
			continue;
		}

		if (payload.type !== "message") continue;

		const msg = payload as CodexMessagePayload;

		// Skip developer messages (system prompts, permissions, collaboration mode)
		if (msg.role === "developer") continue;

		const textParts = (msg.content ?? [])
			.filter(
				(block) => block.type === "input_text" || block.type === "output_text",
			)
			.map((block) => block.text ?? "")
			.filter(Boolean);

		if (textParts.length === 0) continue;

		if (msg.role === "user") {
			const entry: UserEntry = {
				uuid: getCodexEntryId(line),
				timestamp: parsed.timestamp,
				sessionId,
				type: "user",
				message: {
					role: "user",
					content: textParts.join("\n"),
				},
			};
			conversations.push(entry);
		} else if (msg.role === "assistant") {
			const textBlocks: TextContent[] = textParts.map((text) => ({
				type: "text" as const,
				text,
			}));

			const entry: AssistantEntry = {
				executionMode,
				uuid: getCodexEntryId(line),
				timestamp: parsed.timestamp,
				sessionId,
				type: "assistant",
				message: {
					role: "assistant",
					content: textBlocks,
				},
			};
			conversations.push(entry);
		}
	}

	return conversations;
}

/**
 * Extract token usage data from Codex JSONL.
 * Codex stores tokens in event_msg lines with type "token_count".
 */
export function extractCodexTokenData(
	content: string,
): Array<{ messageIndex: number; inputTokens: number; outputTokens: number }> {
	const points: Array<{
		messageIndex: number;
		inputTokens: number;
		outputTokens: number;
	}> = [];
	const lines = content.split("\n").filter((line) => line.trim() !== "");
	let previousInputTokens = 0;
	let previousOutputTokens = 0;
	let tokenSnapshotIndex = 0;

	for (let i = 0; i < lines.length; i++) {
		try {
			const parsed = JSON.parse(lines[i] as string) as {
				type?: string;
				payload?: {
					type?: string;
					info?: {
						total_token_usage?: {
							input_tokens?: number;
							cached_input_tokens?: number;
							output_tokens?: number;
						};
					};
				};
			};

			if (parsed.type !== "event_msg") continue;
			if (parsed.payload?.type !== "token_count") continue;

			const usage = parsed.payload.info?.total_token_usage;
			if (!usage) continue;
			const currentInputTokens = Math.max(
				0,
				(usage.input_tokens ?? previousInputTokens) -
					(usage.cached_input_tokens ?? 0),
			);
			const currentOutputTokens = usage.output_tokens ?? previousOutputTokens;
			const inputTokens = Math.max(0, currentInputTokens - previousInputTokens);
			const outputTokens = Math.max(
				0,
				currentOutputTokens - previousOutputTokens,
			);

			previousInputTokens = currentInputTokens;
			previousOutputTokens = currentOutputTokens;

			if (inputTokens === 0 && outputTokens === 0) {
				continue;
			}

			points.push({
				messageIndex: tokenSnapshotIndex,
				inputTokens,
				outputTokens,
			});
			tokenSnapshotIndex += 1;
		} catch {
			// Skip malformed lines
		}
	}

	return points;
}
