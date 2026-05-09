import { FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SummaryEntry } from "@/lib/conversation-schema";

interface SummaryConversationContentProps {
	entry: SummaryEntry;
}

export function SummaryConversationContent({
	entry,
}: SummaryConversationContentProps) {
	return (
		<Card className="bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
			<CardHeader className="py-2 px-3">
				<div className="flex items-center gap-2">
					<FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
					<CardTitle className="text-sm font-medium">
						Conversation Summary
					</CardTitle>
				</div>
			</CardHeader>
			<CardContent className="px-3 pb-3">
				<pre className="text-sm text-muted-foreground whitespace-pre-wrap">
					{entry.summary}
				</pre>
			</CardContent>
		</Card>
	);
}
