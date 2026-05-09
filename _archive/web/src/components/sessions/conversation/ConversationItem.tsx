import type {
	Conversation,
	ToolResultContent,
} from "@/lib/conversation-schema";
import { AssistantConversationContent } from "./AssistantConversationContent";
import { SummaryConversationContent } from "./SummaryConversationContent";
import { SystemConversationContent } from "./SystemConversationContent";
import { UserConversationContent } from "./UserConversationContent";

interface ConversationItemProps {
	conversation: Conversation;
	getToolResult: (toolUseId: string) => ToolResultContent | undefined;
	subagents: Map<string, Array<Conversation>>;
	showIcon?: boolean;
}

export function ConversationItem({
	conversation,
	getToolResult,
	subagents,
	showIcon = true,
}: ConversationItemProps) {
	switch (conversation.type) {
		case "user":
			return (
				<UserConversationContent entry={conversation} showIcon={showIcon} />
			);
		case "assistant":
			return (
				<AssistantConversationContent
					entry={conversation}
					getToolResult={getToolResult}
					subagents={subagents}
					showIcon={showIcon}
				/>
			);
		case "summary":
			return <SummaryConversationContent entry={conversation} />;
		case "system":
			return <SystemConversationContent entry={conversation} />;
		default:
			return null;
	}
}
