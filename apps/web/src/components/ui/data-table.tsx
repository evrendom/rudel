import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	defaultSorting?: SortingState;
	defaultPageSize?: number;
	pageSizeOptions?: number[];
	onRowClick?: (row: TData) => void;
	isRowClickable?: (row: TData) => boolean;
	analyticsId?: string;
	getRowAnalyticsValue?: (row: TData) => string;
}

function DataTable<TData, TValue>({
	columns,
	data,
	defaultSorting = [],
	defaultPageSize = 10,
	pageSizeOptions = [10, 20, 50],
	onRowClick,
	isRowClickable,
	analyticsId = "data_table",
	getRowAnalyticsValue,
}: DataTableProps<TData, TValue>) {
	const [sorting, setSorting] = useState<SortingState>(defaultSorting);
	const { trackDrilldown, trackFilterChange } = useAnalyticsTracking();

	const trackTableFilter = (options: {
		filterName: string;
		filterCategory: string;
		changeAction: string;
		valueKey?: string;
	}) => {
		trackFilterChange({
			filterName: `${analyticsId}_${options.filterName}`,
			filterCategory: options.filterCategory,
			changeAction: options.changeAction,
			sourceComponent: analyticsId,
			valueKey: options.valueKey,
			affectedScope: "table",
		});
	};

	const table = useReactTable({
		data,
		columns,
		state: { sorting },
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: {
			pagination: { pageSize: defaultPageSize },
		},
	});

	return (
		<div>
			<Table>
				<TableHeader className="bg-surface">
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id}>
							{headerGroup.headers.map((header) => (
								<TableHead
									key={header.id}
									className="px-6 py-3 text-xs text-muted uppercase tracking-wider"
								>
									{header.isPlaceholder ? null : header.column.getCanSort() ? (
										<button
											type="button"
											className="inline-flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors"
											onClick={(event) => {
												trackTableFilter({
													filterName: "sort",
													filterCategory: "sort",
													changeAction: "set",
													valueKey: header.column.id,
												});
												header.column.getToggleSortingHandler()?.(event);
											}}
										>
											{flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)}
											{header.column.getIsSorted() === "asc" ? (
												<ArrowUp className="size-3" />
											) : header.column.getIsSorted() === "desc" ? (
												<ArrowDown className="size-3" />
											) : (
												<ArrowUpDown className="size-3 opacity-40" />
											)}
										</button>
									) : (
										flexRender(
											header.column.columnDef.header,
											header.getContext(),
										)
									)}
								</TableHead>
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody className="bg-input">
					{table.getRowModel().rows.length > 0 ? (
						table.getRowModel().rows.map((row) => {
							const clickable =
								onRowClick && (!isRowClickable || isRowClickable(row.original));
							return (
								<TableRow
									key={row.id}
									onClick={
										clickable
											? () => {
													trackDrilldown({
														drilldownMethod: "table_row",
														sourceComponent: analyticsId,
														targetType: "table_row",
														targetId: getRowAnalyticsValue
															? getRowAnalyticsValue(row.original)
															: row.id,
													});
													onRowClick(row.original);
												}
											: undefined
									}
									className={clickable ? "hover:bg-hover cursor-pointer" : ""}
								>
									{row.getVisibleCells().map((cell) => (
										<TableCell key={cell.id} className="px-6 py-4 text-sm">
											{flexRender(
												cell.column.columnDef.cell,
												cell.getContext(),
											)}
										</TableCell>
									))}
								</TableRow>
							);
						})
					) : (
						<TableRow>
							<TableCell
								colSpan={columns.length}
								className="h-24 text-center text-muted"
							>
								No results.
							</TableCell>
						</TableRow>
					)}
				</TableBody>
			</Table>

			<div className="flex items-center justify-between pt-4 px-2">
				<div className="flex items-center gap-2 text-sm text-muted">
					<span>Rows per page</span>
					<Select
						value={String(table.getState().pagination.pageSize)}
						onValueChange={(value) => {
							trackTableFilter({
								filterName: "page_size",
								filterCategory: "pagination",
								changeAction: "set",
								valueKey: value,
							});
							table.setPageSize(Number(value));
						}}
					>
						<SelectTrigger size="sm" className="w-[70px]">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{pageSizeOptions.map((size) => (
								<SelectItem key={size} value={String(size)}>
									{size}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex items-center gap-4">
					<span className="text-sm text-muted">
						Page {table.getState().pagination.pageIndex + 1} of{" "}
						{table.getPageCount()}
					</span>
					<div className="flex items-center gap-1">
						<Button
							variant="outline"
							size="icon-sm"
							onClick={() => {
								trackTableFilter({
									filterName: "page",
									filterCategory: "pagination",
									changeAction: "previous",
								});
								table.previousPage();
							}}
							disabled={!table.getCanPreviousPage()}
						>
							<span className="sr-only">Previous page</span>
							&#8249;
						</Button>
						<Button
							variant="outline"
							size="icon-sm"
							onClick={() => {
								trackTableFilter({
									filterName: "page",
									filterCategory: "pagination",
									changeAction: "next",
								});
								table.nextPage();
							}}
							disabled={!table.getCanNextPage()}
						>
							<span className="sr-only">Next page</span>
							&#8250;
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}

export { DataTable };
export type { DataTableProps };
