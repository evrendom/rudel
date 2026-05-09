import { Bot, ChevronDown, Lightbulb } from "lucide-react";
import { MarkdownContent } from "@/components/MarkdownContent";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type {
	AssistantEntry,
	Conversation,
	ToolResultContent,
} from "@/lib/conversation-schema";
import { ToolUseBlock } from "./ToolUseBlock";

interface AssistantConversationContentProps {
	entry: AssistantEntry;
	getToolResult: (toolUseId: string) => ToolResultContent | undefined;
	subagents: Map<string, Array<Conversation>>;
	showIcon?: boolean;
}

export function AssistantConversationContent({
	entry,
	getToolResult,
	subagents,
	showIcon = true,
}: AssistantConversationContentProps) {
	return (
		<div className="flex gap-2">
			{showIcon ? (
				<div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
					<Bot className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
				</div>
			) : (
				<div className="w-6 flex-shrink-0" />
			)}
			<div className="flex-1 min-w-0 space-y-1.5">
				{entry.message.content.map((block) => {
					switch (block.type) {
						case "text":
							return (
								<div
									key={`text-${block.text.slice(0, 32)}`}
									className="prose prose-sm dark:prose-invert max-w-none text-sm"
								>
									<MarkdownContent content={block.text} />
								</div>
							);
						case "thinking":
							return (
								<div
									key={`thinking-${block.thinking.slice(0, 32)}`}
									className="bg-muted/50 border border-dashed border-muted-foreground/30 rounded-md"
								>
									<Collapsible>
										<CollapsibleTrigger asChild>
											<div className="cursor-pointer hover:bg-muted/80 py-1 px-2 group flex items-center gap-1.5">
												<Lightbulb className="h-3.5 w-3.5 text-muted-foreground group-hover:text-yellow-600" />
												<span className="text-xs font-medium text-muted-foreground">
													Thinking
												</span>
												<ChevronDown className="h-3 w-3 ml-auto transition-transform group-data-[state=open]:rotate-180 text-muted-foreground" />
											</div>
										</CollapsibleTrigger>
										<CollapsibleContent>
											<div className="px-2 pb-2">
												<pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
													{block.thinking}
												</pre>
											</div>
										</CollapsibleContent>
									</Collapsible>
								</div>
							);
						case "tool_use":
							return (
								<ToolUseBlock
									key={block.id}
									block={block}
									toolResult={getToolResult(block.id)}
									subagents={subagents}
								/>
							);
						default:
							return null;
					}
				})}
			</div>
		</div>
	);
}
