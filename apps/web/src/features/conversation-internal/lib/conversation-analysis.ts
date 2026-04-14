import type {
	TokenDataPoint,
	ToolActivityPoint,
} from "@/features/conversation-internal/lib/analysis-types";
import type { Conversation } from "@/features/conversation-internal/lib/conversation-schema";
import { parseConversations } from "@/features/conversation-internal/lib/conversation-schema";
import { isSlashCommandMessage } from "@/features/conversation-internal/lib/parse-slash-command";

export interface ConversationArtifacts {
	conversations: Conversation[];
	parseError: string | null;
	tokenData: TokenDataPoint[];
	toolActivityData: ToolActivityPoint[];
	totalMessages: number;
}

function extractTokenData(content: string): TokenDataPoint[] {
	const points: TokenDataPoint[] = [];
	const lines = content.split("\n").filter((line) => line.trim() !== "");

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i];
		if (!line) {
			continue;
		}

		try {
			const parsed = JSON.parse(line) as {
				type?: string;
				message?: {
					usage?: {
						input_tokens?: number;
						output_tokens?: number;
					};
				};
			};

			if (parsed.type !== "assistant") {
				continue;
			}
			const usage = parsed.message?.usage;
			if (!usage) {
				continue;
			}

			points.push({
				messageIndex: i,
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
				if (block.type !== "tool_use") {
					continue;
				}
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
			tokenData: conversations.length > 0 ? extractTokenData(content) : [],
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
