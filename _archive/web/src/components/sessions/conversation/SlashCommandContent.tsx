import { ChevronDown, User } from "lucide-react";
import { useState } from "react";
import { MarkdownContent } from "@/components/MarkdownContent";
import { Badge } from "@/components/ui/badge";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import type { ParsedSlashCommand } from "@/lib/parse-slash-command";

interface SlashCommandContentProps {
	command: ParsedSlashCommand;
	/** Expanded content from a following message (if not in same user message) */
	followingExpandedContent?: string;
	showIcon?: boolean;
}

export function SlashCommandContent({
	command,
	followingExpandedContent,
	showIcon = true,
}: SlashCommandContentProps) {
	const [isOpen, setIsOpen] = useState(false);

	const expandedContent = command.expandedContent ?? followingExpandedContent;

	return (
		<div className="flex gap-2">
			{showIcon ? (
				<div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
					<User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
				</div>
			) : (
				<div className="w-6 flex-shrink-0" />
			)}
			<div className="flex-1 min-w-0 bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md overflow-hidden">
				{/* Command header with name and args */}
				<div className="px-3 py-2">
					<div className="flex items-center gap-2 mb-2">
						<Badge variant="outline" className="text-xs font-mono">
							{command.commandName}
						</Badge>
					</div>
					{command.commandArgs && (
						<div className="prose prose-sm dark:prose-invert max-w-none text-sm">
							<MarkdownContent content={command.commandArgs} />
						</div>
					)}
				</div>

				{/* Collapsible expanded content */}
				{expandedContent && (
					<Collapsible open={isOpen} onOpenChange={setIsOpen}>
						<Separator />
						<CollapsibleTrigger className="w-full px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors">
							<ChevronDown
								className={`h-3.5 w-3.5 transition-transform ${
									isOpen ? "rotate-0" : "-rotate-90"
								}`}
							/>
							<span>Slash command content</span>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<Separator />
							<div className="px-3 py-2 bg-gray-50/50 dark:bg-gray-950/20">
								<div className="prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground">
									<MarkdownContent content={expandedContent} />
								</div>
							</div>
						</CollapsibleContent>
					</Collapsible>
				)}
			</div>
		</div>
	);
}
