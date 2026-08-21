import { Fragment } from "react";
import { Skeleton } from "@/app/ui/skeleton";
import {
	SESSION_OVERVIEW_COLUMNS,
	SESSION_OVERVIEW_GRID_CLASS_NAME,
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
					className={cn("grid h-8", SESSION_OVERVIEW_GRID_CLASS_NAME)}
				>
					{SESSION_OVERVIEW_COLUMNS.map((column) => (
						<Fragment key={column.key}>
							<div
								className={cn(
									"flex min-w-0 items-center bg-(--session-overview-surface) px-3",
									column.align === "right" && "justify-end",
								)}
							>
								{column.key === "user" ? (
									<div className="flex items-center gap-1.5">
										<Skeleton className="size-4 rounded-full" />
										<Skeleton className="h-3 w-20 rounded-sm" />
									</div>
								) : (
									<Skeleton
										className={cn(
											"h-3 rounded-sm",
											column.key === "repository" || column.key === "model"
												? "w-28"
												: "w-12",
										)}
									/>
								)}
							</div>
							{column.key === "time" ? (
								<div className="flex items-center justify-center bg-(--session-overview-surface) px-2">
									<Skeleton className="size-7 rounded-md" />
								</div>
							) : null}
						</Fragment>
					))}
				</div>
			))}
		</div>
	);
}
