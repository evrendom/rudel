import { Terminal } from "lucide-react";
import type { SystemEntry } from "@/lib/conversation-schema";

interface SystemConversationContentProps {
	entry: SystemEntry;
}

export function SystemConversationContent({
	entry,
}: SystemConversationContentProps) {
	return (
		<div className="bg-gray-50/50 dark:bg-gray-950/20 border border-gray-200 dark:border-gray-800 rounded-md">
			<div className="flex items-center gap-1.5 px-2 py-1 border-b border-gray-200 dark:border-gray-800">
				<Terminal className="h-3.5 w-3.5 text-gray-600 dark:text-gray-400" />
				<span className="text-xs font-medium text-gray-600 dark:text-gray-400">
					System
				</span>
			</div>
			<div className="px-2 py-1.5">
				<pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
					{entry.message.content}
				</pre>
			</div>
		</div>
	);
}
