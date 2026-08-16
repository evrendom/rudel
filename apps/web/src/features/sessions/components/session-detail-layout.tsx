import {
	type CSSProperties,
	type ReactNode,
	type Ref,
	type RefObject,
	useCallback,
	useRef,
	useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
	HorizontalResizeHandle,
	useElementWidth,
	useStoredPaneSize,
} from "@/components/ui/horizontal-resize-handle";
import { clampPaneSize } from "@/components/ui/horizontal-resize-utils";
import {
	createSessionContinuousTurnViewportStore,
	type SessionContinuousTurnViewportStore,
	useSessionContinuousTurnVisibleRange,
} from "./session-continuous-turn-viewport-store";
import {
	resolveSessionDetailLevel,
	type SessionDetailLevel,
} from "./session-detail-level";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import type { SessionTurnTableVirtualizerHandle } from "./session-detail-virtualization";
import { SessionOverviewSummaryStrip } from "./session-overview-summary-strip";
import { SessionThreadOverviewStrip } from "./session-thread-overview-strip";
import { SessionTurnResponsePane } from "./session-turn-response-pane";
import {
	SessionTurnTablePane,
	type SessionTurnTablePaneOption,
} from "./session-turn-table-pane";
import type { SessionTurnSelection } from "./session-turn-table-selection";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

const DEFAULT_TURN_TABLE_PANE_WIDTH_PX = 576;
const MINIMUM_TURN_TABLE_PANE_WIDTH_PX = 320;
const MAXIMUM_TURN_TABLE_PANE_WIDTH_PX = 800;
const MINIMUM_RESPONSE_PANE_WIDTH_PX = 320;
const RESIZE_HANDLE_WIDTH_PX = 2;
const TURN_TABLE_PANE_STORAGE_KEY = "rudel:session-turn-table-pane-width:v1";

type TurnTableGridStyle = CSSProperties & {
	"--session-turn-table-pane-width": string;
};

type SessionDetailResponsePaneRenderProps = {
	onContinuousTurnViewportChange: (
		activeIndex: number,
		visibleRange: readonly [number, number],
	) => void;
};

function SessionThreadOverviewViewportStrip({
	onSelect,
	options,
	selection,
	store,
}: {
	onSelect: (selection: SessionTurnSelection) => void;
	options: readonly SessionTurnTablePaneOption[];
	selection: SessionTurnSelection;
	store: SessionContinuousTurnViewportStore;
}) {
	const visibleRange = useSessionContinuousTurnVisibleRange(store);

	return (
		<SessionThreadOverviewStrip
			onSelect={(index) => onSelect({ ...selection, index })}
			options={options}
			selectedIndex={selection.index}
			visibleRange={visibleRange}
		/>
	);
}

type SessionDetailLayoutProps = {
	bottomPaddingClassName: string;
	onContinuousTurnFocus: (index: number) => void;
	onSelect: (selection: SessionTurnSelection) => void;
	options: readonly SessionTurnTablePaneOption[];
	responsePane?: (props: SessionDetailResponsePaneRenderProps) => ReactNode;
	responseScrollRef: RefObject<HTMLDivElement | null>;
	selection: SessionTurnSelection;
	turnTableFooter?: ReactNode;
	turnTableSectionRef: RefObject<HTMLElement | null>;
	turnTableVirtualizerRef?: Ref<SessionTurnTableVirtualizerHandle>;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
};

