import { ChevronDown, ChevronUp } from "lucide-react";
import { Fragment } from "react";
import {
	SESSION_OVERVIEW_COLUMNS,
	SESSION_OVERVIEW_GRID_CLASS_NAME,
	type SessionOverviewColumnKey,
	type SessionSortState,
} from "@/features/sessions/components/sessions-overview-table-utils";
import { cn } from "@/lib/utils";

export function SessionsOverviewHeader({
	onSort,
	sort,
}: {
	onSort: (sortKey: SessionOverviewColumnKey) => void;
	sort: SessionSortState;
}) {
	return (
		<div
			className={cn(
				"sticky top-0 z-30 grid h-10 shrink-0 border-b border-(--session-overview-border) bg-(--session-overview-surface)",
				SESSION_OVERVIEW_GRID_CLASS_NAME,
			)}
			data-slot="sessions-overview-header"
		>
			{SESSION_OVERVIEW_COLUMNS.map((column) => (
				<Fragment key={column.key}>
					<div className="flex min-w-0 bg-(--session-overview-surface)">
						{column.key === "time" ? null : (
							<SessionOverviewSortableHeader
								align={column.align}
								label={column.label}
								onSort={onSort}
								sort={sort}
								sortKey={column.key}
							/>
						)}
					</div>
					{column.key === "time" ? (
						<div className="bg-(--session-overview-surface)" />
					) : null}
				</Fragment>
			))}
		</div>
	);
}

function SessionOverviewSortableHeader({
	align,
	label,
	onSort,
	sort,
	sortKey,
}: {
	align: "left" | "right";
	label: string;
	onSort: (sortKey: SessionOverviewColumnKey) => void;
	sort: SessionSortState;
	sortKey: SessionOverviewColumnKey;
}) {
	const isActive = sort.key === sortKey;

	return (
		<button
			type="button"
			aria-label={`Sort by ${label}, ${
				isActive && sort.direction === "asc" ? "descending" : "ascending"
			}`}
			className={cn(
				"relative flex h-full min-w-0 flex-1 items-center gap-1 px-3 text-left text-base font-medium tracking-[-0.01em] whitespace-nowrap text-(--session-overview-subtle) outline-none hover:bg-(--session-overview-hover) focus-visible:z-10 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--session-overview-accent) sm:text-sm",
				align === "right" ? "justify-end text-right" : "justify-start",
			)}
			onClick={() => onSort(sortKey)}
		>
			<span className="min-w-0 truncate">{label}</span>
			{isActive ? (
				sort.direction === "asc" ? (
					<ChevronUp aria-hidden="true" className="size-3.5 shrink-0" />
				) : (
					<ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
				)
			) : null}
			<span
				aria-hidden="true"
				className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
			/>
		</button>
	);
}
