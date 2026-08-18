import type { CSSProperties } from "react";
import type { TurnTableColumn } from "./session-turn-table-columns";

export function SessionTurnTableFooter({
	columns,
	gridTemplate,
	sessionDurationLabel,
	turnCount,
}: {
	columns: readonly TurnTableColumn[];
	gridTemplate: string;
	sessionDurationLabel: string;
	turnCount: number;
}) {
	return (
		<tfoot className="sticky bottom-0 z-20 block min-w-full bg-(--session-turn-table-surface)">
			<tr
				aria-label="Visible turn totals"
				className="grid min-h-9 min-w-full border-t border-(--session-overview-border) [grid-template-columns:var(--session-turn-grid-template)]"
				style={
					{
						"--session-turn-grid-template": gridTemplate,
					} as CSSProperties
				}
			>
				<td aria-label="Transcript visibility" />
				<th
					className="flex min-w-0 items-center py-1.5 pr-1 pl-2 text-left text-xs font-medium text-(--session-overview-text) tabular-nums"
					scope="row"
				>
					{turnCount.toLocaleString()}x
				</th>
				{columns.map((column) => {
					const summary =
						column.key === "time"
							? {
									label: sessionDurationLabel,
									title: "Session duration",
								}
							: column.summary;

					return (
						<td
							key={column.key}
							aria-label={column.label}
							className="flex min-w-0 items-center px-1.5 py-1.5"
						>
							<p
								className={
									summary
										? "truncate text-xs font-medium text-(--session-overview-text) tabular-nums"
										: "text-xs text-(--session-overview-subtle)"
								}
								title={summary?.title}
							>
								{summary?.label ?? "—"}
							</p>
						</td>
					);
				})}
			</tr>
		</tfoot>
	);
}
