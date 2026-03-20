import { useEffect, useState } from "react";
import type { Conversation } from "@/lib/conversation-schema";
import { parseConversations } from "@/lib/conversation-schema";
import { isSlashCommandMessage } from "@/lib/parse-slash-command";
import { cn } from "@/lib/utils";
import { ConversationMessage } from "./ConversationMessage";
import type { TokenDataPoint } from "./TokenUsageChart";
import type { ToolActivityPoint } from "./ToolActivityChart";

interface ConversationViewProps {
	content: string;
	className?: string;
	onTokenDataReady?: (data: TokenDataPoint[], totalMessages: number) => void;
	onToolActivityReady?: (data: ToolActivityPoint[]) => void;
}

/** Extract token usage data from parsed conversations */
function extractTokenData(content: string): TokenDataPoint[] {
	const points: TokenDataPoint[] = [];
	const lines = content.split("\n").filter((line) => line.trim() !== "");

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line) continue;

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

			if (parsed.type !== "assistant") continue;
			const usage = parsed.message?.usage;
			if (!usage) continue;

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

/** Extract tool, skill, and subagent activity from parsed conversations */
function extractToolActivity(entries: Conversation[]): ToolActivityPoint[] {
	const points: ToolActivityPoint[] = [];

	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];

		if (entry.type === "user") {
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

		if (entry.type === "assistant") {
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

export function ConversationView({
	content,
	className,
	onTokenDataReady,
	onToolActivityReady,
}: ConversationViewProps) {
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [parseError, setParseError] = useState<string | null>(null);

	// Parse content
	useEffect(() => {
		if (!content || content.trim() === "") {
			setConversations([]);
			return;
		}

		try {
			const lines = content.split("\n").filter((line) => line.trim() !== "");

			const parsed = parseConversations(content);

			if (parsed.length === 0 && lines.length > 0) {
				try {
					JSON.parse(lines[0] as string);
					setParseError(
						`Failed to parse ${lines.length} conversation entries. Check console for details.`,
					);
				} catch {
					setParseError("Content is not valid JSONL format");
				}
			}

			setConversations(parsed);

			if (parsed.length > 0) {
				if (onTokenDataReady) {
					const tokenData = extractTokenData(content);
					onTokenDataReady(tokenData, parsed.length);
				}
				if (onToolActivityReady) {
					const activityData = extractToolActivity(parsed);
					onToolActivityReady(activityData);
				}
			}
		} catch (error) {
			console.error("[ConversationView] Error parsing conversations:", error);
			setParseError(error instanceof Error ? error.message : "Unknown error");
		}
	}, [content, onTokenDataReady, onToolActivityReady]);

	if (parseError) {
		return (
			<div className={cn("py-8 text-center", className)}>
				<p className="text-red-600 dark:text-red-400 font-semibold mb-2">
					Error parsing conversation data
				</p>
				<p className="text-muted-foreground text-sm">{parseError}</p>
			</div>
		);
	}

	if (conversations.length === 0) {
		return (
			<div className={cn("py-8 text-center", className)}>
				<p className="text-muted-foreground">No conversation data available</p>
			</div>
		);
	}

	return (
		<div className={cn("space-y-6", className)}>
			<div className="text-xs text-muted-foreground mb-4">
				Showing {conversations.length} messages
			</div>
			{conversations.map((entry, idx) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: stable conversation order
					key={idx}
				>
					<ConversationMessage entry={entry} messageIndex={idx} />
				</div>
			))}
		</div>
	);
}
