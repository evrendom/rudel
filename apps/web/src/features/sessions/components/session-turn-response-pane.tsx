import type { RefObject } from "react";
import type { TraceCallDisplayMode } from "@/components/conversation/ConversationTrace";
import "./session-constellation-tree.css";
import { SessionContinuousTurnThread } from "./session-continuous-turn-thread";
import type { SessionDetailLevel } from "./session-detail-level";
import { SessionDetailLevelToggle } from "./session-detail-level-toggle";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";
import type { SessionTurnSelection } from "./session-turn-table-selection";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

export function SessionTurnResponsePane({
	bottomPaddingClassName,
	detailLevel,
	onContinuousTurnFocus,
	onContinuousTurnViewportChange,
	onDetailLevelChange,
	options,
	responseScrollRef,
	selection,
	title,
	traceCallDisplayMode,
	userImageUrl,
	viewModel,
}: {
	bottomPaddingClassName: string;
	detailLevel: SessionDetailLevel;
	onContinuousTurnFocus: (index: number) => void;
	onContinuousTurnViewportChange: (
		activeIndex: number,
		visibleRange: readonly [number, number],
	) => void;
	onDetailLevelChange: (level: SessionDetailLevel) => void;
	options: readonly SessionTurnTablePaneOption[];
	responseScrollRef: RefObject<HTMLDivElement | null>;
	selection: SessionTurnSelection;
	title: string;
	traceCallDisplayMode: TraceCallDisplayMode;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col">
			<header className="flex min-h-12 shrink-0 items-center gap-3 border-b border-(--session-overview-border) bg-(--session-overview-surface) px-3">
				<h2 className="min-w-0 truncate text-base font-medium tracking-[-0.01em] text-(--session-overview-text) sm:text-sm">
					{title}
				</h2>
				<SessionDetailLevelToggle
					onChange={onDetailLevelChange}
					value={detailLevel}
				/>
			</header>
			<section
				ref={responseScrollRef}
				data-conversation-trace-scroll-container
				data-session-trace-presentation="constellation-tree-branch-dots-no-horizontal"
				aria-label="Conversation thread"
				className={`session-constellation-tree h-full min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain bg-(--session-overview-surface) ${bottomPaddingClassName}`}
			>
				<SessionContinuousTurnThread
					onActiveIndexChange={onContinuousTurnFocus}
					onViewportChange={onContinuousTurnViewportChange}
					options={options}
					scrollContainerRef={responseScrollRef}
					selection={selection}
					traceCallDisplayMode={traceCallDisplayMode}
					userImageUrl={userImageUrl}
					viewModel={viewModel}
				/>
			</section>
		</div>
	);
}