export function SessionDetailLayout({
	bottomPaddingClassName,
	onContinuousTurnFocus,
	onSelect,
	options,
	responsePane,
	responseScrollRef,
	selection,
	turnTableFooter,
	turnTableSectionRef,
	turnTableVirtualizerRef,
	userImageUrl,
	viewModel,
}: SessionDetailLayoutProps) {
	const [searchParams, setSearchParams] = useSearchParams();
	const detailLevel = resolveSessionDetailLevel(searchParams.get("level"));
	const handleDetailLevelChange = useCallback(
		(nextLevel: SessionDetailLevel) => {
			setSearchParams(
				(previousSearchParams) => {
					const nextSearchParams = new URLSearchParams(previousSearchParams);
					if (nextLevel === "normal") {
						nextSearchParams.delete("level");
					} else {
						nextSearchParams.set("level", nextLevel);
					}
					return nextSearchParams;
				},
				{ replace: true },
			);
		},
		[setSearchParams],
	);
	const layoutRef = useRef<HTMLDivElement>(null);
	const layoutWidth = useElementWidth(layoutRef);
	const [storedTurnTablePaneWidth, setStoredTurnTablePaneWidth] =
		useStoredPaneSize(
			TURN_TABLE_PANE_STORAGE_KEY,
			DEFAULT_TURN_TABLE_PANE_WIDTH_PX,
		);
	const [continuousTurnViewportStore] = useState(
		createSessionContinuousTurnViewportStore,
	);
	const handleContinuousTurnViewportChange = useCallback(
		(_activeIndex: number, visibleRange: readonly [number, number]) => {
			continuousTurnViewportStore.publish(visibleRange);
		},
		[continuousTurnViewportStore],
	);
	const turnTablePaneMaximum =
		layoutWidth > 0
			? Math.min(
					MAXIMUM_TURN_TABLE_PANE_WIDTH_PX,
					layoutWidth - MINIMUM_RESPONSE_PANE_WIDTH_PX - RESIZE_HANDLE_WIDTH_PX,
				)
			: MAXIMUM_TURN_TABLE_PANE_WIDTH_PX;
	const turnTablePaneWidth = clampPaneSize(
		storedTurnTablePaneWidth,
		MINIMUM_TURN_TABLE_PANE_WIDTH_PX,
		turnTablePaneMaximum,
	);
	const turnTableGridStyle: TurnTableGridStyle = {
		"--session-turn-table-pane-width": `${turnTablePaneWidth}px`,
	};
	const previewTurnTablePaneWidth = useCallback((nextValue: number) => {
		layoutRef.current?.style.setProperty(
			"--session-turn-table-pane-width",
			`${nextValue}px`,
		);
	}, []);

	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col">
			<SessionOverviewSummaryStrip options={options} viewModel={viewModel} />
			<SessionThreadOverviewViewportStrip
				onSelect={onSelect}
				options={options}
				selection={selection}
				store={continuousTurnViewportStore}
			/>
			<div
				ref={layoutRef}
				className="grid min-h-0 min-w-0 flex-1 grid-cols-[var(--session-turn-table-pane-width)_2px_minmax(0,1fr)]"
				style={turnTableGridStyle}
			>
				<section
					ref={turnTableSectionRef}
					aria-label="Turn table"
					className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-(--session-overview-surface)"
				>
					<SessionTurnTablePane
						model={viewModel.safeModelUsed}
						onSelect={onSelect}
						options={options}
						selection={selection}
						userImageUrl={userImageUrl}
						userLabel={viewModel.safeUserDisplayName}
						viewportStore={continuousTurnViewportStore}
						virtualizerRef={turnTableVirtualizerRef}
					/>
					{turnTableFooter}
				</section>
				<HorizontalResizeHandle
					ariaLabel="Resize turn table panel"
					className="border-l border-(--session-overview-border)"
					defaultValue={DEFAULT_TURN_TABLE_PANE_WIDTH_PX}
					maximum={turnTablePaneMaximum}
					minimum={MINIMUM_TURN_TABLE_PANE_WIDTH_PX}
					onValueChange={setStoredTurnTablePaneWidth}
					onValuePreview={previewTurnTablePaneWidth}
					value={turnTablePaneWidth}
				/>
				{responsePane?.({
					onContinuousTurnViewportChange: handleContinuousTurnViewportChange,
				}) ?? (
					<SessionTurnResponsePane
						bottomPaddingClassName={bottomPaddingClassName}
						detailLevel={detailLevel}
						onContinuousTurnFocus={onContinuousTurnFocus}
						onContinuousTurnViewportChange={handleContinuousTurnViewportChange}
						onDetailLevelChange={handleDetailLevelChange}
						options={options}
						responseScrollRef={responseScrollRef}
						selection={selection}
						title="Session Detail"
						traceCallDisplayMode={detailLevel}
						userImageUrl={userImageUrl}
						viewModel={viewModel}
					/>
				)}
			</div>
		</div>
	);
}
