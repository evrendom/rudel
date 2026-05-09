import { User } from "lucide-react";
import { MarkdownContent } from "@/components/MarkdownContent";
import type { UserEntry } from "@/lib/conversation-schema";

interface UserConversationContentProps {
	entry: UserEntry;
	showIcon?: boolean;
}

export function UserConversationContent({
	entry,
	showIcon = true,
}: UserConversationContentProps) {
	const content = entry.message.content;

	const textContent =
		typeof content === "string"
			? content
			: content
					.filter(
						(block): block is string | { type: "text"; text: string } =>
							typeof block === "string" ||
							(typeof block === "object" && block.type === "text"),
					)
					.map((block) => (typeof block === "string" ? block : block.text))
					.join("\n");

	if (!textContent) return null;

	return (
		<div className="flex gap-2">
			{showIcon ? (
				<div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
					<User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
				</div>
			) : (
				<div className="w-6 flex-shrink-0" />
			)}
			<div className="flex-1 min-w-0 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2">
				<div className="prose prose-sm dark:prose-invert max-w-none text-sm">
					<MarkdownContent content={textContent} />
				</div>
			</div>
		</div>
	);
}
