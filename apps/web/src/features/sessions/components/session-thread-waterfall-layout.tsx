import { type RefObject, useState } from "react";
import { SessionAdalineSessionStrip } from "./session-adaline-session-strip";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import { SessionLedgerWaterfallPane } from "./session-ledger-waterfall-pane";
import type { SelectedTurnOption } from "./session-selected-turn";
import { SessionTurnResponsePane } from "./session-turn-response-pane";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

export function SessionThreadWaterfallLayout({
	activeIndex,
	bottomPaddingClassName,
	onContinuousTurnFocus,
	onSelect,
	options,
	responseScrollRef,
	turnTableSectionRef,
	userImageUrl,
	viewModel,
}: {
	activeIndex: number;
	bottomPaddingClassName: string;
	onContinuousTurnFocus: (index: number) => void;
	onSelect: (index: number) => void;
	options: readonly SelectedTurnOption[];
	responseScrollRef: RefObject<HTMLDivElement | null>;
	turnTableSectionRef: RefObject<HTMLElement | null>;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	const [visibleTurnRange, setVisibleTurnRange] = useState<
		readonly [number, number]
	>([activeIndex, activeIndex]);

	return (
		<div className="isolate flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-(--session-overview-surface) antialiased [--session-overview-accent:#266df0] [--session-overview-border:#eeeff1] [--session-overview-hover:#f6f7f7] [--session-overview-muted:rgba(0,0,0,0.63)] [--session-overview-subtle:rgba(0,0,0,0.5)] [--session-overview-surface:#fff] [--session-overview-text:#101112] [font-family:Inter,sans-serif] dark:[--session-overview-border:rgba(255,255,255,0.08)] dark:[--session-overview-hover:rgba(255,255,255,0.05)] dark:[--session-overview-muted:rgba(255,255,255,0.65)] dark:[--session-overview-subtle:rgba(255,255,255,0.5)] dark:[--session-overview-surface:#111827] dark:[--session-overview-text:#f8fafc]">
			<SessionAdalineSessionStrip
				hideTopBorder
				options={options}
				viewModel={viewModel}
			/>

			<div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(30rem,36rem)_minmax(24rem,1fr)] overflow-hidden">
				<section
					ref={turnTableSectionRef}
					aria-label="Session ledger"
					className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-(--session-overview-border) bg-(--session-overview-surface)"
				>
					<SessionLedgerWaterfallPane
						model={viewModel.safeModelUsed}
						onSelect={onSelect}
						options={options}
						selectedIndex={activeIndex}
						userImageUrl={userImageUrl}
						userLabel={viewModel.safeUserDisplayName}
						visibleTurnRange={visibleTurnRange}
					/>
				</section>

				<SessionTurnResponsePane
					activeIndex={activeIndex}
					bottomPaddingClassName={bottomPaddingClassName}
					followingOption={undefined}
					nextOption={undefined}
					onContinuousTurnFocus={onContinuousTurnFocus}
					onContinuousTurnViewportChange={(
						_viewportActiveIndex,
						visibleRange,
					) => setVisibleTurnRange(visibleRange)}
					options={options}
					responseScrollRef={responseScrollRef}
					selectedOption={options[activeIndex]}
					showTurnMetadataTags
					transitionDirection={0}
					userImageUrl={userImageUrl}
					variant="thread"
					viewModel={viewModel}
				/>
			</div>
		</div>
	);
}
