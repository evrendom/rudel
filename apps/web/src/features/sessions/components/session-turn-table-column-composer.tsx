import { Columns3 } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTitle,
	PopoverTrigger,
} from "@/app/ui/popover";
import { cn } from "@/lib/utils";

export type SessionTurnTableColumnKey =
	| "time"
	| "duration"
	| "input"
	| "output"
	| "cost"
	| "tools"
	| "errors"
	| "files"
	| "skills"
	| "commands";

type SessionTurnTableColumnOption = {
	key: SessionTurnTableColumnKey;
	label: string;
};

export const SESSION_TURN_TABLE_COLUMN_OPTIONS: readonly SessionTurnTableColumnOption[] =
	[
		{ key: "time", label: "Time" },
		{ key: "duration", label: "Duration" },
		{ key: "input", label: "Input" },
		{ key: "output", label: "Output" },
		{ key: "cost", label: "Cost" },
		{ key: "tools", label: "Tools" },
		{ key: "errors", label: "Errors" },
		{ key: "files", label: "Files" },
		{ key: "skills", label: "Skills" },
		{ key: "commands", label: "Commands" },
	];

export const DEFAULT_SESSION_TURN_TABLE_COLUMNS: readonly SessionTurnTableColumnKey[] =
	SESSION_TURN_TABLE_COLUMN_OPTIONS.map((option) => option.key);

export function isSessionTurnTableColumnVisible(
	columnKey: string,
	visibleColumns: ReadonlySet<SessionTurnTableColumnKey>,
) {
	const groupKey = columnKey.startsWith("command-") ? "commands" : columnKey;
	return [...visibleColumns].some((visibleKey) => visibleKey === groupKey);
}

export function toggleSessionTurnTableColumn({
	availableColumns,
	columnKey,
	visibleColumns,
}: {
	availableColumns: readonly SessionTurnTableColumnKey[];
	columnKey: SessionTurnTableColumnKey;
	visibleColumns: ReadonlySet<SessionTurnTableColumnKey>;
}): ReadonlySet<SessionTurnTableColumnKey> {
	const visibleAvailableCount = availableColumns.filter((key) =>
		visibleColumns.has(key),
	).length;
	if (visibleColumns.has(columnKey) && visibleAvailableCount === 1) {
		return visibleColumns;
	}

	const nextColumns = new Set(visibleColumns);
	if (nextColumns.has(columnKey)) {
		nextColumns.delete(columnKey);
	} else {
		nextColumns.add(columnKey);
	}
	return nextColumns;
}

export function SessionTurnTableColumnComposer({
	availableColumns,
	onVisibleColumnsChange,
	visibleColumns,
}: {
	availableColumns: readonly SessionTurnTableColumnKey[];
	onVisibleColumnsChange: (
		columns: ReadonlySet<SessionTurnTableColumnKey>,
	) => void;
	visibleColumns: ReadonlySet<SessionTurnTableColumnKey>;
}) {
	const visibleAvailableCount = availableColumns.filter((key) =>
		visibleColumns.has(key),
	).length;
	const isDefault =
		visibleAvailableCount === availableColumns.length &&
		availableColumns.every((key) => visibleColumns.has(key));
	const triggerLabel = `Configure turn table columns, ${visibleAvailableCount} shown`;
	const availableColumnSet = new Set(availableColumns);

	return (
		<Popover>
			<PopoverTrigger
				type="button"
				aria-label={triggerLabel}
				title={triggerLabel}
				className="relative flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-(--session-overview-surface) py-1 pr-2 pl-1.5 text-base font-medium tracking-[-0.01em] text-(--session-overview-muted) shadow-[inset_0_0_0_1px_var(--session-overview-border)] outline-none hover:bg-(--session-overview-hover) hover:text-(--session-overview-text) focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-(--session-overview-accent) sm:h-7 sm:text-sm"
			>
				<Columns3 aria-hidden="true" className="size-4 h-lh shrink-0" />
				<span>Columns</span>
				<span
					aria-hidden="true"
					className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
				/>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={6}
				className="w-80 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-xl p-0 dark:shadow-none"
			>
				<div className="border-b border-border/60 px-4 py-3">
					<PopoverTitle className="text-sm font-semibold">
						Display columns
					</PopoverTitle>
				</div>
				<div className="flex flex-wrap gap-2 px-4 py-4">
					{SESSION_TURN_TABLE_COLUMN_OPTIONS.map((option) => {
						if (!availableColumnSet.has(option.key)) {
							return null;
						}

						const selected = visibleColumns.has(option.key);
						const isLastVisible = selected && visibleAvailableCount === 1;

						return (
							<button
								type="button"
								key={option.key}
								aria-disabled={isLastVisible}
								aria-pressed={selected}
								className={cn(
									"relative min-h-10 rounded-full px-3 py-2 text-base font-medium outline-none ring-1 ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:min-h-8 sm:py-1.5 sm:text-sm",
									selected
										? "bg-accent text-accent-foreground ring-transparent"
										: "bg-popover text-muted-foreground ring-border hover:bg-accent/60 hover:text-foreground",
									isLastVisible && "cursor-not-allowed opacity-60",
								)}
								title={
									isLastVisible
										? "At least one column must remain visible"
										: undefined
								}
								onClick={() =>
									onVisibleColumnsChange(
										toggleSessionTurnTableColumn({
											availableColumns,
											columnKey: option.key,
											visibleColumns,
										}),
									)
								}
							>
								{option.label}
								<span
									aria-hidden="true"
									className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
								/>
							</button>
						);
					})}
				</div>
				<div className="flex justify-end border-t border-border/60 px-3 py-2">
					<button
						type="button"
						className="relative min-h-10 rounded-md px-2 text-base font-medium text-primary outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:pointer-events-none disabled:opacity-40 sm:min-h-8 sm:text-sm"
						disabled={isDefault}
						onClick={() =>
							onVisibleColumnsChange(
								new Set(DEFAULT_SESSION_TURN_TABLE_COLUMNS),
							)
						}
					>
						Reset
						<span
							aria-hidden="true"
							className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
						/>
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
