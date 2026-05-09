import type {
	Conversation,
	SummaryEntry,
	ToolResultContent,
	UserEntry,
} from "@/lib/conversation-schema";
import type { ParsedSlashCommand } from "@/lib/parse-slash-command";
import {
	isSlashCommandMessage,
	parseSlashCommand,
} from "@/lib/parse-slash-command";
import { ConversationItem } from "./ConversationItem";
import { SlashCommandContent } from "./SlashCommandContent";
import { SummaryGroup } from "./SummaryGroup";

interface ConversationListProps {
	conversations: Array<Conversation>;
	getToolResult: (toolUseId: string) => ToolResultContent | undefined;
	subagents: Map<string, Array<Conversation>>;
}

export function ConversationList({
	conversations,
	getToolResult,
	subagents,
}: ConversationListProps) {
	if (conversations.length === 0) {
		return (
			<div className="flex items-center justify-center h-64 text-muted-foreground">
				No conversation data
			</div>
		);
	}

	// Group consecutive summaries and slash commands together
	const groupedConversations = groupConversations(conversations);

	return (
		<ul className="space-y-2">
			{groupedConversations.map((item, index) => {
				const prevItem =
					index > 0 ? groupedConversations[index - 1] : undefined;
				const prevType = getPrevType(prevItem);

				if ("summaries" in item) {
					return (
						<li key={`summary-group-${item.summaries[0].summary.slice(0, 32)}`}>
							<SummaryGroup summaries={item.summaries} />
						</li>
					);
				}

				if ("slashCommand" in item) {
					return (
						<li key={item.userEntry.uuid}>
							<SlashCommandContent
								command={item.slashCommand}
								followingExpandedContent={item.followingExpandedContent}
								showIcon={prevType !== "user"}
							/>
						</li>
					);
				}

				return (
					<li key={"uuid" in item ? item.uuid : `item-${index}`}>
						<ConversationItem
							conversation={item}
							getToolResult={getToolResult}
							subagents={subagents}
							showIcon={item.type !== prevType}
						/>
					</li>
				);
			})}
		</ul>
	);
}

function getPrevType(
	prevItem: GroupedItem | undefined,
): "summary" | "user" | "assistant" | "system" | null {
	if (!prevItem) return null;
	if ("summaries" in prevItem) return "summary";
	if ("slashCommand" in prevItem) return "user";
	return prevItem.type;
}

/** A slash command group: user entry with parsed command + optional expanded content */
interface SlashCommandGroup {
	slashCommand: ParsedSlashCommand;
	userEntry: UserEntry;
	/** Expanded content from a following message (system or user, if not in same user message) */
	followingExpandedContent?: string;
}

/** Extract text content from user message content (string or array) */
function extractUserTextContent(
	content: string | Array<string | { type: string; text?: string }>,
): string {
	if (typeof content === "string") {
		return content;
	}
	return content
		.filter(
			(block): block is string | { type: "text"; text: string } =>
				typeof block === "string" ||
				(typeof block === "object" && block.type === "text"),
		)
		.map((block) => (typeof block === "string" ? block : block.text))
		.join("\n");
}

type GroupedItem =
	| Conversation
	| { summaries: Array<SummaryEntry> }
	| SlashCommandGroup;

/**
 * Group conversations for display:
 * - Consecutive summaries are grouped together
 * - Slash command user messages are grouped with their following system message
 */
function groupConversations(
	conversations: Array<Conversation>,
): Array<GroupedItem> {
	const result: Array<GroupedItem> = [];
	let currentSummaryGroup: Array<SummaryEntry> = [];
	let i = 0;

	while (i < conversations.length) {
		const conv = conversations[i];

		// Handle summaries - group consecutive ones
		if (conv.type === "summary") {
			currentSummaryGroup.push(conv);
			i++;
			continue;
		}

		// Flush summary group if we have one
		if (currentSummaryGroup.length > 0) {
			result.push({ summaries: currentSummaryGroup });
			currentSummaryGroup = [];
		}

		// Check for slash command pattern in user message
		if (conv.type === "user") {
			const content = conv.message.content;

			if (isSlashCommandMessage(content)) {
				const parsed = parseSlashCommand(content);
				if (parsed) {
					const slashCommandGroup: SlashCommandGroup = {
						slashCommand: parsed,
						userEntry: conv,
					};

					// If there's no expanded content in the user message itself,
					// check if the next message contains the expanded content
					if (!parsed.expandedContent) {
						const nextConv = conversations[i + 1] as Conversation | undefined;
						// Expanded content can be in a following system message
						if (nextConv?.type === "system") {
							slashCommandGroup.followingExpandedContent =
								nextConv.message.content;
							i++; // Skip in main loop
						}
						// Or in a following user message (without command tags)
						else if (
							nextConv?.type === "user" &&
							!isSlashCommandMessage(nextConv.message.content)
						) {
							slashCommandGroup.followingExpandedContent =
								extractUserTextContent(nextConv.message.content);
							i++; // Skip in main loop
						}
					}

					result.push(slashCommandGroup);
					i++;
					continue;
				}
			}
		}

		// Regular conversation item
		result.push(conv);
		i++;
	}

	// Don't forget any trailing summaries
	if (currentSummaryGroup.length > 0) {
		result.push({ summaries: currentSummaryGroup });
	}

	return result;
}
