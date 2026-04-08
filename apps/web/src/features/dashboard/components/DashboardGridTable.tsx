import type { ReactNode } from "react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";
import { cn } from "@/lib/utils";

export type DashboardGridTableColumn<T> = {
	id: string;
	header: ReactNode;
	renderCell: (row: T) => ReactNode;
	headerClassName?: string;
	cellClassName?: string | ((row: T, index: number) => string | undefined);
};

type DashboardGridTableProps<T> = {
	columns: DashboardGridTableColumn<T>[];
	rows: T[];
	rowKey: (row: T) => string;
	gridTemplateColumns: string;
	minWidthClassName: string;
	className?: string;
	headerClassName?: string;
	bodyClassName?: string;
	rowClassName?: string | ((row: T, index: number) => string | undefined);
	emptyState?: ReactNode;
	loadingState?: ReactNode;
	footer?: ReactNode;
	onRowHoverChange?: (rowId: string | null) => void;
	getHoverRowId?: (row: T) => string;
	onRowClick?: (row: T) => void;
	isRowSelected?: (row: T) => boolean;
};

type DashboardCellStackProps = {
	primary: ReactNode;
	secondary?: ReactNode;
	primaryClassName?: string;
	secondaryClassName?: string;
};

type DashboardInlineOverflowListProps = {
	visibleItems: string[];
	hiddenItems: string[];
	overflowLabel: string;
	mode?: "tooltip" | "popover" | "plain";
};

type DashboardTableFooterNoteProps = {
	children: ReactNode;
	align?: "right" | "left";
};

