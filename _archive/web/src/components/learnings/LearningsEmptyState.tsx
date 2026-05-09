import { Lightbulb } from "lucide-react";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";

export function LearningsEmptyState() {
	return (
		<AnalyticsCard className="mt-4">
			<div className="flex flex-col items-center justify-center py-20 px-4 text-center">
				<div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-6">
					<Lightbulb className="w-8 h-8 text-foreground" />
				</div>
				<h3 className="text-lg font-semibold text-foreground mb-3">
					No learnings yet
				</h3>
				<p className="text-sm text-muted-foreground max-w-lg mb-4">
					We use a continuous improvement plugin internally that captures team
					feedback, patterns, and conventions as developers work with Claude
					Code. We're open-sourcing it soon so you can set it up for your team.
					Learnings will appear here automatically once installed.
				</p>
				<p className="text-xs text-muted-foreground mb-4">
					Follow us to be the first to know when it drops.
				</p>
				<a
					href="https://x.com/obsessiondb"
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-foreground bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
				>
					Follow @obsessiondb on X
				</a>
			</div>
		</AnalyticsCard>
	);
}
