import type {
	AssistantEntry,
	Conversation,
	TextContent,
	ThinkingContent,
	UserEntry,
} from "./conversation-schema";

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
	let entryIndex = 0;

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
				uuid: `codex-${entryIndex++}`,
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
				uuid: `codex-${entryIndex++}`,
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
				uuid: `codex-${entryIndex++}`,
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
			// Codex snapshots already report total input with cached tokens included,
			// so the per-point delta should be based on raw cumulative input.
			const currentInputTokens = usage.input_tokens ?? previousInputTokens;
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
