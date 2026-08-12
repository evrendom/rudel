import { Skeleton } from "@/app/ui/skeleton";
import {
	SESSION_OVERVIEW_GRID_CLASS_NAME,
	SESSION_OVERVIEW_SECOND_FROZEN_COLUMN_LEFT_CLASS_NAME,
} from "@/features/sessions/components/sessions-overview-table-utils";
import { cn } from "@/lib/utils";

const SESSION_OVERVIEW_SKELETON_ROWS = [
	"overview-session-skeleton-1",
	"overview-session-skeleton-2",
	"overview-session-skeleton-3",
	"overview-session-skeleton-4",
	"overview-session-skeleton-5",
	"overview-session-skeleton-6",
	"overview-session-skeleton-7",
	"overview-session-skeleton-8",
	"overview-session-skeleton-9",
	"overview-session-skeleton-10",
] as const;

export function SessionsOverviewSkeleton() {
	return (
		<div aria-busy="true" className="flex-1">
			<output className="sr-only">Loading sessions</output>
			{SESSION_OVERVIEW_SKELETON_ROWS.map((rowId) => (
				<div
					key={rowId}
					className={cn("grid h-11 sm:h-9", SESSION_OVERVIEW_GRID_CLASS_NAME)}
				>
					<div className="sticky left-0 z-10 flex items-center border-r border-b border-(--session-overview-border) bg-(--session-overview-surface) px-3 [border-right-color:transparent]">
						<Skeleton className="h-3.5 w-20 rounded-sm" />
					</div>
					<div
						className={cn(
							"sticky z-10 flex items-center border-r border-b border-(--session-overview-border) bg-(--session-overview-surface) px-4 [border-right-color:transparent]",
							SESSION_OVERVIEW_SECOND_FROZEN_COLUMN_LEFT_CLASS_NAME,
						)}
					>
						<Skeleton className="h-3.5 w-36 rounded-sm" />
					</div>
					<div className="flex items-center gap-1.5 border-r border-b border-(--session-overview-border) px-3 [border-right-color:transparent]">
						<Skeleton className="size-4 rounded-full" />
						<Skeleton className="h-3.5 w-24 rounded-sm" />
					</div>
					<div className="flex items-center border-r border-b border-(--session-overview-border) px-3 [border-right-color:transparent]">
						<Skeleton className="h-5 w-24 rounded-full" />
					</div>
					<div className="flex items-center justify-end border-r border-b border-(--session-overview-border) px-3 [border-right-color:transparent]">
						<Skeleton className="h-3.5 w-20 rounded-sm" />
					</div>
					<div className="flex items-center justify-end border-r border-b border-(--session-overview-border) px-3 [border-right-color:transparent]">
						<Skeleton className="h-3.5 w-14 rounded-sm" />
					</div>
					<div className="flex items-center justify-end border-r border-b border-(--session-overview-border) px-3 [border-right-color:transparent]">
						<Skeleton className="h-3.5 w-10 rounded-sm" />
					</div>
					<div className="flex items-center justify-end border-r border-b border-(--session-overview-border) px-3 [border-right-color:transparent]">
						<Skeleton className="h-3.5 w-12 rounded-sm" />
					</div>
					<div className="flex items-center justify-end border-r border-b border-(--session-overview-border) px-3 [border-right-color:transparent]">
						<Skeleton className="h-3.5 w-16 rounded-sm" />
					</div>
					<div className="flex items-center border-r border-b border-(--session-overview-border) px-3 [border-right-color:transparent]">
						<Skeleton className="h-3.5 w-52 rounded-sm" />
					</div>
				</div>
			))}
		</div>
	);
}
