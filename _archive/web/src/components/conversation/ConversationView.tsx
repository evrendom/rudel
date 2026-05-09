import { Bot, Settings, User } from "lucide-react";
import { useMemo } from "react";
import type { Conversation } from "@/lib/conversation-schema";
import { parseConversations } from "@/lib/conversation-schema";
import { cn } from "@/lib/utils";
import { ConversationMessage } from "./ConversationMessage";

interface ConversationViewProps {
	content: string;
	className?: string;
	showHeader?: boolean;
}

function getParsedConversationData(content: string): {
	conversations: Conversation[];
	parseError: string | null;
} {
	if (content.trim() === "") {
		return {
			conversations: [],
			parseError: null,
		};
	}

	try {
		const lines = content.split("\n").filter((line) => line.trim() !== "");
		const conversations = parseConversations(content);

		if (conversations.length === 0 && lines.length > 0) {
			try {
				JSON.parse(lines[0] as string);
				return {
					conversations,
					parseError: `Failed to parse ${lines.length} conversation entries. Check console for details.`,
				};
			} catch {
				return {
					conversations,
					parseError: "Content is not valid JSONL format",
				};
			}
		}

		return {
			conversations,
			parseError: null,
		};
	} catch (error) {
		console.error("[ConversationView] Error parsing conversations:", error);

		return {
			conversations: [],
			parseError: error instanceof Error ? error.message : "Unknown error",
		};
	}
}

export function ConversationView({
	content,
	className,
	showHeader = true,
}: ConversationViewProps) {
	const { conversations, parseError } = useMemo(
		() => getParsedConversationData(content),
		[content],
	);
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
						<ConversationMessage entry={entry} messageIndex={idx} />
					</li>
				))}
			</ol>
		</div>
	);
}
