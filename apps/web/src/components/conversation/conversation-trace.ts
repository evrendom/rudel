import type {
	Conversation,
	ConversationExecutionMode,
	TextContent,
	ThinkingContent,
	ToolResultContent,
	ToolUseContent,
} from "@/lib/conversation-schema";

/**
 * Reshapes a parsed transcript into the flat invocation trace the session sheet
 * renders: one row per user turn, and one collapsible section per agent turn
 * containing a row per reasoning block, tool call, and assistant message.
 *
 * Tool results arrive as their own `user` entries rather than attached to the
 * call that produced them, so they are paired back onto their `tool_use` by
 * `tool_use_id` and never surface as user turns of their own.
 */

export type TraceToolResult = {
	content: ToolResultContent["content"];
	isError: boolean;
};

export type TraceSkillContent = {
	baseDirectory: string;
	content: string;
};

export type TraceEvent =
	| { kind: "reasoning"; id: string; timestamp: string; text: string }
	| {
			kind: "message";
			id: string;
			timestamp: string;
			content: TextContent[] | string;
			text: string;
	  }
	| {
			kind: "tool";
			id: string;
			timestamp: string;
			toolName: string;
			input: Record<string, unknown>;
			result: TraceToolResult | undefined;
			skillContent?: TraceSkillContent;
	  }
	| {
			kind: "orphan-result";
			id: string;
			timestamp: string;
			result: TraceToolResult;
	  };

export type UserContent = Extract<
	Conversation,
	{ type: "user" }
>["message"]["content"];

export type TraceSystemType =
	| "context"
	| "interruption"
	| "notification"
	| "system";

export type TraceItem =
	| { kind: "user"; id: string; timestamp: string; content: UserContent }
	| {
			kind: "agent";
			id: string;
			timestamp: string;
			executionMode: ConversationExecutionMode;
			events: TraceEvent[];
	  }
	| {
			kind: "system";
			id: string;
			timestamp: string;
			text: string;
			systemType: TraceSystemType;
	  }
	| { kind: "summary"; id: string; timestamp: undefined; text: string };

function isToolResult(value: unknown): value is ToolResultContent {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as { type?: unknown }).type === "tool_result"
	);
}

/**
 * A `user` entry carrying nothing but tool results is the transport for the
 * previous agent turn's output, not something a person typed.
 */
function isToolResultCarrier(content: UserContent): boolean {
	return (
		Array.isArray(content) &&
		content.length > 0 &&
		content.every((item) => isToolResult(item))
	);
}

function collectToolResults(content: UserContent): ToolResultContent[] {
	if (!Array.isArray(content)) {
		return [];
	}

	return content.filter((item): item is ToolResultContent =>
		isToolResult(item),
	);
}

function textFromUserTextBlocks(content: UserContent): string | undefined {
	if (!Array.isArray(content) || content.length === 0) {
		return undefined;
	}

	const textBlocks: TextContent[] = [];
	for (const block of content) {
		if (typeof block === "string" || block.type !== "text") {
			return undefined;
		}

		textBlocks.push(block);
	}

	return textFromBlocks(textBlocks);
}

function toTraceResult(result: ToolResultContent): TraceToolResult {
	return { content: result.content, isError: result.is_error === true };
}

export function toolResultText(content: ToolResultContent["content"]): string {
	if (typeof content === "string") {
		return content;
	}

	return content
		.flatMap((part) =>
			"text" in part && part.type === "text" && part.text ? [part.text] : [],
		)
		.join("\n");
}

/** The prose a person actually typed, with tool-result payloads left out. */
export function userContentText(content: UserContent): string {
	if (typeof content === "string") {
		return content;
	}

	return content
		.flatMap((part) => {
			if (typeof part === "string") {
				return part ? [part] : [];
			}

			return part.type === "text" && part.text ? [part.text] : [];
		})
		.join("\n");
}

