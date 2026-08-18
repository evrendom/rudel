import { type Ref, useMemo, useState } from "react";
import {
	type SessionContinuousTurnViewportStore,
	useSessionContinuousTurnTrailingActiveSelection,
	useSessionContinuousTurnVisibleRange,
} from "./session-continuous-turn-viewport-store";
import {
	SessionTurnTable,
	type SessionTurnTableOption,
	type SessionTurnTableSpeaker,
	type SessionTurnTableVirtualizerHandle,
} from "./session-turn-table";
import { SessionTurnTableControls } from "./session-turn-table-filter";
import type { IndexedSessionTurnTableOption } from "./session-turn-table-filters";
import {
	getVisibleSessionTurnSpeaker,
	type SessionTurnSelection,
} from "./session-turn-table-selection";
import { buildSessionTurnTableViewRows } from "./session-turn-table-view-rows";
import { SessionTurnTableSpeakerVisibilityControls } from "./session-turn-table-view-tabs";
import type { SessionTurn } from "./session-turns";
import { useSessionTurnTableControls } from "./use-session-turn-table-controls";

export interface SessionTurnTablePaneOption extends SessionTurnTableOption {
	hasBody?: boolean;
	memberPreview: string;
	preview: string;
	turn?: SessionTurn;
}

export type SessionTurnTablePaneMatch =
	IndexedSessionTurnTableOption<SessionTurnTablePaneOption>;

export function SessionTurnTablePane({
	model,
	onSelect,
	options,
	selection,
	userImageUrl,
	userLabel,
	viewportStore,
	virtualizerRef,
}: {
	model: string | undefined;
	onSelect: (selection: SessionTurnSelection) => void;
	options: readonly SessionTurnTablePaneOption[];
	selection: SessionTurnSelection;
	userImageUrl: string | undefined;
	userLabel: string;
	viewportStore: SessionContinuousTurnViewportStore;
	virtualizerRef?: Ref<SessionTurnTableVirtualizerHandle>;
}) {
	const activeSelection =
		useSessionContinuousTurnTrailingActiveSelection(viewportStore);
	const viewportRange = useSessionContinuousTurnVisibleRange(viewportStore);
	const effectiveSelection = activeSelection ?? selection;
	const [primarySpeaker, setPrimarySpeaker] =
		useState<SessionTurnTableSpeaker>("model");
	const [visibleSpeakers, setVisibleSpeakers] = useState<
		ReadonlySet<SessionTurnTableSpeaker>
	>(() => new Set(["model"]));
	const {
		activeSortLabel,
		effectiveVisibleColumnKeys,
		handleSort,
		sort,
		toggleSortDirection,
		visibleMatches,
	} = useSessionTurnTableControls({
		options,
	});
	const tableRows = useMemo(
		() =>
			buildSessionTurnTableViewRows(
				visibleMatches,
				visibleSpeakers,
				primarySpeaker,
			),
		[primarySpeaker, visibleMatches, visibleSpeakers],
	);

	function handleVisibleSpeakersChange(
		nextVisibleSpeakers: ReadonlySet<SessionTurnTableSpeaker>,
	) {
		setVisibleSpeakers(nextVisibleSpeakers);
		const nextSpeaker = getVisibleSessionTurnSpeaker(
			effectiveSelection.speaker,
			nextVisibleSpeakers,
		);
		if (nextSpeaker !== effectiveSelection.speaker) {
			onSelect({ ...effectiveSelection, speaker: nextSpeaker });
		}
	}

	return (
		<>
			<SessionTurnTableControls
				activeSortLabel={activeSortLabel}
				className={undefined}
				onToggleSortDirection={toggleSortDirection}
				sort={sort}
				viewControls={
					<SessionTurnTableSpeakerVisibilityControls
						className={undefined}
						model={model}
						onPrimarySpeakerChange={setPrimarySpeaker}
						onVisibleSpeakersChange={handleVisibleSpeakersChange}
						primarySpeaker={primarySpeaker}
						userImageUrl={userImageUrl}
						visibleSpeakers={visibleSpeakers}
					/>
				}
			/>
			<div className="flex min-h-0 flex-1 flex-col">
				<SessionTurnTable
					model={model}
					onPrimarySpeakerChange={setPrimarySpeaker}
					onSort={handleSort}
					onSelect={onSelect}
					options={options}
					primarySpeaker={primarySpeaker}
					rows={tableRows}
					selection={effectiveSelection}
					sort={sort}
					userImageUrl={userImageUrl}
					userLabel={userLabel}
					visibleColumnKeys={effectiveVisibleColumnKeys}
					visibleOptions={visibleMatches}
					visibleSpeakers={visibleSpeakers}
					viewportRange={viewportRange}
					virtualizerRef={virtualizerRef}
				/>
			</div>
		</>
	);
}
