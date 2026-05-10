import type {
	CSSProperties,
	HTMLAttributes,
	ReactElement,
	TableHTMLAttributes,
	TdHTMLAttributes,
	ThHTMLAttributes,
} from "react";

export function Table(
	props: TableHTMLAttributes<HTMLTableElement>,
): ReactElement {
	const { children, style, ...tableProps } = props;

	return (
		<table {...tableProps} style={{ ...styles.table, ...style }}>
			{children}
		</table>
	);
}

export function TableHeader(
	props: HTMLAttributes<HTMLTableSectionElement>,
): ReactElement {
	const { children, style, ...tableHeaderProps } = props;

	return (
		<thead {...tableHeaderProps} style={{ ...styles.header, ...style }}>
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

	return (
		<tr {...tableRowProps} style={{ ...styles.row, ...style }}>
			{children}
		</tr>
	);
}

export function TableHead(
	props: ThHTMLAttributes<HTMLTableCellElement>,
): ReactElement {
	const { children, style, ...tableHeadProps } = props;

	return (
		<th {...tableHeadProps} style={{ ...styles.head, ...style }}>
			{children}
		</th>
	);
}

export function TableCell(
	props: TdHTMLAttributes<HTMLTableCellElement>,
): ReactElement {
	const { children, style, ...tableCellProps } = props;

	return (
		<td {...tableCellProps} style={{ ...styles.cell, ...style }}>
			{children}
		</td>
	);
}

const styles = {
	table: {
		width: "100%",
		borderCollapse: "collapse",
		color: "#050505",
	} satisfies CSSProperties,
	header: {} satisfies CSSProperties,
	body: {} satisfies CSSProperties,
	row: {
		borderBottom: "1px solid rgba(5, 5, 5, 0.08)",
	} satisfies CSSProperties,
	head: {
		padding: "0 0 8px",
		color: "#737373",
		fontSize: 13,
		fontWeight: 500,
		textAlign: "left",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
	cell: {
		padding: "9px 0",
		color: "#171717",
		fontSize: 14,
		fontWeight: 500,
		textAlign: "left",
		whiteSpace: "nowrap",
	} satisfies CSSProperties,
} satisfies Record<string, CSSProperties>;
