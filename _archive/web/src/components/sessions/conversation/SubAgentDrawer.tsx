import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import type { Conversation } from "@/lib/conversation-schema";
import { ConversationList } from "./ConversationList";

interface SubAgentDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	subagentType: string;
	description: string;
	conversations: Array<Conversation> | undefined;
}

export function SubAgentDrawer({
	open,
	onOpenChange,
	subagentType,
	description,
	conversations,
}: SubAgentDrawerProps) {
	const getToolResult = () => undefined;
	const subagents = new Map<string, Array<Conversation>>();

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-[600px] sm:max-w-[600px] p-0 flex flex-col">
				<SheetHeader className="px-6 py-4 border-b bg-muted/30">
					<div className="flex items-center gap-2">
						<Badge variant="default">{subagentType}</Badge>
						<SheetTitle className="text-base">{description}</SheetTitle>
					</div>
					<SheetDescription className="text-xs">
						Sub-agent conversation
					</SheetDescription>
				</SheetHeader>

				<ScrollArea className="flex-1">
					<div className="p-6">
						{conversations && conversations.length > 0 ? (
							<ConversationList
								conversations={conversations}
								getToolResult={getToolResult}
								subagents={subagents}
							/>
						) : (
							<div className="flex items-center justify-center h-32 text-muted-foreground">
								No sub-agent conversation data available
							</div>
						)}
					</div>
				</ScrollArea>
			</SheetContent>
		</Sheet>
	);
}
