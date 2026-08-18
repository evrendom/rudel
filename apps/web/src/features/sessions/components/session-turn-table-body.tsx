import {
	type KeyboardEvent,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type { SessionTurnEpisode } from "./session-turn-episodes";
import type { SessionTurnTableRow } from "./session-turn-table";
import type { TurnTableColumn } from "./session-turn-table-columns";
import { SessionTurnTableRowView } from "./session-turn-table-row";
import {
	isSessionTurnTableRowInViewport,
	type SessionTurnSelection,
} from "./session-turn-table-selection";

type ViewedIndicatorGroup = {
	firstVisibleIndex: string;
	height: number;
	key: string;
	lastVisibleIndex: string;
	rowCount: number;
	top: number;
};

function areViewedIndicatorGroupsEqual(
	previous: readonly ViewedIndicatorGroup[],
	next: readonly ViewedIndicatorGroup[],
) {
	return (
		previous.length === next.length &&
		previous.every((group, index) => {
			const nextGroup = next[index];
			return (
				nextGroup !== undefined &&
				group.firstVisibleIndex === nextGroup.firstVisibleIndex &&
				group.height === nextGroup.height &&
				group.lastVisibleIndex === nextGroup.lastVisibleIndex &&
				group.rowCount === nextGroup.rowCount &&
				group.top === nextGroup.top
			);
		})
	);
}

export function SessionTurnTableBody({
	collapsedEpisodeKeys,
	episodeByStartIndex,
	matchedIndices,
	memberColumns,
	memberGridTemplate,
	modelColumns,
	modelGridTemplate,
	onEpisodeToggle,
	onKeyDown,
	onSelect,
	primarySpeaker,
	rows,
	selectedRowKey,
	showSpeakerHighlights,
	userImageUrl,
	userLabel,
	viewedRowKeys,
	viewportRange,
}: {
	collapsedEpisodeKeys: ReadonlySet<string> | undefined;
	episodeByStartIndex: ReadonlyMap<number, SessionTurnEpisode>;
	matchedIndices: ReadonlySet<number> | undefined;
	memberColumns: readonly TurnTableColumn[];
	memberGridTemplate: string;
	modelColumns: readonly TurnTableColumn[];
	modelGridTemplate: string;
	onEpisodeToggle: ((key: string) => void) | undefined;
	onKeyDown: (
		event: KeyboardEvent<HTMLTableRowElement>,
		visibleIndex: number,
	) => void;
	onSelect: (selection: SessionTurnSelection) => void;
	primarySpeaker: SessionTurnTableRow["speaker"];
	rows: readonly SessionTurnTableRow[];
	selectedRowKey: string | undefined;
	showSpeakerHighlights: boolean;
	userImageUrl: string | undefined;
	userLabel: string;
	viewedRowKeys: ReadonlySet<string>;
	viewportRange: readonly [number, number] | undefined;
}) {
	const bodyRef = useRef<HTMLTableSectionElement>(null);
	const [viewedIndicatorGroups, setViewedIndicatorGroups] = useState<
		readonly ViewedIndicatorGroup[]
	>([]);
	const measureViewedIndicatorGroups = useCallback(() => {
		const body = bodyRef.current;
		if (!body) {
			return;
		}

		const viewedRows = Array.from(
			body.querySelectorAll<HTMLTableRowElement>(
				'tr[data-viewed="true"][data-visible-index]',
			),
		);
		const contiguousRows: HTMLTableRowElement[][] = [];
		for (const row of viewedRows) {
			const currentGroup = contiguousRows.at(-1);
			const previousRow = currentGroup?.at(-1);
			if (currentGroup && previousRow?.nextElementSibling === row) {
				currentGroup.push(row);
			} else {
				contiguousRows.push([row]);
			}
		}

		const bodyRect = body.getBoundingClientRect();
		const nextGroups = contiguousRows.flatMap<ViewedIndicatorGroup>((group) => {
			const firstRow = group[0];
			const lastRow = group.at(-1);
			const firstVisibleIndex = firstRow?.dataset.visibleIndex;
			const lastVisibleIndex = lastRow?.dataset.visibleIndex;
			if (
				!firstRow ||
				!lastRow ||
				firstVisibleIndex === undefined ||
				lastVisibleIndex === undefined
			) {
				return [];
			}

			const firstRect = firstRow.getBoundingClientRect();
			const lastRect = lastRow.getBoundingClientRect();
			return [
				{
					firstVisibleIndex,
					height: lastRect.bottom - firstRect.top,
					key: `${firstVisibleIndex}:${lastVisibleIndex}`,
					lastVisibleIndex,
					rowCount: group.length,
					top: firstRect.top - bodyRect.top,
				},
			];
		});
		setViewedIndicatorGroups((previous) =>
			areViewedIndicatorGroupsEqual(previous, nextGroups)
				? previous
				: nextGroups,
		);
	}, []);

	useLayoutEffect(() => {
		measureViewedIndicatorGroups();
	});

	useLayoutEffect(() => {
		const body = bodyRef.current;
		if (!body || typeof ResizeObserver === "undefined") {
			return;
		}

		const resizeObserver = new ResizeObserver(measureViewedIndicatorGroups);
		resizeObserver.observe(body);
		return () => resizeObserver.disconnect();
	}, [measureViewedIndicatorGroups]);

	return (
		<tbody
			ref={bodyRef}
			className="relative block min-w-full"
			data-session-turn-table-body
		>
			{/* Loaded pages intentionally stay in the DOM, even for ~2,000-row whale searches. */}
			{rows.map((row, visibleIndex) => {
				const { match } = row;
				const columns = row.speaker === "member" ? memberColumns : modelColumns;
				const gridTemplate =
					row.speaker === "member" ? memberGridTemplate : modelGridTemplate;
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
						gridTemplate={gridTemplate}
						emphasized={showSpeakerHighlights && row.speaker === primarySpeaker}
						onEpisodeToggle={onEpisodeToggle}
						onKeyDown={onKeyDown}
						onSelect={() =>
							onSelect({ index: match.index, speaker: row.speaker })
						}
						row={row}
						selected={row.key === selectedRowKey}
						userImageUrl={userImageUrl}
						userLabel={userLabel}
						viewed={viewedRowKeys.has(row.key)}
						visibleIndex={visibleIndex}
					/>
				);
			})}
			{viewedIndicatorGroups.map((group) => (
				<tr
					key={group.key}
					className="pointer-events-none absolute left-0.5 z-1 block w-1"
					data-first-visible-index={group.firstVisibleIndex}
					data-last-visible-index={group.lastVisibleIndex}
					data-pressed="true"
					data-row-count={group.rowCount}
					data-viewed-indicator-group
					style={{
						height: Math.max(0, group.height - 2),
						top: group.top + 1,
					}}
				>
					<td
						aria-hidden="true"
						className="block size-full rounded-full bg-[oklch(0.67_0.164_262.589)] shadow-[inset_0_0_1px_#00000012,inset_0_1px_1px_#00000012,inset_0_-1px_0_#ffffff0a] dark:shadow-none"
					/>
				</tr>
			))}
		</tbody>
	);
}
