import { FileText } from "lucide-react";
import type { SummaryEntry } from "@/lib/conversation-schema";

interface SummaryGroupProps {
	summaries: Array<SummaryEntry>;
}

export function SummaryGroup({ summaries }: SummaryGroupProps) {
	return (
		<div className="bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md">
			<div className="flex items-center gap-2 px-3 py-1.5 border-b border-amber-200 dark:border-amber-800">
				<FileText className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
				<span className="text-xs font-medium text-amber-700 dark:text-amber-300">
					Conversation Summary
				</span>
			</div>
			<div className="divide-y divide-amber-200/50 dark:divide-amber-800/50">
				{summaries.map((entry) => (
					<div key={entry.summary.slice(0, 64)} className="px-3 py-1.5">
						<pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
							{entry.summary}
						</pre>
					</div>
				))}
			</div>
		</div>
	);
}
