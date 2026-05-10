import type {
	CSSProperties,
	HTMLAttributes,
	ReactElement,
	TableHTMLAttributes,
	TdHTMLAttributes,
	ThHTMLAttributes,
} from "react";
import { createContext, useContext } from "react";

type TableVariant = "default" | "panel";
type TableLayout = "auto" | "fixed";
type TableTextAlign = "left" | "center" | "right";

interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
	layout?: TableLayout;
	variant?: TableVariant;
}

type TableContextValue = {
	variant: TableVariant;
};

const TableContext = createContext<TableContextValue>({ variant: "default" });

export function Table(props: TableProps): ReactElement {
	const {
		children,
		layout = "auto",
		style,
		variant = "default",
		...tableProps
	} = props;

	const table = (
		<TableContext.Provider value={{ variant }}>
			<table
				{...tableProps}
				data-layout={layout}
				data-slot="table"
				data-variant={variant}
				style={{ ...styles.table, tableLayout: layout, ...style }}
			>
				{children}
			</table>
		</TableContext.Provider>
	);

	if (variant === "panel") {
		return (
			<div data-slot="table-container" style={styles.panelContainer}>
				{table}
			</div>
		);
	}

	return table;
}

export function TableHeader(
	props: HTMLAttributes<HTMLTableSectionElement>,
): ReactElement {
	const { children, style, ...tableHeaderProps } = props;
	const { variant } = useContext(TableContext);

	return (
		<thead
			{...tableHeaderProps}
			style={{ ...styles.header, ...tableHeaderStyle(variant), ...style }}
		>
			{children}
		</thead>
	);
}

export function TableBody(
	props: HTMLAttributes<HTMLTableSectionElement>,
): ReactElement {
	const { children, style, ...tableBodyProps } = props;

	return (
		<tbody {...tableBodyProps} style={{ ...styles.body, ...style }}>
			{children}
		</tbody>
	);
}

export function TableRow(
	props: HTMLAttributes<HTMLTableRowElement>,
): ReactElement {
	const { children, style, ...tableRowProps } = props;
	const { variant } = useContext(TableContext);

	return (
		<tr
			{...tableRowProps}
			style={{ ...styles.row, ...tableRowStyle(variant), ...style }}
		>
			{children}
		</tr>
	);
}

export function TableHead(
	props: ThHTMLAttributes<HTMLTableCellElement> & {
		textAlign?: TableTextAlign;
		width?: number | string;
	},
): ReactElement {
	const { children, style, textAlign, width, ...tableHeadProps } = props;
	const { variant } = useContext(TableContext);

	return (
		<th
			{...tableHeadProps}
			data-slot="table-head"
			style={{
				...styles.head,
				...tableHeadStyle(variant),
				...tableCellMetricStyle(textAlign, width),
				...style,
			}}
		>
			{children}
		</th>
	);
}

export function TableCell(
	props: TdHTMLAttributes<HTMLTableCellElement> & {
		textAlign?: TableTextAlign;
		width?: number | string;
	},
): ReactElement {
	const { children, style, textAlign, width, ...tableCellProps } = props;
	const { variant } = useContext(TableContext);

	return (
		<td
			{...tableCellProps}
			data-slot="table-cell"
			style={{
				...styles.cell,
				...tableCellStyle(variant),
				...tableCellMetricStyle(textAlign, width),
				...style,
			}}
		>
			{children}
		</td>
	);
}

function tableHeaderStyle(variant: TableVariant): CSSProperties {
	if (variant === "panel") {
		return styles.panelHeader;
	}
	return styles.defaultHeader;
}

function tableRowStyle(variant: TableVariant): CSSProperties {
	if (variant === "panel") {
		return styles.panelRow;
	}
	return styles.defaultRow;
}

function tableHeadStyle(variant: TableVariant): CSSProperties {
	if (variant === "panel") {
		return styles.panelHead;
	}
	return styles.defaultHead;
}

function tableCellStyle(variant: TableVariant): CSSProperties {
	if (variant === "panel") {
		return styles.panelCell;
	}
	return styles.defaultCell;
}

function tableCellMetricStyle(
	textAlign: TableTextAlign | undefined,
	width: number | string | undefined,
): CSSProperties {
	return {
		...(textAlign ? { textAlign } : {}),
		...(width ? { width } : {}),
	};
}

const styles = {
	panelContainer: {
		width: "100%",
		border: "1px solid rgba(5, 5, 5, 0.1)",
		borderRadius: 8,
		background: "#ffffff",
		overflow: "hidden",
	} satisfies CSSProperties,
	table: {
		width: "100%",
		borderCollapse: "collapse",
		color: "#050505",
	} satisfies CSSProperties,
	header: {} satisfies CSSProperties,
	defaultHeader: {} satisfies CSSProperties,
	panelHeader: {
		background: "#fbfbfb",
	} satisfies CSSProperties,
	body: {} satisfies CSSProperties,
	row: {
		borderBottom: "1px solid rgba(5, 5, 5, 0.08)",
	} satisfies CSSProperties,
	defaultRow: {} satisfies CSSProperties,
	panelRow: {
		borderBottom: "1px solid rgba(5, 5, 5, 0.08)",
	} satisfies CSSProperties,
	head: {
		color: "#737373",
		fontSize: 13,
		fontWeight: 500,
		textAlign: "left",
		verticalAlign: "middle",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	defaultHead: {
		padding: "0 0 8px",
	} satisfies CSSProperties,
	panelHead: {
		padding: "12px 20px",
		color: "#737373",
		fontSize: 12,
		fontWeight: 650,
		letterSpacing: 0,
	} satisfies CSSProperties,
	cell: {
		color: "#171717",
		fontSize: 14,
		fontWeight: 500,
		textAlign: "left",
		verticalAlign: "middle",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	defaultCell: {
		padding: "9px 0",
	} satisfies CSSProperties,
	panelCell: {
		padding: "14px 20px",
	} satisfies CSSProperties,
} satisfies Record<string, CSSProperties>;
