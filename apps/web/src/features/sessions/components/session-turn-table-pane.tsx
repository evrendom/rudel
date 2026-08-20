import type { SessionDetailTurnSummary } from "@rudel/api-routes";
import { type Ref, useMemo, useState } from "react";
import {
	type SessionContinuousTurnViewportStore,
	useSessionContinuousTurnTrailingActiveSelection,
	useSessionContinuousTurnViewedSelections,
	useSessionContinuousTurnVisibleRange,
} from "./session-continuous-turn-viewport-store";
import {
	SessionTurnTable,
	type SessionTurnTableOption,
	type SessionTurnTableSpeaker,
	type SessionTurnTableVirtualizerHandle,
} from "./session-turn-table";
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
	fileEvents?: ReadonlyArray<
		NonNullable<SessionDetailTurnSummary["fileEvents"]>[number]
	>;
	hasBody?: boolean;
	memberPreview: string;
	modelSignalCount?: number;
	preview: string;
	signalCount?: number;
	signalOccurrences?: readonly SessionDetailTurnSummary["signalOccurrences"][number][];
	subagentEvents?: ReadonlyArray<
		NonNullable<SessionDetailTurnSummary["subagentEvents"]>[number]
	>;
	turn?: SessionTurn;
}

export type SessionTurnTablePaneMatch =
	IndexedSessionTurnTableOption<SessionTurnTablePaneOption>;

export function SessionTurnTablePane({
	model,
	onPrefetchTurn,
	onSelect,
	options,
	selection,
	sessionDurationLabel,
	userImageUrl,
	userLabel,
	viewportStore,
	virtualizerRef,
}: {
	model: string | undefined;
	onPrefetchTurn?: (turnId: string, immediate: boolean) => void;
	onSelect: (selection: SessionTurnSelection) => void;
	options: readonly SessionTurnTablePaneOption[];
	selection: SessionTurnSelection;
	sessionDurationLabel: string;
	userImageUrl: string | undefined;
	userLabel: string;
	viewportStore: SessionContinuousTurnViewportStore;
	virtualizerRef?: Ref<SessionTurnTableVirtualizerHandle>;
}) {
	const activeSelection =
		useSessionContinuousTurnTrailingActiveSelection(viewportStore);
	const viewportRange = useSessionContinuousTurnVisibleRange(viewportStore);
	const viewedSelections =
		useSessionContinuousTurnViewedSelections(viewportStore);
	const effectiveSelection = activeSelection ?? selection;
	const [primarySpeaker, setPrimarySpeaker] =
		useState<SessionTurnTableSpeaker>("model");
	const [visibleSpeakers, setVisibleSpeakers] = useState<
		ReadonlySet<SessionTurnTableSpeaker>
	>(() => new Set(["member", "model"]));
	const { effectiveVisibleColumnKeys, handleSort, sort, visibleMatches } =
		useSessionTurnTableControls({ options });
	const tableRows = useMemo(
		() =>
			buildSessionTurnTableViewRows(visibleMatches, visibleSpeakers, "model"),
		[visibleMatches, visibleSpeakers],
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
		<div className="flex min-h-0 flex-1 flex-col">
			<SessionTurnTable
				model={model}
				onPrefetchTurn={onPrefetchTurn}
				onSort={handleSort}
				onSelect={onSelect}
				options={options}
				primarySpeaker={primarySpeaker}
				rows={tableRows}
				selection={effectiveSelection}
				sessionDurationLabel={sessionDurationLabel}
				showSpeakerColumn
				showSpeakerHighlights={visibleSpeakers.size > 1}
				speakerVisibilityControls={
					<SessionTurnTableSpeakerVisibilityControls
						className={undefined}
						model={model}
						onPrimarySpeakerChange={setPrimarySpeaker}
						onVisibleSpeakersChange={handleVisibleSpeakersChange}
						primarySpeaker={primarySpeaker}
						userImageUrl={userImageUrl}
						userLabel={userLabel}
						visibleSpeakers={visibleSpeakers}
					/>
				}
				sort={sort}
				userImageUrl={userImageUrl}
				userLabel={userLabel}
				visibleColumnKeys={effectiveVisibleColumnKeys}
				visibleOptions={visibleMatches}
				viewedSelections={viewedSelections}
				viewportRange={viewportRange}
				virtualizerRef={virtualizerRef}
			/>
		</div>
	);
}
