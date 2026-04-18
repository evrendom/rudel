import { Bot, Settings, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { extractCodexTokenData } from "@/lib/codex-conversation-parser";
import type { Conversation } from "@/lib/conversation-schema";
import { isCodexFormat, parseConversations } from "@/lib/conversation-schema";
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
	showHeader?: boolean;
	userLabel?: string;
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
	showHeader = true,
	userLabel = "User",
}: ConversationViewProps) {
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [parseError, setParseError] = useState<string | null>(null);
	const messageCounts = useMemo(() => {
		const counts = {
			user: 0,
			assistant: 0,
			system: 0,
			summary: 0,
		};

		for (const entry of conversations) {
			counts[entry.type] += 1;
		}

		return counts;
	}, [conversations]);

	// Parse content
	useEffect(() => {
		if (!content || content.trim() === "") {
			setConversations([]);
			setParseError(null);
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
			} else {
				setParseError(null);
			}

			setConversations(parsed);

			if (parsed.length > 0) {
				if (onTokenDataReady) {
					const tokenData = isCodexFormat(content)
						? extractCodexTokenData(content)
						: extractTokenData(content);
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
			<div className={cn("px-5 py-6", className)}>
				<div className="rounded-[1.2rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-danger-surface)] px-5 py-4 text-center">
					<p className="mb-2 text-base font-semibold text-[color:var(--dashboardy-danger-foreground)]">
						Error parsing conversation data
					</p>
					<p className="text-sm text-[color:var(--dashboardy-muted)]">
						{parseError}
					</p>
				</div>
			</div>
		);
	}

	if (conversations.length === 0) {
		return (
			<div className={cn("px-5 py-6", className)}>
				<div className="rounded-[1.2rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-5 py-4 text-center">
					<p className="text-sm font-medium text-[color:var(--dashboardy-muted)]">
						No conversation data available
					</p>
				</div>
			</div>
		);
	}

	return (
		<div
			className={cn("grid gap-4", showHeader ? "px-5 py-5" : "py-1", className)}
		>
			{showHeader ? (
				<div className="grid gap-3 border-b border-[color:var(--dashboardy-divider)] pb-5">
					<div className="flex flex-wrap items-center gap-2">
						<p className="text-sm font-semibold text-[color:var(--dashboardy-heading)]">
							Session history
						</p>
						<div className="dashboardy-inline-badge rounded-full border px-3 py-1">
							<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-heading)]">
								{conversations.length} messages
							</p>
						</div>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<div className="dashboardy-inline-badge flex items-center gap-2 rounded-full border px-3 py-1.5">
							<User className="size-3.5" />
							<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-heading)]">
								{messageCounts.user} user
							</p>
						</div>
						<div className="dashboardy-inline-badge flex items-center gap-2 rounded-full border px-3 py-1.5">
							<Bot className="size-3.5" />
							<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-heading)]">
								{messageCounts.assistant} assistant
							</p>
						</div>
						{messageCounts.system > 0 ? (
							<div className="dashboardy-inline-badge flex items-center gap-2 rounded-full border px-3 py-1.5">
								<Settings className="size-3.5" />
								<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-heading)]">
									{messageCounts.system} system
								</p>
							</div>
						) : null}
					</div>
				</div>
			) : null}
			<ol className="grid gap-3.5">
				{conversations.map((entry, idx) => (
					<li
						key={entry.type === "summary" ? `summary-${idx}` : entry.uuid}
						className="min-w-0"
					>
						<ConversationMessage
							entry={entry}
							messageIndex={idx}
							userLabel={userLabel}
						/>
					</li>
				))}
			</ol>
		</div>
	);
}
