import { useMemo } from "react";
import type { Conversation } from "@/lib/conversation-schema";
import { parseConversations } from "@/lib/conversation-schema";
import { cn } from "@/lib/utils";
import { ConversationTrace } from "./ConversationTrace";
import { buildConversationTrace } from "./conversation-trace";

interface ConversationViewProps {
	content: string;
	className?: string;
	userLabel?: string;
	agentLabel?: string;
	/** Raw model id, so agent turns can carry the vendor's mark. */
	agentModel?: string;
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
	userLabel,
	agentLabel,
	agentModel,
}: ConversationViewProps) {
	const { conversations, parseError } = useMemo(
		() => getParsedConversationData(content),
		[content],
	);
	const traceItems = useMemo(
		() => buildConversationTrace(conversations),
		[conversations],
	);

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
		<div className={cn("py-1", className)}>
			<ConversationTrace
				items={traceItems}
				userLabel={userLabel}
				agentLabel={agentLabel}
				agentModel={agentModel}
			/>
		</div>
	);
}
