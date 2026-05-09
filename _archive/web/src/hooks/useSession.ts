import { useMemo } from "react";
import type {
	Conversation,
	ToolResultContent,
} from "@/lib/conversation-schema";
import { parseConversations } from "@/lib/conversation-schema";

interface Session {
	content: string;
	subagents: Record<string, string>;
}

function isToolResult(
	block: string | { type: "text"; text: string } | ToolResultContent,
): block is ToolResultContent {
	return typeof block === "object" && block.type === "tool_result";
}

export function useSession(session: Session) {
	const { conversations, toolResultMap } = useMemo(() => {
		const parsed = parseConversations(session.content);
		const resultMap = new Map<string, ToolResultContent>();

		// Build tool result map from user entries
		for (const conv of parsed) {
			if (conv.type === "user" && Array.isArray(conv.message.content)) {
				for (const block of conv.message.content) {
					if (isToolResult(block)) {
						resultMap.set(block.tool_use_id, block);
					}
				}
			}
		}

		return { conversations: parsed, toolResultMap: resultMap };
	}, [session.content]);

	const getToolResult = (toolUseId: string) => toolResultMap.get(toolUseId);

	const subagents = useMemo(() => {
		const result = new Map<string, Array<Conversation>>();
		for (const [agentId, content] of Object.entries(session.subagents)) {
			result.set(agentId, parseConversations(content));
		}
		return result;
	}, [session.subagents]);

	return { conversations, getToolResult, subagents };
}
