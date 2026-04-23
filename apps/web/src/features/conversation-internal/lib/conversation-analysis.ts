import { buildClaudeTokenTimeline } from "@rudel/api-routes";
import type {
	TokenDataPoint,
	ToolActivityPoint,
} from "@/features/conversation-internal/lib/analysis-types";
import type { Conversation } from "@/features/conversation-internal/lib/conversation-schema";
import { parseConversations } from "@/features/conversation-internal/lib/conversation-schema";
import { isSlashCommandMessage } from "@/features/conversation-internal/lib/parse-slash-command";
import {
	extractCodexTokenData,
	isCodexFormat,
} from "@/lib/codex-conversation-parser";

export interface ConversationArtifacts {
	conversations: Conversation[];
	parseError: string | null;
	tokenData: TokenDataPoint[];
	toolActivityData: ToolActivityPoint[];
	totalMessages: number;
}

function getTokenData(content: string): TokenDataPoint[] {
	// Internal conversation charts need provider-specific token extraction
	// because Codex does not emit Claude-style assistant usage entries.
	if (isCodexFormat(content)) {
		return extractCodexTokenData(content);
	}

	// Anthropic reports uncached input separately from cache reads and writes,
	// so Claude charts must expand those fields to show the true processed input.
	return buildClaudeTokenTimeline(content, {}).map((point, messageIndex) => ({
		messageIndex,
		inputTokens: point.input_tokens,
		outputTokens: point.output_tokens,
		uncachedInputTokens: point.uncached_input_tokens,
		cacheReadInputTokens: point.cache_read_input_tokens,
		cacheCreationInputTokens: point.cache_creation_input_tokens,
		totalTokens: point.total_tokens,
		source: point.source,
		sourceId: point.source_id,
		timestamp: point.timestamp,
	}));
}

function extractToolActivity(entries: Conversation[]): ToolActivityPoint[] {
	const points: ToolActivityPoint[] = [];

	for (let i = 0; i < entries.length; i += 1) {
		const entry = entries[i];

		if (entry?.type === "user") {
			const { content } = entry.message;
			if (typeof content === "string" && isSlashCommandMessage(content)) {
				points.push({
					messageIndex: i,
					category: "skill",
					name: "slash-command",
					isError: false,
				});
			}
			if (Array.isArray(content)) {
				for (const block of content) {
					if (typeof block === "object" && block.type === "tool_result") {
						points.push({
							messageIndex: i,
							category: "tool",
							name: "tool_result",
							isError: block.is_error === true,
						});
					}
				}
			}
		}

		if (entry?.type === "assistant") {
			for (const block of entry.message.content) {
				if (block.type !== "tool_use") continue;
				if (block.name === "Task") {
					const subagentType =
						typeof block.input.subagent_type === "string"
							? block.input.subagent_type
							: "Task";
					points.push({
						messageIndex: i,
						category: "subagent",
						name: subagentType,
						isError: false,
					});
					continue;
				}
				points.push({
					messageIndex: i,
					category: "tool",
					name: block.name,
					isError: false,
				});
			}
		}
	}

	return points;
}

function deriveParseError(content: string, conversations: Conversation[]) {
	if (!content || content.trim() === "") {
		return null;
	}

	const lines = content.split("\n").filter((line) => line.trim() !== "");
	if (conversations.length > 0 || lines.length === 0) {
		return null;
	}

	try {
		JSON.parse(lines[0] as string);
		return `Failed to parse ${lines.length} conversation entries. Check console for details.`;
	} catch {
		return "Content is not valid JSONL format";
	}
}

export function buildConversationArtifacts(
	content: string,
): ConversationArtifacts {
	try {
		const conversations =
			content && content.trim() !== "" ? parseConversations(content) : [];
		const parseError = deriveParseError(content, conversations);

		return {
			conversations,
			parseError,
			tokenData: conversations.length > 0 ? getTokenData(content) : [],
			toolActivityData:
				conversations.length > 0 ? extractToolActivity(conversations) : [],
			totalMessages: conversations.length,
		};
	} catch (error) {
		console.error(
			"[conversation-analysis] Error parsing conversations:",
			error,
		);
		return {
			conversations: [],
			parseError: error instanceof Error ? error.message : "Unknown error",
			tokenData: [],
			toolActivityData: [],
			totalMessages: 0,
		};
	}
}
