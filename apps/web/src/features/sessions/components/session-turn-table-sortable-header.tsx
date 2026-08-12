import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
	SessionTurnTableSortKey,
	SessionTurnTableSortState,
} from "./session-turn-table-filters";

export function SessionTurnTableSortableHeader({
	className,
	columnIndex,
	label,
	onSort,
	sort,
	sortKey,
}: {
	className: string | undefined;
	columnIndex: number;
	label: string;
	onSort: (sortKey: SessionTurnTableSortKey) => void;
	sort: SessionTurnTableSortState;
	sortKey: SessionTurnTableSortKey;
}) {
	const isActive = sort.key === sortKey;

	return (
		<button
			type="button"
			aria-label={`Sort by ${label}, ${
				isActive && sort.direction === "asc" ? "descending" : "ascending"
			}`}
			className={cn(
				"relative flex h-8 w-full min-w-0 items-center gap-1 text-left text-xs font-medium whitespace-nowrap text-(--session-overview-subtle) outline-none hover:bg-(--session-overview-hover) focus-visible:z-10 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-(--session-overview-accent)",
				columnIndex === 0 ? "pr-1.5 pl-3" : "px-1.5",
				className,
			)}
			onClick={() => onSort(sortKey)}
		>
			<span className="truncate">{label}</span>
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
