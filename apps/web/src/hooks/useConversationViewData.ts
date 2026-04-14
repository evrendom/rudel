import { useMemo } from "react";
import type { TokenDataPoint } from "@/components/conversation/TokenUsageChart";
import type { ToolActivityPoint } from "@/components/conversation/ToolActivityChart";
import { extractCodexTokenData } from "@/lib/codex-conversation-parser";
import type { Conversation } from "@/lib/conversation-schema";
import { isCodexFormat, parseConversations } from "@/lib/conversation-schema";
import { isSlashCommandMessage } from "@/lib/parse-slash-command";

interface UseConversationViewDataOptions {
	content: string;
}

interface ConversationViewData {
	conversations: Conversation[];
	parseError: string | null;
	tokenData: TokenDataPoint[];
	toolActivity: ToolActivityPoint[];
	totalMessages: number;
}

type ParsedAssistantMessage = {
	type?: string;
	message?: {
		usage?: {
			input_tokens?: number;
			output_tokens?: number;
		};
	};
};

function collectUserToolActivity(
	entry: Conversation,
	messageIndex: number,
	points: ToolActivityPoint[],
) {
	if (entry.type !== "user") {
		return;
	}

	const { content } = entry.message;
	if (typeof content === "string") {
		if (!isSlashCommandMessage(content)) {
			return;
		}

		points.push({
			messageIndex,
			category: "skill",
			name: "slash-command",
			isError: false,
		});
		return;
	}

	if (!Array.isArray(content)) {
		return;
	}

	for (const block of content) {
		if (typeof block !== "object" || block.type !== "tool_result") {
			continue;
		}

		points.push({
			messageIndex,
			category: "tool",
			name: "tool_result",
			isError: block.is_error === true,
		});
	}
}

function collectAssistantToolActivity(
	entry: Conversation,
	messageIndex: number,
	points: ToolActivityPoint[],
) {
	if (entry.type !== "assistant") {
		return;
	}

	for (const block of entry.message.content) {
		if (block.type !== "tool_use") {
			continue;
		}

		if (block.name === "Task") {
			const subagentType =
				typeof block.input.subagent_type === "string"
					? block.input.subagent_type
					: "Task";
			points.push({
				messageIndex,
				category: "subagent",
				name: subagentType,
				isError: false,
			});
			continue;
		}

		points.push({
			messageIndex,
			category: "tool",
			name: block.name,
			isError: false,
		});
	}
}

function extractTokenData(content: string): TokenDataPoint[] {
	const points: TokenDataPoint[] = [];
	const lines = content.split("\n").filter((line) => line.trim() !== "");

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (!line) {
			continue;
		}

		try {
			const parsed = JSON.parse(line) as ParsedAssistantMessage;
			if (parsed.type !== "assistant") {
				continue;
			}

			const usage = parsed.message?.usage;
			if (!usage) {
				continue;
			}

			points.push({
				messageIndex: index,
				inputTokens: usage.input_tokens ?? 0,
				outputTokens: usage.output_tokens ?? 0,
			});
		} catch {
			// Skip malformed JSON lines.
		}
	}

	return points;
}

function extractToolActivity(entries: Conversation[]): ToolActivityPoint[] {
	const points: ToolActivityPoint[] = [];

	for (let index = 0; index < entries.length; index += 1) {
		const entry = entries[index];
		if (!entry) {
			continue;
		}

		collectUserToolActivity(entry, index, points);
		collectAssistantToolActivity(entry, index, points);
	}

	return points;
}

export function useConversationViewData({
	content,
}: UseConversationViewDataOptions): ConversationViewData {
	const parsedData = useMemo(() => {
		if (!content || content.trim() === "") {
			return {
				conversations: [] satisfies Conversation[],
				parseError: null,
				tokenData: [] satisfies TokenDataPoint[],
				toolActivity: [] satisfies ToolActivityPoint[],
			};
		}

		try {
			const lines = content.split("\n").filter((line) => line.trim() !== "");
			const conversations = parseConversations(content);

			let parseError: string | null = null;
			if (conversations.length === 0 && lines.length > 0) {
				try {
					JSON.parse(lines[0] as string);
					parseError = `Failed to parse ${lines.length} conversation entries. Check console for details.`;
				} catch {
					parseError = "Content is not valid JSONL format";
				}
			}

			return {
				conversations,
				parseError,
				tokenData: isCodexFormat(content)
					? extractCodexTokenData(content)
					: extractTokenData(content),
				toolActivity: extractToolActivity(conversations),
			};
		} catch (error) {
			console.error("[ConversationView] Error parsing conversations:", error);
			return {
				conversations: [] satisfies Conversation[],
				parseError: error instanceof Error ? error.message : "Unknown error",
				tokenData: [] satisfies TokenDataPoint[],
				toolActivity: [] satisfies ToolActivityPoint[],
			};
		}
	}, [content]);

	return {
		conversations: parsedData.conversations,
		parseError: parsedData.parseError,
		tokenData: parsedData.tokenData,
		toolActivity: parsedData.toolActivity,
		totalMessages: parsedData.conversations.length,
	};
}
