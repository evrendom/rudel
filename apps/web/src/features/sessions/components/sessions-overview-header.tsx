import { ChevronDown, ChevronUp } from "lucide-react";
import {
	SESSION_OVERVIEW_COLUMNS,
	SESSION_OVERVIEW_GRID_CLASS_NAME,
	SESSION_OVERVIEW_SECOND_FROZEN_COLUMN_LEFT_CLASS_NAME,
	type SessionOverviewColumnKey,
	type SessionSortState,
} from "@/features/sessions/components/sessions-overview-table-utils";
import { cn } from "@/lib/utils";

export function SessionsOverviewHeader({
	onSort,
	sessionCountLabel,
	sort,
}: {
	onSort: (sortKey: SessionOverviewColumnKey) => void;
	sessionCountLabel: number;
	sort: SessionSortState;
}) {
	return (
		<div
			className={cn(
				"sticky top-0 z-30 grid h-10 shrink-0 border-y border-(--session-overview-border) bg-(--session-overview-surface)",
				SESSION_OVERVIEW_GRID_CLASS_NAME,
			)}
		>
			{SESSION_OVERVIEW_COLUMNS.map((column, index) => (
				<div
					key={column.key}
					className={cn(
						"flex min-w-0 border-r border-(--session-overview-border) bg-(--session-overview-surface) [border-right-color:transparent]",
						index < 2 && "sticky z-40",
						index === 0 && "left-0",
						index === 1 &&
							SESSION_OVERVIEW_SECOND_FROZEN_COLUMN_LEFT_CLASS_NAME,
					)}
				>
					<SessionOverviewSortableHeader
						align={column.align}
						label={column.label}
						onSort={onSort}
						secondaryLabel={
							index === 1 ? sessionCountLabel.toLocaleString() : undefined
						}
						sort={sort}
						sortKey={column.key}
					/>
				</div>
			))}
		</div>
	);
}

function SessionOverviewSortableHeader({
	align,
	label,
	onSort,
	secondaryLabel,
	sort,
	sortKey,
}: {
	align: "left" | "right";
	label: string;
	onSort: (sortKey: SessionOverviewColumnKey) => void;
	secondaryLabel: string | undefined;
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
				"relative flex h-full min-w-0 flex-1 items-center gap-1.5 px-3 text-base font-medium tracking-[-0.01em] text-(--session-overview-text) outline-none hover:bg-(--session-overview-hover) focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent) sm:text-sm",
				align === "right" ? "justify-end text-right" : "justify-start",
			)}
			onClick={() => onSort(sortKey)}
		>
			<span className="truncate">{label}</span>
			{secondaryLabel ? (
				<span className="font-normal tabular-nums text-(--session-overview-muted)">
					{secondaryLabel}
				</span>
			) : null}
			{isActive ? (
				sort.direction === "asc" ? (
					<ChevronUp
						aria-hidden="true"
						className="size-4 h-lh shrink-0 stroke-(--session-overview-text)"
					/>
				) : (
					<ChevronDown
						aria-hidden="true"
						className="size-4 h-lh shrink-0 stroke-(--session-overview-text)"
					/>
				)
			) : null}
			<span
				aria-hidden="true"
				className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
			/>
		</button>
	);
}
