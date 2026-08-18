import { ArrowDownWideNarrow, ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SessionTurnTableSortState } from "./session-turn-table-filters";

export function SessionTurnTableControls({
	activeSortLabel,
	className,
	onToggleSortDirection,
	sort,
	viewControls,
}: {
	activeSortLabel: string;
	className: string | undefined;
	onToggleSortDirection: () => void;
	sort: SessionTurnTableSortState;
	viewControls: ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex min-h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-(--session-overview-border) px-3",
				className,
			)}
		>
			<div
				data-slot="session-turn-table-controls"
				className="flex shrink-0 items-center gap-1"
			>
				<button
					type="button"
					aria-label={`Sort by ${activeSortLabel}, ${
						sort.direction === "asc" ? "descending" : "ascending"
					}`}
					className="relative flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-(--session-overview-surface) py-1 pr-2 pl-1.5 text-sm font-medium tracking-[-0.01em] text-(--session-overview-text) shadow-[inset_0_0_0_1px_#e6e7ea] outline-none hover:bg-(--session-overview-hover) focus-visible:-outline-offset-1 focus-visible:outline-2 focus-visible:outline-(--session-overview-accent) dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
					onClick={onToggleSortDirection}
				>
					<ArrowDownWideNarrow
						aria-hidden="true"
						className="size-4 h-lh shrink-0 stroke-(--session-overview-muted)"
					/>
					<span className="text-(--session-overview-muted)">Sorted by</span>
					<span>{activeSortLabel}</span>
					{sort.direction === "asc" ? (
						<ChevronUp
							aria-hidden="true"
							className="size-4 h-lh shrink-0 stroke-(--session-overview-text)"
						/>
					) : (
						<ChevronDown
							aria-hidden="true"
							className="size-4 h-lh shrink-0 stroke-(--session-overview-text)"
						/>
					)}
					<span
						aria-hidden="true"
						className="pointer-fine:hidden absolute top-1/2 left-1/2 size-12 -translate-1/2"
					/>
				</button>
				<div
					aria-hidden="true"
					data-slot="session-turn-table-control-separator"
					className="mx-0.5 h-4 w-px shrink-0 bg-(--session-overview-border)"
				/>
			</div>
			{viewControls}
		</div>
	);
}
