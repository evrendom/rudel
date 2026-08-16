import type { RefObject } from "react";
import type { TraceCallDisplayMode } from "@/components/conversation/ConversationTrace";
import "./session-constellation-tree.css";
import { SessionContinuousTurnThread } from "./session-continuous-turn-thread";
import type { SessionContinuousTurnViewportStore } from "./session-continuous-turn-viewport-store";
import type { SessionDetailLevel } from "./session-detail-level";
import { SessionDetailLevelToggle } from "./session-detail-level-toggle";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

export function SessionTurnResponsePane({
	bottomPaddingClassName,
	detailLevel,
	onDetailLevelChange,
	options,
	responseScrollRef,
	title,
	traceCallDisplayMode,
	userImageUrl,
	viewModel,
	viewportStore,
}: {
	bottomPaddingClassName: string;
	detailLevel: SessionDetailLevel;
	onDetailLevelChange: (level: SessionDetailLevel) => void;
	options: readonly SessionTurnTablePaneOption[];
	responseScrollRef: RefObject<HTMLDivElement | null>;
	title: string;
	traceCallDisplayMode: TraceCallDisplayMode;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
	viewportStore: SessionContinuousTurnViewportStore;
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
					options={options}
					scrollContainerRef={responseScrollRef}
					traceCallDisplayMode={traceCallDisplayMode}
					userImageUrl={userImageUrl}
					viewModel={viewModel}
					viewportStore={viewportStore}
				/>
			</section>
		</div>
	);
}