export function compactPreview(text: string, maxLength = 140): string {
	const normalized = text.replace(/\s+/g, " ").trim();

	if (normalized.length <= maxLength) {
		return normalized;
	}

	return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function textFromBlocks(blocks: TextContent[]): string {
	return blocks.map((block) => block.text).join("\n");
}

function classifyNonMemberUserEntry(
	entry: Extract<Conversation, { type: "user" }>,
): TraceSystemType | undefined {
	const text = userContentText(entry.message.content).trim();
	if (entry.isMeta === true) {
		return "context";
	}

	if (/^\[Request interrupted by user\]$/iu.test(text)) {
		return "interruption";
	}

	if (/^<task-notification(?:\s|>)/iu.test(text)) {
		return "notification";
	}

	return undefined;
}

function parseClaudeSkillContent(text: string): TraceSkillContent | undefined {
	const normalizedText = text.replace(/\r\n?/gu, "\n");
	const [header, ...contentLines] = normalizedText.split("\n");
	const headerPrefix = "Base directory for this skill:";

	if (!header?.startsWith(headerPrefix)) {
		return undefined;
	}

	const baseDirectory = header.slice(headerPrefix.length).trim();
	const content = contentLines.join("\n").trimStart();

	if (baseDirectory === "" || content === "") {
		return undefined;
	}

	return { baseDirectory, content };
}

function attachClaudeSkillContent(events: TraceEvent[], text: string): boolean {
	const previousEvent = events.at(-1);
	if (
		previousEvent?.kind !== "tool" ||
		previousEvent.toolName.toLowerCase() !== "skill"
	) {
		return false;
	}

	const skillContent = parseClaudeSkillContent(text);
	if (!skillContent) {
		return false;
	}

	previousEvent.skillContent = skillContent;
	return true;
}

/**
 * Groups entries into trace items. Consecutive assistant entries, plus the
 * tool-result carriers between them, collapse into a single agent section.
 */
export function buildConversationTrace(
	conversations: Conversation[],
): TraceItem[] {
	const items: TraceItem[] = [];
	// Events for the agent section currently being accumulated.
	let agentEvents: TraceEvent[] = [];
	let agentTimestamp: string | undefined;
	let agentId: string | undefined;
	let agentExecutionMode: ConversationExecutionMode = "unknown";
	// tool_use_id -> event awaiting its result, for the open section.
	const pendingToolEvents = new Map<
		string,
		Extract<TraceEvent, { kind: "tool" }>
	>();

	function flushAgentSection() {
		if (agentEvents.length > 0 && agentId && agentTimestamp) {
			items.push({
				kind: "agent",
				id: agentId,
				timestamp: agentTimestamp,
				executionMode: agentExecutionMode,
				events: agentEvents,
			});
		}

		agentEvents = [];
		agentTimestamp = undefined;
		agentId = undefined;
		agentExecutionMode = "unknown";
		pendingToolEvents.clear();
	}

	conversations.forEach((entry, index) => {
		if (entry.type === "summary") {
			flushAgentSection();
			items.push({
				kind: "summary",
				id: `summary-${index}`,
				timestamp: undefined,
				text: entry.summary,
			});
			return;
		}

		if (entry.type === "system") {
			if (attachClaudeSkillContent(agentEvents, entry.message.content)) {
				return;
			}

			flushAgentSection();
			items.push({
				kind: "system",
				id: entry.uuid,
				systemType: "system",
				timestamp: entry.timestamp,
				text: entry.message.content,
			});
			return;
		}

		if (entry.type === "assistant") {
			if (agentId === undefined) {
				agentId = entry.uuid;
				agentTimestamp = entry.timestamp;
				agentExecutionMode = entry.executionMode;
			} else if (agentExecutionMode === "unknown") {
				agentExecutionMode = entry.executionMode;
			}

			entry.message.content.forEach((block, blockIndex) => {
				const id = `${entry.uuid}-${blockIndex}`;

				if (block.type === "thinking") {
					agentEvents.push({
						kind: "reasoning",
						id,
						timestamp: entry.timestamp,
						text: (block as ThinkingContent).thinking,
					});
					return;
				}

				if (block.type === "tool_use") {
					const toolBlock = block as ToolUseContent;
					const event: Extract<TraceEvent, { kind: "tool" }> = {
						kind: "tool",
						id,
						timestamp: entry.timestamp,
						toolName: toolBlock.name,
						input: toolBlock.input,
						result: undefined,
					};
					agentEvents.push(event);
					pendingToolEvents.set(toolBlock.id, event);
					return;
				}

				const textBlock = block as TextContent;
				agentEvents.push({
					kind: "message",
					id,
					timestamp: entry.timestamp,
					content: [textBlock],
					text: textFromBlocks([textBlock]),
				});
			});

			return;
		}

		// entry.type === "user"
		if (isToolResultCarrier(entry.message.content)) {
			collectToolResults(entry.message.content).forEach(
				(result, resultIndex) => {
					const pending = pendingToolEvents.get(result.tool_use_id);

					if (pending) {
						pending.result = toTraceResult(result);
						pendingToolEvents.delete(result.tool_use_id);
						return;
					}

					// A result with no matching call in this section still has to be
					// visible rather than silently dropped.
					agentEvents.push({
						kind: "orphan-result",
						id: `${entry.uuid}-${resultIndex}`,
						timestamp: entry.timestamp,
						result: toTraceResult(result),
					});
				},
			);

			if (agentId === undefined) {
				agentId = entry.uuid;
				agentTimestamp = entry.timestamp;
			}

			return;
		}

		const userTextBlockContent = textFromUserTextBlocks(entry.message.content);
		if (
			userTextBlockContent !== undefined &&
			attachClaudeSkillContent(agentEvents, userTextBlockContent)
		) {
			return;
		}

		const systemType = classifyNonMemberUserEntry(entry);
		if (systemType) {
			flushAgentSection();
			items.push({
				kind: "system",
				id: entry.uuid,
				systemType,
				timestamp: entry.timestamp,
				text: userContentText(entry.message.content),
			});
			return;
		}

		flushAgentSection();
		items.push({
			kind: "user",
			id: entry.uuid,
			timestamp: entry.timestamp,
			content: entry.message.content,
		});
	});

	flushAgentSection();

	return items;
}

/** Wall-clock gap between two ISO timestamps, or undefined if unusable. */
export function formatTimeDelta(
	fromTimestamp: string | undefined,
	toTimestamp: string | undefined,
): string | undefined {
	if (!fromTimestamp || !toTimestamp) {
		return undefined;
	}

	const from = new Date(fromTimestamp).getTime();
	const to = new Date(toTimestamp).getTime();

	if (Number.isNaN(from) || Number.isNaN(to) || to < from) {
		return undefined;
	}

	// Round up: a gap the user waited through should never read as less time
	// than it took.
	const totalSeconds = Math.ceil((to - from) / 1000);

	// Every block in one assistant message carries that message's timestamp, so
	// a zero gap means "no measurable time passed" rather than a real duration.
	// Rendering "+0s" on each of those rows is noise.
	if (totalSeconds === 0) {
		return undefined;
	}

	if (totalSeconds < 60) {
		return `+${totalSeconds}s`;
	}

	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	if (minutes < 60) {
		return seconds === 0 ? `+${minutes}m` : `+${minutes}m ${seconds}s`;
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;

	// Past a few days, hours stop being the unit anyone reads in.
	if (hours >= 72) {
		const days = Math.floor(hours / 24);
		const remainingHours = hours % 24;

		return remainingHours === 0 ? `+${days}d` : `+${days}d ${remainingHours}h`;
	}

	return remainingMinutes === 0
		? `+${hours}h`
		: `+${hours}h ${remainingMinutes}m`;
}

export function formatClockTime(timestamp: string | undefined): string {
	if (!timestamp) {
		return "";
	}

	const date = new Date(timestamp);

	if (Number.isNaN(date.getTime())) {
		return "";
	}

	return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
