import { memo, type RefObject, useRef } from "react";
import { useLatestValueRef } from "@/app/hooks/useLatestValueRef";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import {
	ConversationTraceTreeConnectorStyleProvider,
	type TraceCallDisplayMode,
} from "@/components/conversation/ConversationTrace";
import { getContinuousTurnViewport } from "./session-continuous-turn-focus";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import { SessionMemberRow } from "./session-member-row";
import { SessionTurnResponseTrace } from "./session-turn-response-trace";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";
import type { SessionTurnSelection } from "./session-turn-table-selection";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

const ACTIVE_TURN_MAX_FOCUS_OFFSET_PX = 160;
const ACTIVE_TURN_FOCUS_RATIO = 0.3;

export function SessionContinuousTurnThread({
	onActiveIndexChange,
	onViewportChange,
	options,
	scrollContainerRef,
	selection,
	traceCallDisplayMode = "normal",
	userImageUrl,
	viewModel,
}: {
	onActiveIndexChange: (index: number) => void;
	onViewportChange: (
		activeIndex: number,
		visibleRange: readonly [number, number],
	) => void;
	options: readonly SessionTurnTablePaneOption[];
	scrollContainerRef: RefObject<HTMLDivElement | null>;
	selection: SessionTurnSelection;
	traceCallDisplayMode?: TraceCallDisplayMode;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	const threadElementRef = useRef<HTMLDivElement>(null);
	const lastViewportRef = useRef("");
	const viewportStateRef = useLatestValueRef({
		onActiveIndexChange,
		onViewportChange,
		selectionIndex: selection.index,
	});
	const syncViewport = (syncActiveIndex: boolean) => {
		const scrollContainer = scrollContainerRef.current;
		const threadElement = threadElementRef.current;
		if (!scrollContainer || !threadElement) {
			return;
		}

		const turnElements = threadElement.querySelectorAll<HTMLElement>(
			"[data-continuous-turn-index]",
		);
		if (turnElements.length === 0) {
			return;
		}

		const containerBounds = scrollContainer.getBoundingClientRect();
		const focusOffset = Math.min(
			scrollContainer.clientHeight * ACTIVE_TURN_FOCUS_RATIO,
			ACTIVE_TURN_MAX_FOCUS_OFFSET_PX,
		);
		const sectionTops = Array.from(
			turnElements,
			(element) => element.getBoundingClientRect().top,
		);
		const sectionIndices = Array.from(turnElements, (element) =>
			Number(element.dataset.continuousTurnIndex),
		);
		const viewport = getContinuousTurnViewport({
			focusLine: containerBounds.top + focusOffset,
			isAtScrollEnd:
				scrollContainer.scrollHeight -
					scrollContainer.clientHeight -
					scrollContainer.scrollTop <=
				2,
			isAtScrollStart: scrollContainer.scrollTop <= 2,
			sectionIndices,
			sectionTops,
			viewportBottom: containerBounds.bottom,
			viewportTop: containerBounds.top,
		});

		const viewportState = viewportStateRef.current;
		if (
			syncActiveIndex &&
			viewport.activeIndex !== viewportState.selectionIndex
		) {
			viewportState.onActiveIndexChange(viewport.activeIndex);
		}
		const viewportKey = `${viewport.visibleRange[0]}:${viewport.visibleRange[1]}`;
		if (viewportKey !== lastViewportRef.current) {
			lastViewportRef.current = viewportKey;
			viewportState.onViewportChange(
				viewport.activeIndex,
				viewport.visibleRange,
			);
		}
	};

	useMountEffect(() => {
		const scrollContainer = scrollContainerRef.current;
		const threadElement = threadElementRef.current;
		if (!scrollContainer || !threadElement) {
			return;
		}

		let animationFrame: number | undefined;
		let lastScrollTop = scrollContainer.scrollTop;
		let shouldSyncActiveIndex = false;
		const runScheduledSync = () => {
			animationFrame = undefined;
			const syncActiveIndexForFrame = shouldSyncActiveIndex;
			shouldSyncActiveIndex = false;
			syncViewport(syncActiveIndexForFrame);
		};
		const scheduleSync = (syncActiveIndex = false) => {
			shouldSyncActiveIndex ||= syncActiveIndex;
			if (animationFrame !== undefined) {
				return;
			}

			animationFrame = window.requestAnimationFrame(runScheduledSync);
		};
		const scheduleScrollSync = () => {
			const nextScrollTop = scrollContainer.scrollTop;
			const scrollPositionChanged = nextScrollTop !== lastScrollTop;
			lastScrollTop = nextScrollTop;
			scheduleSync(scrollPositionChanged);
		};

		scrollContainer.addEventListener("scroll", scheduleScrollSync, {
			passive: true,
		});
		const resizeObserver =
			typeof ResizeObserver === "function"
				? new ResizeObserver(() => scheduleSync())
				: undefined;
		resizeObserver?.observe(scrollContainer);
		resizeObserver?.observe(threadElement);
		scheduleSync(true);

		return () => {
			scrollContainer.removeEventListener("scroll", scheduleScrollSync);
			resizeObserver?.disconnect();
			if (animationFrame !== undefined) {
				window.cancelAnimationFrame(animationFrame);
			}
		};
	});

	if (options.length === 0) {
		return (
			<div className="flex min-h-60 items-center justify-center border-b border-(--session-overview-border) p-8 text-center text-sm text-(--session-overview-muted)">
				No conversation data available
			</div>
		);
	}
	const firstMemberIndex = options.findIndex(
		(option) =>
			option.turn?.userItems.some((item) => item.kind === "user") ??
			option.memberPreview !== "No member message",
	);

	return (
		<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots-no-horizontal">
			<div ref={threadElementRef} className="min-w-0">
				{options.map((option, index) => (
					<ContinuousTurnSection
						key={option.key}
						activeSpeaker={
							index === selection.index ? selection.speaker : undefined
						}
						continuesThread={index < options.length - 1}
						index={index}
						option={option}
						startsTrace={index === firstMemberIndex}
						traceCallDisplayMode={traceCallDisplayMode}
						userImageUrl={userImageUrl}
						viewModel={viewModel}
					/>
				))}
			</div>
		</ConversationTraceTreeConnectorStyleProvider>
	);
}

const ContinuousTurnSection = memo(function ContinuousTurnSection({
	activeSpeaker,
	continuesThread,
	index,
	option,
	startsTrace,
	traceCallDisplayMode,
	userImageUrl,
	viewModel,
}: {
	activeSpeaker: SessionTurnSelection["speaker"] | undefined;
	continuesThread: boolean;
	index: number;
	option: SessionTurnTablePaneOption;
	startsTrace: boolean;
	traceCallDisplayMode: TraceCallDisplayMode;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	const active = activeSpeaker !== undefined;
	const turn = option.turn;
	const hasMemberMessage = turn?.userItems.length
		? true
		: option.memberPreview !== "No member message";
	const sectionLabel =
		option.turnNumber === undefined
			? "Session start"
			: `Turn ${option.turnNumber}`;
	const activeModelPosition =
		activeSpeaker === "model"
			? index === 0
				? "first"
				: continuesThread
					? "middle"
					: "last"
			: undefined;

	return (
		<section
			aria-current={active ? "step" : undefined}
			aria-label={sectionLabel}
			className="scroll-mt-0"
			data-continuous-turn-index={index}
		>
			<div className="w-full min-w-0">
				{hasMemberMessage && turn ? (
					<SessionMemberRow
						active={activeSpeaker === "member"}
						headingId={`continuous-member-message-${index}`}
						items={turn.userItems}
						speakerLayout="trace-tree"
						startsTrace={startsTrace}
						userImageUrl={userImageUrl}
						userLabel={viewModel.safeUserDisplayName}
					/>
				) : null}
				<section
					aria-label={option.turnNumber === undefined ? "Preamble" : "Response"}
					className="min-w-0"
					data-active-rail-position={activeModelPosition}
					data-session-turn-speaker="model"
				>
					{turn ? (
						<SessionTurnResponseTrace
							agentSectionMode="expanded"
							continuesAfter={continuesThread}
							option={{ ...option, turn }}
							speakerLayout="trace-tree"
							traceCallDisplayMode={traceCallDisplayMode}
							userImageUrl={userImageUrl}
							viewModel={viewModel}
						/>
					) : (
						<p className="py-10 text-center text-sm text-(--session-overview-muted)">
							Turn body not loaded
						</p>
					)}
				</section>
			</div>
		</section>
	);
});
