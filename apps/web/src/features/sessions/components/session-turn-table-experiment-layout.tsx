import {
	type CSSProperties,
	type RefObject,
	useCallback,
	useId,
	useRef,
	useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { resolveTraceCallVariant } from "@/components/conversation/conversation-trace-call-display";
import {
	clampPaneSize,
	HorizontalResizeHandle,
	useElementWidth,
	useStoredPaneSize,
} from "@/components/ui/horizontal-resize-handle";
import { cn } from "@/lib/utils";
import { SessionAdalineSessionStrip } from "./session-adaline-session-strip";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import type {
	SelectedTurnOption,
	SessionThreadTransitionDirection,
} from "./session-selected-turn";
import { SessionThreadOverviewStrip } from "./session-thread-overview-strip";
import { SessionThreadOverviewStripV2 } from "./session-thread-overview-strip-v2";
import { SessionTurnResponsePane } from "./session-turn-response-pane";
import { getInitialSessionTurnTableVisibility } from "./session-turn-table-layout-state";
import { SessionTurnTablePane } from "./session-turn-table-pane";
import { SessionTurnTableVisibilityButton } from "./session-turn-table-visibility-button";

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

type SessionTurnTableExperimentLayoutProps = {
	activeIndex: number;
	bottomPaddingClassName: string;
	collapsible: boolean;
	followingOption: SelectedTurnOption | undefined;
	nextOption: SelectedTurnOption | undefined;
	onContinuousTurnFocus: (index: number) => void;
	onSelect: (index: number) => void;
	options: readonly SelectedTurnOption[];
	responseScrollRef: RefObject<HTMLDivElement | null>;
	responseTraceLayout: "table-row" | "trace-tree";
	selectedOption: SelectedTurnOption | undefined;
	showThreadOverviewStrip: boolean;
	showTurnMetadataTags: boolean;
	thread: boolean;
	transitionDirection: SessionThreadTransitionDirection;
	turnTableSectionRef: RefObject<HTMLElement | null>;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
};

export function SessionTurnTableExperimentLayout({
	activeIndex,
	bottomPaddingClassName,
	collapsible,
	followingOption,
	nextOption,
	onContinuousTurnFocus,
	onSelect,
	options,
	responseScrollRef,
	responseTraceLayout,
	selectedOption,
	showThreadOverviewStrip,
	showTurnMetadataTags,
	thread,
	transitionDirection,
	turnTableSectionRef,
	userImageUrl,
	viewModel,
}: SessionTurnTableExperimentLayoutProps) {
	const turnTableId = useId();
	// ?map=output previews the output-focused strip variant on the real
	// session screen; the default stays the classic strip.
	const [searchParams] = useSearchParams();
	const outputFocusMap = searchParams.get("map") === "output";
	const traceCallVariant = resolveTraceCallVariant(searchParams.get("calls"));
	const layoutRef = useRef<HTMLDivElement>(null);
	const layoutWidth = useElementWidth(layoutRef);
	const [storedTurnTablePaneWidth, setStoredTurnTablePaneWidth] =
		useStoredPaneSize(
			TURN_TABLE_PANE_STORAGE_KEY,
			DEFAULT_TURN_TABLE_PANE_WIDTH_PX,
		);
	const [turnTableVisibility, setTurnTableVisibility] = useState(() =>
		getInitialSessionTurnTableVisibility(collapsible),
	);
	const [visibleTurnRange, setVisibleTurnRange] = useState<
		readonly [number, number] | undefined
	>();
	const handleContinuousTurnViewportChange = useCallback(
		(_activeIndex: number, visibleRange: readonly [number, number]) => {
			setVisibleTurnRange(visibleRange);
		},
		[],
	);
	const tableCollapsed = turnTableVisibility === "collapsed";
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
	const responsePane = (
		<SessionTurnResponsePane
			activeIndex={activeIndex}
			bottomPaddingClassName={bottomPaddingClassName}
			followingOption={followingOption}
			nextOption={nextOption}
			onContinuousTurnFocus={onContinuousTurnFocus}
			onContinuousTurnViewportChange={handleContinuousTurnViewportChange}
			options={options}
			responseScrollRef={responseScrollRef}
			responseTraceLayout={responseTraceLayout}
			selectedOption={selectedOption}
			showTurnMetadataTags={showTurnMetadataTags}
			traceCallVariant={traceCallVariant}
			transitionDirection={transitionDirection}
			userImageUrl={userImageUrl}
			variant={thread ? "thread" : "table"}
			viewModel={viewModel}
		/>
	);

	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col">
			{showThreadOverviewStrip ? (
				<SessionAdalineSessionStrip
					hideTopBorder
					options={options}
					viewModel={viewModel}
				/>
			) : null}
			{showThreadOverviewStrip ? (
				outputFocusMap ? (
					<SessionThreadOverviewStripV2
						onSelect={onSelect}
						options={options}
						selectedIndex={activeIndex}
						visibleRange={visibleTurnRange}
					/>
				) : (
					<SessionThreadOverviewStrip
						onSelect={onSelect}
						options={options}
						selectedIndex={activeIndex}
						subagents={viewModel.safeSubagents}
						visibleRange={visibleTurnRange}
					/>
				)
			) : null}
			<div
				ref={layoutRef}
				className={cn(
					"grid min-h-0 min-w-0 flex-1",
					collapsible &&
						"transition-[grid-template-columns] duration-300 ease-out motion-reduce:transition-none",
					tableCollapsed
						? "grid-cols-[0_0_minmax(0,1fr)]"
						: "grid-cols-[var(--session-turn-table-pane-width)_2px_minmax(0,1fr)]",
				)}
				style={turnTableGridStyle}
			>
				<section
					ref={turnTableSectionRef}
					id={turnTableId}
					aria-hidden={tableCollapsed || undefined}
					aria-label="Turn table"
					inert={tableCollapsed}
					className={cn(
						"flex min-h-0 min-w-0 flex-col overflow-hidden bg-(--session-overview-surface)",
					)}
				>
					<SessionTurnTablePane
						collapseControlsId={collapsible ? turnTableId : undefined}
						model={viewModel.safeModelUsed}
						onCollapse={
							collapsible
								? () => setTurnTableVisibility("collapsed")
								: undefined
						}
						onSelect={onSelect}
						options={options}
						selectedIndex={activeIndex}
						showMessageRows={false}
						userImageUrl={userImageUrl}
						userLabel={viewModel.safeUserDisplayName}
					/>
				</section>
				<HorizontalResizeHandle
					ariaLabel="Resize turn table panel"
					className={cn(tableCollapsed && "invisible pointer-events-none")}
					defaultValue={DEFAULT_TURN_TABLE_PANE_WIDTH_PX}
					maximum={turnTablePaneMaximum}
					minimum={MINIMUM_TURN_TABLE_PANE_WIDTH_PX}
					onValueChange={setStoredTurnTablePaneWidth}
					onValuePreview={previewTurnTablePaneWidth}
					value={turnTablePaneWidth}
				/>

				{collapsible ? (
					<div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
						<div
							aria-hidden={!tableCollapsed}
							inert={!tableCollapsed}
							className={cn(
								"shrink-0 overflow-hidden bg-(--session-overview-surface) transition-[height] duration-300 ease-out motion-reduce:transition-none",
								tableCollapsed
									? "h-10 border-b border-(--session-overview-border)"
									: "h-0",
							)}
						>
							<TurnTableRevealButton
								controlsId={turnTableId}
								onReveal={() => setTurnTableVisibility("expanded")}
							/>
						</div>
						<div className="min-h-0 min-w-0 flex-1">{responsePane}</div>
					</div>
				) : (
					responsePane
				)}
			</div>
		</div>
	);
}

function TurnTableRevealButton({
	controlsId,
	onReveal,
}: {
	controlsId: string;
	onReveal: () => void;
}) {
	return (
		<div className="flex h-10 items-center px-2">
			<SessionTurnTableVisibilityButton
				controlsId={controlsId}
				expanded={false}
				onClick={onReveal}
			/>
		</div>
	);
}
