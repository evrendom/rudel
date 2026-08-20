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

interface CodexAgentAttribution {
	agent?: { agent_name?: string };
}

interface CodexMessagePayload extends CodexAgentAttribution {
	type: string;
	role: string;
	content: Array<CodexContentBlock>;
}

interface CodexReasoningPayload extends CodexAgentAttribution {
	type: "reasoning";
	summary: Array<{ type: string; text: string }>;
}

interface CodexToolCallPayload extends CodexAgentAttribution {
	type: "function_call" | "custom_tool_call" | "tool_search_call";
	name?: string;
	arguments?: unknown;
	input?: string;
	call_id?: string;
}

interface CodexToolOutputPayload extends CodexAgentAttribution {
	type:
		| "function_call_output"
		| "custom_tool_call_output"
		| "tool_search_output";
	call_id?: string;
	output?: unknown;
	tools?: unknown;
}

interface CodexMultiAgentCallPayload extends CodexAgentAttribution {
	type: "multi_agent_call";
	action?: string;
	arguments?: unknown;
	call_id?: string;
}

interface CodexMultiAgentOutputPayload extends CodexAgentAttribution {
	type: "multi_agent_call_output";
	action?: string;
	call_id?: string;
	output?: unknown;
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

function readCodexModelSetting(line: CodexLine): string | undefined {
	if (line.type !== "turn_context") {
		return undefined;
	}

	if (typeof line.payload.effort === "string") {
		const modelSetting = line.payload.effort.trim();
		if (modelSetting) {
			return modelSetting;
		}
	}

	const collaborationMode = line.payload.collaboration_mode;
	if (
		typeof collaborationMode !== "object" ||
		collaborationMode === null ||
		!("settings" in collaborationMode) ||
		typeof collaborationMode.settings !== "object" ||
		collaborationMode.settings === null ||
		!("reasoning_effort" in collaborationMode.settings) ||
		typeof collaborationMode.settings.reasoning_effort !== "string"
	) {
		return undefined;
	}

	const modelSetting = collaborationMode.settings.reasoning_effort.trim();
	return modelSetting ? modelSetting : undefined;
}

function readAgentName(payload: CodexAgentAttribution) {
	const agentName = payload.agent?.agent_name?.trim();
	return agentName ? agentName : undefined;
}

function isDelegationToolName(toolName: string | undefined) {
	const normalizedName = toolName?.split(/\.|__/u).at(-1)?.toLowerCase();
	return (
		normalizedName === "agent" ||
		normalizedName === "task" ||
		normalizedName === "spawn_agent"
	);
}

// Same failure heuristic the turn metadata extractor applies to Codex tool
// outputs, so trace-level error marks agree with turn-level error counts.
const CODEX_TOOL_FAILURE_PATTERN =
	/(?:Error|Exception):|apply_patch verification failed:/iu;

function parseArguments(argumentsValue: unknown): Record<string, unknown> {
	if (
		typeof argumentsValue === "object" &&
		argumentsValue !== null &&
		!Array.isArray(argumentsValue)
	) {
		return argumentsValue as Record<string, unknown>;
	}
	if (typeof argumentsValue !== "string" || !argumentsValue) {
		return {};
	}
	try {
		const parsed = JSON.parse(argumentsValue) as unknown;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		// Fall through to the raw-string wrapper.
	}
	return { arguments: argumentsValue };
}

function toToolInput(payload: CodexToolCallPayload): Record<string, unknown> {
	if (payload.type === "custom_tool_call") {
		return { input: payload.input ?? "" };
	}
	return parseArguments(payload.arguments);
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

function extractSubagentId(outputText: string): string | undefined {
	try {
		const parsed = JSON.parse(outputText) as unknown;
		if (typeof parsed !== "object" || parsed === null) {
			return undefined;
		}
		for (const key of ["task_name", "agent_name", "agentId", "agent_id"]) {
			if (
				key in parsed &&
				typeof (parsed as Record<string, unknown>)[key] === "string"
			) {
				return (parsed as Record<string, string>)[key];
			}
		}
	} catch {
		return undefined;
	}
	return undefined;
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
	let rootModelSetting: string | undefined;
	const modelSettingsByAgent = new Map<string, string>();
	const pendingToolNames = new Map<string, string>();

	function getModelSetting(payload: CodexAgentAttribution) {
		const agentName = readAgentName(payload);
		if (!agentName || agentName === "/root") {
			return rootModelSetting;
		}
		return modelSettingsByAgent.get(agentName);
	}

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
		const nextModelSetting = readCodexModelSetting(parsed);
		if (nextModelSetting !== undefined) {
			const agentName = readAgentName(parsed.payload);
			if (agentName && agentName !== "/root") {
				modelSettingsByAgent.set(agentName, nextModelSetting);
			} else {
				rootModelSetting = nextModelSetting;
			}
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
			| CodexMultiAgentCallPayload
			| CodexMultiAgentOutputPayload
			| CodexReasoningPayload
			| CodexToolCallPayload
			| CodexToolOutputPayload;

		// Handle reasoning blocks — map to assistant entry with thinking content
		if (payload.type === "reasoning") {
			const reasoning = payload as CodexReasoningPayload;
			const modelSetting = getModelSetting(reasoning);
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
				agentName: readAgentName(reasoning),
				executionMode,
				...(modelSetting ? { modelSetting } : {}),
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
			payload.type === "tool_search_call" ||
			payload.type === "multi_agent_call"
		) {
			const call = payload as CodexMultiAgentCallPayload | CodexToolCallPayload;
			const modelSetting = getModelSetting(call);
			const entryId = getCodexEntryId(line);
			const toolName =
				call.type === "multi_agent_call"
					? (call.action ?? "multi_agent")
					: call.type === "tool_search_call"
						? "tool_search"
						: (call.name ?? "tool");
			const toolInput =
				call.type === "multi_agent_call"
					? parseArguments(call.arguments)
					: toToolInput(call);
			const callId = call.call_id ?? `${entryId}-call`;
			const toolUse: ToolUseContent = {
				type: "tool_use",
				id: callId,
				name: toolName,
				input: toolInput,
			};
			pendingToolNames.set(callId, toolName);
			const entry: AssistantEntry = {
				agentName: readAgentName(call),
				executionMode,
				...(modelSetting ? { modelSetting } : {}),
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
			payload.type === "tool_search_output" ||
			payload.type === "multi_agent_call_output"
		) {
			const output = payload as
				| CodexMultiAgentOutputPayload
				| CodexToolOutputPayload;
			if (!output.call_id) continue;
			const text =
				output.type === "tool_search_output"
					? toToolOutputText(output.tools)
					: toToolOutputText(output.output);
			const toolName =
				output.type === "multi_agent_call_output"
					? (output.action ?? pendingToolNames.get(output.call_id))
					: pendingToolNames.get(output.call_id);
			const resultBlock: ToolResultContent = {
				type: "tool_result",
				tool_use_id: output.call_id,
				content: text,
				is_error: CODEX_TOOL_FAILURE_PATTERN.test(text) ? true : undefined,
			};
			const entry: UserEntry = {
				agentName: readAgentName(output),
				uuid: getCodexEntryId(line),
				timestamp: parsed.timestamp,
				sessionId,
				type: "user",
				...(isDelegationToolName(toolName)
					? {
							toolUseResult: {
								agentId: extractSubagentId(text),
							},
						}
					: {}),
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
				agentName: readAgentName(msg),
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
			const modelSetting = getModelSetting(msg);
			const textBlocks: TextContent[] = textParts.map((text) => ({
				type: "text" as const,
				text,
			}));

			const entry: AssistantEntry = {
				agentName: readAgentName(msg),
				executionMode,
				...(modelSetting ? { modelSetting } : {}),
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