function DashboardInlineOverflowPopover({
	hiddenItems,
	overflowLabel,
}: {
	hiddenItems: string[];
	overflowLabel: string;
}) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger
				className="rounded-sm text-[color:var(--dashboardy-muted)] underline decoration-black/10 underline-offset-2 transition-colors hover:text-[color:var(--dashboardy-heading)]"
				onMouseEnter={() => setIsOpen(true)}
				onMouseLeave={() => setIsOpen(false)}
			>
				{overflowLabel}
			</PopoverTrigger>
			<PopoverContent
				side="bottom"
				align="start"
				sideOffset={6}
				className="max-h-56 min-w-40 max-w-[18rem] gap-1 overflow-y-auto rounded-lg px-2.5 py-2 text-[11px] shadow-md"
				onMouseEnter={() => setIsOpen(true)}
				onMouseLeave={() => setIsOpen(false)}
			>
				<div className="grid gap-0.5 text-muted-foreground">
					{hiddenItems.map((item) => (
						<p key={item} className="truncate">
							{item}
						</p>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function DashboardCellStack({
	primary,
	secondary,
	primaryClassName,
	secondaryClassName,
}: DashboardCellStackProps) {
	return (
		<div className="grid gap-0.5">
			<div
				className={cn(
					"truncate font-semibold text-[color:var(--dashboardy-heading)]",
					primaryClassName,
				)}
			>
				{primary}
			</div>
			{secondary != null ? (
				<div
					className={cn(
						"truncate text-[12px] text-[color:var(--dashboardy-muted)]",
						secondaryClassName,
					)}
				>
					{secondary}
				</div>
			) : null}
		</div>
	);
}

export function DashboardInlineOverflowList({
	visibleItems,
	hiddenItems,
	overflowLabel,
	mode = "tooltip",
}: DashboardInlineOverflowListProps) {
	const hasHiddenItems = hiddenItems.length > 0;
	const hasVisibleItems = visibleItems.length > 0;

	return (
		<>
			{visibleItems.map((item, index) => (
				<span key={item}>
					{index > 0 ? ", " : null}
					{item}
				</span>
			))}
			{hasHiddenItems ? (
				<>
					{hasVisibleItems ? ", " : null}
					{mode === "plain" ? (
						<span className="text-[color:var(--dashboardy-muted)]">
							{overflowLabel}
						</span>
					) : mode === "popover" ? (
						<DashboardInlineOverflowPopover
							hiddenItems={hiddenItems}
							overflowLabel={overflowLabel}
						/>
					) : (
						<Tooltip>
							<TooltipTrigger
								render={
									<span className="cursor-help text-[color:var(--dashboardy-muted)] underline decoration-black/10 underline-offset-2" />
								}
							>
								{overflowLabel}
							</TooltipTrigger>
							<TooltipContent align="start" className="max-w-sm">
								<div className="grid gap-0.5">
									{hiddenItems.map((item) => (
										<p key={item}>{item}</p>
									))}
								</div>
							</TooltipContent>
						</Tooltip>
					)}
				</>
			) : null}
		</>
	);
}

export function DashboardTableFooterNote({
	children,
	align = "right",
}: DashboardTableFooterNoteProps) {
	return (
		<div
			className={cn(
				"flex px-3.5 pt-2 text-[12px] font-medium text-[color:var(--dashboardy-muted)]",
				align === "right" ? "justify-end" : "justify-start",
			)}
		>
			{children}
		</div>
	);
}

export function DashboardGridTable<T>({
	columns,
	rows,
	rowKey,
	gridTemplateColumns,
	minWidthClassName,
	className,
	headerClassName,
	bodyClassName,
	rowClassName,
	emptyState,
	loadingState,
	footer,
	onRowHoverChange,
	getHoverRowId,
	onRowClick,
	isRowSelected,
}: DashboardGridTableProps<T>) {
	if (rows.length === 0) {
		return loadingState ?? emptyState ?? null;
	}

	return (
		<div className={cn("overflow-x-auto", className)}>
			<div className={cn("flex flex-col gap-1", minWidthClassName)}>
				<div
					className={cn(
						"grid gap-6 px-3.5 text-[13px] font-semibold text-[color:var(--dashboardy-muted)]",
						headerClassName,
					)}
					style={{ gridTemplateColumns }}
				>
					{columns.map((column) => (
						<div key={column.id} className={column.headerClassName}>
							{column.header}
						</div>
					))}
				</div>
				<div
					className={cn("grid gap-0", bodyClassName)}
					onPointerLeave={() => onRowHoverChange?.(null)}
					onPointerOver={(event) => {
						if (!onRowHoverChange) {
							return;
						}

						const target = event.target;
						if (!(target instanceof Element)) {
							return;
						}

						const row = target.closest<HTMLElement>(
							"[data-dashboard-grid-hover-id]",
						);

						onRowHoverChange(row?.dataset.dashboardGridHoverId ?? null);
					}}
				>
					{rows.map((row, index) => {
						const key = rowKey(row);
						const resolvedRowClassName =
							typeof rowClassName === "function"
								? rowClassName(row, index)
								: rowClassName;
						const hoverId = getHoverRowId?.(row);
						const isSelected = isRowSelected?.(row) ?? false;
						const sharedProps = {
							"data-dashboard-grid-hover-id": hoverId,
							"data-selected": isSelected ? "true" : undefined,
							className: cn(
								"grid min-h-12 items-center gap-6 rounded-lg px-3.5 py-2 text-sm odd:bg-[color:var(--dashboardy-subsurface-strong)]",
								onRowClick && "text-left transition-colors duration-200",
								resolvedRowClassName,
							),
							style: { gridTemplateColumns },
						};

						const cells = columns.map((column) => {
							const resolvedCellClassName =
								typeof column.cellClassName === "function"
									? column.cellClassName(row, index)
									: column.cellClassName;

							return (
								<div
									key={column.id}
									className={cn("min-w-0", resolvedCellClassName)}
								>
									{column.renderCell(row)}
								</div>
							);
						});

						return onRowClick ? (
							<button
								key={key}
								type="button"
								{...sharedProps}
								aria-pressed={isSelected}
								onClick={() => onRowClick(row)}
							>
								{cells}
							</button>
						) : (
							<div key={key} {...sharedProps}>
								{cells}
							</div>
						);
					})}
				</div>
				{footer}
			</div>
		</div>
	);
}
