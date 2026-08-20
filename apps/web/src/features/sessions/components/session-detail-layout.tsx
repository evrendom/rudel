import {
	type CSSProperties,
	type ReactNode,
	type Ref,
	type RefObject,
	useCallback,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import {
	HorizontalResizeHandle,
	useElementWidth,
	useStoredPaneSize,
} from "@/components/ui/horizontal-resize-handle";
import { clampPaneSize } from "@/components/ui/horizontal-resize-utils";
import { formatRoundedDuration } from "@/lib/format";
import {
	createSessionContinuousTurnViewportStore,
	type SessionContinuousTurnViewportStore,
	useSessionContinuousTurnActiveSelection,
	useSessionContinuousTurnVisibleRange,
} from "./session-continuous-turn-viewport-store";
import {
	DEFAULT_SESSION_TRANSCRIPT_PANE_WIDTH_PX,
	DEFAULT_SESSION_TURN_TABLE_PANE_WIDTH_PX,
	MAXIMUM_SESSION_TURN_TABLE_PANE_WIDTH_PX,
	MINIMUM_SESSION_TRANSCRIPT_PANE_WIDTH_PX,
	MINIMUM_SESSION_TURN_TABLE_PANE_WIDTH_PX,
	SESSION_DETAIL_RESIZE_HANDLE_WIDTH_PX,
} from "./session-detail-pane-sizing";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import { SessionThreadOverviewStrip } from "./session-thread-overview-strip";
import type { SessionTurnTableVirtualizerHandle } from "./session-turn-table";
import {
	SessionTurnTablePane,
	type SessionTurnTablePaneOption,
} from "./session-turn-table-pane";
import type { SessionTurnSelection } from "./session-turn-table-selection";
import { useStableTranscriptWidthDuringWorkspaceResize } from "./session-workspace-resize-behavior";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

const TURN_TABLE_PANE_STORAGE_KEY = "rudel:session-turn-table-pane-width:v2";

type TurnTableGridStyle = CSSProperties & {
	"--session-turn-table-pane-width": string;
};

type SessionDetailResponsePaneRenderProps = {
	onMinimumWidthChange: (width: number) => void;
	viewportStore: SessionContinuousTurnViewportStore;
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
	const activeSelection = useSessionContinuousTurnActiveSelection(store);
	const visibleRange = useSessionContinuousTurnVisibleRange(store);
	const effectiveSelection = activeSelection ?? selection;

	return (
		<SessionThreadOverviewStrip
			onSelect={(index) => onSelect({ ...effectiveSelection, index })}
			options={options}
			selectedIndex={effectiveSelection.index}
			visibleRange={visibleRange}
		/>
	);
}

type SessionDetailLayoutProps = {
	onPrefetchTurn?: (turnId: string, immediate: boolean) => void;
	onSelect: (selection: SessionTurnSelection) => void;
	options: readonly SessionTurnTablePaneOption[];
	responsePane: (props: SessionDetailResponsePaneRenderProps) => ReactNode;
	selection: SessionTurnSelection;
	turnTableSectionRef: RefObject<HTMLElement | null>;
	turnTableVirtualizerRef?: Ref<SessionTurnTableVirtualizerHandle>;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
};

export function SessionDetailLayout({
	onPrefetchTurn,
	onSelect,
	options,
	responsePane,
	selection,
	turnTableSectionRef,
	turnTableVirtualizerRef,
	userImageUrl,
	viewModel,
}: SessionDetailLayoutProps) {
	const layoutRef = useRef<HTMLDivElement>(null);
	const layoutWidth = useElementWidth(layoutRef);
	const [storedTurnTablePaneWidth, setStoredTurnTablePaneWidth] =
		useStoredPaneSize(
			TURN_TABLE_PANE_STORAGE_KEY,
			DEFAULT_SESSION_TURN_TABLE_PANE_WIDTH_PX,
		);
	const [continuousTurnViewportStore] = useState(
		createSessionContinuousTurnViewportStore,
	);
	const [minimumTranscriptPaneWidth, setMinimumTranscriptPaneWidth] = useState(
		DEFAULT_SESSION_TRANSCRIPT_PANE_WIDTH_PX,
	);
	const updateMinimumTranscriptPaneWidth = useCallback((width: number) => {
		const nextWidth = Math.max(
			MINIMUM_SESSION_TRANSCRIPT_PANE_WIDTH_PX,
			Math.ceil(width),
		);
		setMinimumTranscriptPaneWidth((currentWidth) =>
			currentWidth === nextWidth ? currentWidth : nextWidth,
		);
	}, []);
	const [isResponsePaneEdgeShadowVisible, setIsResponsePaneEdgeShadowVisible] =
		useState(false);
	const updateResponsePaneEdgeShadow = useCallback(() => {
		const scrollElement = layoutRef.current?.querySelector<HTMLElement>(
			"[data-session-turn-table-scroll]",
		);
		if (!scrollElement) {
			setIsResponsePaneEdgeShadowVisible(false);
			return;
		}

		setIsResponsePaneEdgeShadowVisible(
			scrollElement.scrollWidth -
				scrollElement.clientWidth -
				scrollElement.scrollLeft >
				1,
		);
	}, []);
	useLayoutEffect(() => {
		const scrollElement = layoutRef.current?.querySelector<HTMLElement>(
			"[data-session-turn-table-scroll]",
		);
		if (!scrollElement) {
			return;
		}

		updateResponsePaneEdgeShadow();
		scrollElement.addEventListener("scroll", updateResponsePaneEdgeShadow, {
			passive: true,
		});
		if (typeof ResizeObserver !== "function") {
			window.addEventListener("resize", updateResponsePaneEdgeShadow);
			return () => {
				scrollElement.removeEventListener(
					"scroll",
					updateResponsePaneEdgeShadow,
				);
				window.removeEventListener("resize", updateResponsePaneEdgeShadow);
			};
		}

		const resizeObserver = new ResizeObserver(updateResponsePaneEdgeShadow);
		resizeObserver.observe(scrollElement);
		return () => {
			scrollElement.removeEventListener("scroll", updateResponsePaneEdgeShadow);
			resizeObserver.disconnect();
		};
	}, [updateResponsePaneEdgeShadow]);
	const handleSelection = useCallback(
		(nextSelection: SessionTurnSelection) => {
			continuousTurnViewportStore.publishSelection(nextSelection);
			onSelect(nextSelection);
		},
		[continuousTurnViewportStore, onSelect],
	);
	useLayoutEffect(() => {
		continuousTurnViewportStore.publishSelection(selection);
	}, [continuousTurnViewportStore, selection]);
	const turnTablePaneMaximum =
		layoutWidth > 0
			? Math.min(
					MAXIMUM_SESSION_TURN_TABLE_PANE_WIDTH_PX,
					layoutWidth -
						minimumTranscriptPaneWidth -
						SESSION_DETAIL_RESIZE_HANDLE_WIDTH_PX,
				)
			: MAXIMUM_SESSION_TURN_TABLE_PANE_WIDTH_PX;
	const turnTablePaneWidth = clampPaneSize(
		storedTurnTablePaneWidth,
		MINIMUM_SESSION_TURN_TABLE_PANE_WIDTH_PX,
		turnTablePaneMaximum,
	);
	useStableTranscriptWidthDuringWorkspaceResize({
		layoutRef,
		onTurnTableWidthChange: setStoredTurnTablePaneWidth,
		turnTablePaneWidth,
	});
	const turnTableGridStyle: TurnTableGridStyle = {
		"--session-turn-table-pane-width": `${turnTablePaneWidth}px`,
	};
	const previewTurnTablePaneWidth = useCallback(
		(nextValue: number) => {
			layoutRef.current?.style.setProperty(
				"--session-turn-table-pane-width",
				`${nextValue}px`,
			);
			updateResponsePaneEdgeShadow();
		},
		[updateResponsePaneEdgeShadow],
	);

	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col">
			<SessionThreadOverviewViewportStrip
				onSelect={handleSelection}
				options={options}
				selection={selection}
				store={continuousTurnViewportStore}
			/>
			<div
				ref={layoutRef}
				className="grid min-h-0 min-w-0 flex-1 grid-cols-[var(--session-turn-table-pane-width)_2px_minmax(0,1fr)] data-[workspace-resizing=true]:grid-cols-[minmax(0,1fr)_2px_var(--session-transcript-pane-width)]"
				style={turnTableGridStyle}
			>
				<section
					ref={turnTableSectionRef}
					aria-label="Turn table"
					className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-(--session-turn-table-surface) [--session-turn-table-surface:var(--session-overview-surface)]"
				>
					<SessionTurnTablePane
						model={viewModel.safeModelUsed}
						onPrefetchTurn={onPrefetchTurn}
						onSelect={handleSelection}
						options={options}
						selection={selection}
						sessionDurationLabel={formatRoundedDuration(
							viewModel.safeDurationMin,
						)}
						userImageUrl={userImageUrl}
						userLabel={viewModel.safeUserDisplayName}
						viewportStore={continuousTurnViewportStore}
						virtualizerRef={turnTableVirtualizerRef}
					/>
				</section>
				<HorizontalResizeHandle
					ariaLabel="Resize turn table panel"
					className="border-t-[0.5px] border-l border-(--session-overview-border) after:absolute after:inset-x-0 after:top-[calc(2.75rem-0.5px)] after:h-[0.5px] after:bg-(--session-overview-border) after:content-['']"
					defaultValue={DEFAULT_SESSION_TURN_TABLE_PANE_WIDTH_PX}
					maximum={turnTablePaneMaximum}
					minimum={MINIMUM_SESSION_TURN_TABLE_PANE_WIDTH_PX}
					onValueChange={setStoredTurnTablePaneWidth}
					onValuePreview={previewTurnTablePaneWidth}
					value={turnTablePaneWidth}
				/>
				<div
					className="relative min-h-0 min-w-0"
					data-slot="session-detail-response-pane"
				>
					<div
						aria-hidden="true"
						className="pointer-events-none absolute inset-y-0 left-0 z-50 w-0"
					>
						<div
							className="absolute -top-px right-0 bottom-0 w-px opacity-0 transition-opacity duration-200 [background:none] [box-shadow:-6px_0px_16px_4px_rgba(0,0,0,0.12)] [clip-path:inset(0_0_0_-38px)] [transition-timing-function:ease] data-[visible=true]:opacity-100"
							data-slot="session-detail-response-pane-edge-shadow"
							data-visible={isResponsePaneEdgeShadowVisible ? "true" : "false"}
						/>
					</div>
					{responsePane({
						onMinimumWidthChange: updateMinimumTranscriptPaneWidth,
						viewportStore: continuousTurnViewportStore,
					})}
				</div>
			</div>
		</div>
	);
}
