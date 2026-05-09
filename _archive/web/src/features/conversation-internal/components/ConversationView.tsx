import type { Conversation } from "@/features/conversation-internal/lib/conversation-schema";
import { cn } from "@/lib/utils";
import { ConversationMessage } from "./ConversationMessage";

interface ConversationViewProps {
	conversations: Conversation[];
	parseError: string | null;
	className?: string;
}

export function ConversationView({
	conversations,
	parseError,
	className,
}: ConversationViewProps) {
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
