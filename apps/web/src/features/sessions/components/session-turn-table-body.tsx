import type { KeyboardEvent } from "react";
import type { SessionTurnEpisode } from "./session-turn-episodes";
import type { SessionTurnTableRow } from "./session-turn-table";
import type { TurnTableColumn } from "./session-turn-table-columns";
import { SessionTurnTableRowView } from "./session-turn-table-row";
import {
	isSessionTurnTableRowInViewport,
	type SessionTurnSelection,
} from "./session-turn-table-selection";

export function SessionTurnTableBody({
	collapsedEpisodeKeys,
	columns,
	episodeByStartIndex,
	matchedIndices,
	onEpisodeToggle,
	onKeyDown,
	onSelect,
	rows,
	selectedRowKey,
	userImageUrl,
	userLabel,
	viewportRange,
}: {
	collapsedEpisodeKeys: ReadonlySet<string> | undefined;
	columns: readonly TurnTableColumn[];
	episodeByStartIndex: ReadonlyMap<number, SessionTurnEpisode>;
	matchedIndices: ReadonlySet<number> | undefined;
	onEpisodeToggle: ((key: string) => void) | undefined;
	onKeyDown: (
		event: KeyboardEvent<HTMLTableRowElement>,
		visibleIndex: number,
	) => void;
	onSelect: (selection: SessionTurnSelection) => void;
	rows: readonly SessionTurnTableRow[];
	selectedRowKey: string | undefined;
	userImageUrl: string | undefined;
	userLabel: string;
	viewportRange: readonly [number, number] | undefined;
}) {
	return (
		<>
			{/* Loaded pages intentionally stay in the DOM, even for ~2,000-row whale searches. */}
			{rows.map((row, visibleIndex) => {
				const { match } = row;
				const beginsTurn =
					visibleIndex === 0 ||
					rows[visibleIndex - 1]?.match.option.key !== match.option.key;
				return (
					<SessionTurnTableRowView
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
						onEpisodeToggle={onEpisodeToggle}
						onKeyDown={onKeyDown}
						onSelect={() =>
							onSelect({ index: match.index, speaker: row.speaker })
						}
						row={row}
						selected={row.key === selectedRowKey}
						userImageUrl={userImageUrl}
						userLabel={userLabel}
						visibleIndex={visibleIndex}
					/>
				);
			})}
		</>
	);
}
