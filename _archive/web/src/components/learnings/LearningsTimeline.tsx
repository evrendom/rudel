import type { LearningEntry } from "@rudel/api-routes";
import { BookOpen } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TimelineItem } from "./TimelineItem";

interface LearningsTimelineProps {
	learnings: LearningEntry[];
	isLoading?: boolean;
	userMap?: Record<string, string>;
}

export function LearningsTimeline({
	learnings,
	isLoading,
	userMap,
}: LearningsTimelineProps) {
	// Loading skeleton
	if (isLoading) {
		return (
			<div className="space-y-8">
				{[...Array(3)].map((_, i) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
						key={i}
						className="relative pl-8 pb-8 border-l-2 border-border"
					>
						<Skeleton className="absolute -left-2 top-0 w-4 h-4 rounded-full" />
						<div className="space-y-3">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-32" />
						</div>
					</div>
				))}
			</div>
		);
	}

	// Empty state
	if (learnings.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-16 px-4 text-center">
				<div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
					<BookOpen className="w-8 h-8 text-muted-foreground" />
				</div>
				<h3 className="text-lg font-semibold text-foreground mb-2">
					No learnings yet
				</h3>
				<p className="text-sm text-muted-foreground max-w-md">
					Learnings will appear here when team members use the{" "}
					<code className="px-1 py-0.5 bg-muted rounded text-xs">
						/compound:feedback
					</code>{" "}
					command to provide feedback during their coding sessions.
				</p>
			</div>
		);
	}

	// Timeline with learnings
	return (
		<div className="space-y-0">
			{learnings.map((learning) => (
				<TimelineItem
					key={`${learning.session_id}-${learning.created_at}`}
					learning={learning}
					userMap={userMap}
				/>
			))}
		</div>
	);
}
