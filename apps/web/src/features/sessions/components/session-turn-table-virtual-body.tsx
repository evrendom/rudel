import type { KeyboardEvent } from "react";
import type { SessionTurnEpisode } from "./session-turn-episodes";
import type { SessionTurnTableRow } from "./session-turn-table";
import type { TurnTableColumn } from "./session-turn-table-columns";
import {
	isSessionTurnTableRowInViewport,
	type SessionTurnSelection,
} from "./session-turn-table-selection";
import { SessionTurnTableVirtualRow } from "./session-turn-table-virtual-row";

export function SessionTurnTableVirtualBody({
	collapsedEpisodeKeys,
	columns,
	episodeByStartIndex,
	matchedIndices,
	measureElement,
	onEpisodeToggle,
	onKeyDown,
	onRowElement,
	onSelect,
	paddingBottom,
	paddingTop,
	rows,
	scheduleMeasurement,
	selectedRowKey,
	userImageUrl,
	userLabel,
	viewportRange,
	virtualRows,
}: {
	collapsedEpisodeKeys: ReadonlySet<string> | undefined;
	columns: readonly TurnTableColumn[];
	episodeByStartIndex: ReadonlyMap<number, SessionTurnEpisode>;
	matchedIndices: ReadonlySet<number> | undefined;
	measureElement: (element: HTMLTableSectionElement | null) => void;
	onEpisodeToggle: ((key: string) => void) | undefined;
	onKeyDown: (
		event: KeyboardEvent<HTMLTableRowElement>,
		visibleIndex: number,
	) => void;
	onRowElement: (
		visibleIndex: number,
		element: HTMLTableRowElement | null,
	) => void;
	onSelect: (selection: SessionTurnSelection) => void;
	paddingBottom: number;
	paddingTop: number;
	rows: readonly SessionTurnTableRow[];
	scheduleMeasurement: (element: HTMLTableSectionElement) => void;
	selectedRowKey: string | undefined;
	userImageUrl: string | undefined;
	userLabel: string;
	viewportRange: readonly [number, number] | undefined;
	virtualRows: readonly { index: number }[];
}) {
	return (
		<>
			{paddingTop > 0 ? (
				<tbody aria-hidden="true">
					<tr>
						<td colSpan={columns.length + 1} style={{ height: paddingTop }} />
					</tr>
				</tbody>
			) : null}
			{virtualRows.map(({ index: visibleIndex }) => {
				const row = rows[visibleIndex];
				if (!row) return null;
				const { match } = row;
				const beginsTurn =
					visibleIndex === 0 ||
					rows[visibleIndex - 1]?.match.option.key !== match.option.key;
				return (
					<SessionTurnTableVirtualRow
						key={row.key}
						beginsTurn={beginsTurn}
						collapsedEpisodeKeys={collapsedEpisodeKeys}
						columns={columns}
						episode={
							beginsTurn ? episodeByStartIndex.get(match.index) : undefined
						}
						inViewport={isSessionTurnTableRowInViewport({
							turnIndex: match.index,
							viewportRange,
						})}
						matchesLens={matchedIndices?.has(match.index) ?? false}
						measureElement={measureElement}
						onEpisodeToggle={onEpisodeToggle}
						onKeyDown={onKeyDown}
						onRowElement={onRowElement}
						onSelect={() =>
							onSelect({ index: match.index, speaker: row.speaker })
						}
						row={row}
						scheduleMeasurement={scheduleMeasurement}
						selected={row.key === selectedRowKey}
						userImageUrl={userImageUrl}
						userLabel={userLabel}
						visibleIndex={visibleIndex}
					/>
				);
			})}
			{paddingBottom > 0 ? (
				<tbody aria-hidden="true">
					<tr>
						<td
							colSpan={columns.length + 1}
							style={{ height: paddingBottom }}
						/>
					</tr>
				</tbody>
			) : null}
		</>
	);
}
