import type { LearningEntry } from "@rudel/api-routes";
import { format } from "date-fns";
import {
	ChevronDown,
	ChevronUp,
	Clock,
	ExternalLink,
	FolderKanban,
	GitFork,
	User,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useCanViewSession } from "@/hooks/useCanViewSession";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { formatUsername } from "@/lib/format";
import { cn } from "@/lib/utils";

interface TimelineItemProps {
	learning: LearningEntry;
	userMap?: Record<string, string>;
}

const typeBadgeVariant: Record<
	string,
	{
		variant: "default" | "secondary" | "destructive" | "outline";
		className?: string;
	}
> = {
	pattern: {
		variant: "outline",
		className:
			"border-green-300 text-green-700 dark:border-green-700 dark:text-green-400",
	},
	antipattern: {
		variant: "outline",
		className:
			"border-red-300 text-red-700 dark:border-red-700 dark:text-red-400",
	},
	convention: {
		variant: "outline",
		className:
			"border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400",
	},
	fix: {
		variant: "outline",
		className:
			"border-yellow-300 text-yellow-700 dark:border-yellow-700 dark:text-yellow-400",
	},
	preference: {
		variant: "outline",
		className:
			"border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-400",
	},
};

export function TimelineItem({ learning, userMap }: TimelineItemProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const canViewSession = useCanViewSession();
	const canView = canViewSession(learning.user_id);
	const { trackDrilldown, trackUtility } = useAnalyticsTracking();

	const formattedDate = format(new Date(learning.created_at), "MMM dd, yyyy");
	const formattedTime = format(new Date(learning.created_at), "h:mm a");

	const contentPreview =
		learning.content.length > 300
			? `${learning.content.slice(0, 300)}...`
			: learning.content;

	const projectName =
		learning.project_path.split("/").pop() || learning.project_path;

	const sessionLink = `/dashboard/sessions/${learning.session_id}`;

	const typeStyle = typeBadgeVariant[learning.type] ?? {
		variant: "secondary" as const,
	};

	return (
		<div className="relative pl-8 pb-8 border-l-2 border-border last:pb-0">
			{/* Timeline dot */}
			<div className="absolute -left-2 top-0 w-4 h-4 rounded-full bg-blue-600 border-2 border-background shadow" />

			{/* Timestamp */}
			<div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
				<Clock className="w-3 h-3" />
				<span>
					{formattedDate} at {formattedTime}
				</span>
			</div>

			<Card className="py-0 gap-0 hover:shadow-md transition-shadow">
				<CardHeader className="p-4 border-b border-border">
					<div className="flex items-start justify-between gap-4">
						<div className="flex-1 space-y-2">
							{/* Type and Scope badges */}
							<div className="flex flex-wrap items-center gap-2">
								<Badge
									variant={typeStyle.variant}
									className={typeStyle.className}
								>
									{learning.type}
								</Badge>
								<Badge variant="secondary" className="font-mono">
									{learning.scope}
								</Badge>
							</div>

							{/* Metadata */}
							<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
								<div className="flex items-center gap-1">
									<User className="w-3 h-3" />
									<span className="font-medium">
										{formatUsername(learning.user_id, userMap)}
									</span>
								</div>
								<div className="flex items-center gap-1">
									<FolderKanban className="w-3 h-3" />
									<span className="font-mono">{projectName}</span>
								</div>
								{learning.repository && (
									<div className="flex items-center gap-1">
										<GitFork className="w-3 h-3" />
										<span className="font-mono">{learning.repository}</span>
									</div>
								)}
							</div>

							{/* Tags */}
							{learning.tags && learning.tags.length > 0 && (
								<div className="flex flex-wrap gap-1">
									{learning.tags.map((tag, idx) => (
										<Badge
											// biome-ignore lint/suspicious/noArrayIndexKey: tags may duplicate
											key={`${tag}-${idx}`}
											variant="outline"
											className={cn(
												"border-indigo-300 text-indigo-700",
												"dark:border-indigo-700 dark:text-indigo-400",
											)}
										>
											#{tag}
										</Badge>
									))}
								</div>
							)}
						</div>

						{/* Link to session */}
						{canView ? (
							<Link
								to={sessionLink}
								onClick={() => {
									trackDrilldown({
										drilldownMethod: "learning_item",
										sourceComponent: "learning_timeline_item",
										targetType: "session",
										targetId: learning.session_id,
										targetPath: sessionLink,
									});
								}}
								className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950 rounded-md transition-colors"
							>
								<span>View Session</span>
								<ExternalLink className="w-3 h-3" />
							</Link>
						) : null}
					</div>
				</CardHeader>

				<CardContent className="p-4">
					<div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
						{isExpanded ? learning.content : contentPreview}
					</div>

					{learning.content.length > 300 && (
						<button
							type="button"
							onClick={() => {
								trackUtility({
									utilityName: "learning_expand",
									componentId: "learning_timeline_item",
									utilityState: !isExpanded ? "expanded" : "collapsed",
								});
								setIsExpanded(!isExpanded);
							}}
							className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium mt-3"
						>
							{isExpanded ? (
								<>
									<ChevronUp className="w-4 h-4" />
									Show less
								</>
							) : (
								<>
									<ChevronDown className="w-4 h-4" />
									Show more
								</>
							)}
						</button>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
