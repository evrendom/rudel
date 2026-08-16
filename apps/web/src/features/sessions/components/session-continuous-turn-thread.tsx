import {
	memo,
	Profiler,
	type ProfilerOnRenderCallback,
	type RefObject,
	useRef,
} from "react";
import { useLatestValueRef } from "@/app/hooks/useLatestValueRef";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import {
	ConversationTraceTreeConnectorStyleProvider,
	type TraceCallDisplayMode,
} from "@/components/conversation/ConversationTrace";
import {
	getContinuousTurnViewport,
	getPrefetchedContinuousTurnIndices,
} from "./session-continuous-turn-focus";
import {
	type SessionContinuousTurnBodyState,
	SessionContinuousTurnSection,
} from "./session-continuous-turn-row";
import type { SessionContinuousTurnViewportStore } from "./session-continuous-turn-viewport-store";
import type { SessionDetailSkeletonDebugMode } from "./session-detail-skeleton-debug";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import { estimateSessionContinuousTurnSize } from "./session-detail-virtualization";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

const ACTIVE_TURN_MAX_FOCUS_OFFSET_PX = 160;
const ACTIVE_TURN_FOCUS_RATIO = 0.3;
const TURN_BODY_PREFETCH_RADIUS = 4;

export const SessionContinuousTurnThread = memo(
	function SessionContinuousTurnThread({
		bodyStates,
		debugMode = { kind: "off" },
		onRetryTurnBody,
		onTurnRender,
		onViewportRangeChange,
		options,
		scrollContainerRef,
		traceCallDisplayMode = "normal",
		userImageUrl,
		viewModel,
		viewportStore,
	}: {
		bodyStates?: ReadonlyMap<string, SessionContinuousTurnBodyState>;
		debugMode?: SessionDetailSkeletonDebugMode;
		onRetryTurnBody?: (index: number) => void;
		onTurnRender?: ProfilerOnRenderCallback;
		onViewportRangeChange?: (indices: readonly number[]) => void;
		options: readonly SessionTurnTablePaneOption[];
		scrollContainerRef: RefObject<HTMLDivElement | null>;
		traceCallDisplayMode?: TraceCallDisplayMode;
		userImageUrl: string | undefined;
		viewModel: SessionDetailViewModel;
		viewportStore: SessionContinuousTurnViewportStore;
	}) {
		const threadElementRef = useRef<HTMLDivElement>(null);
		const lastLoadRangeKeyRef = useRef("");
		const lastViewportKeyRef = useRef("");
		const viewportStateRef = useLatestValueRef({
			count: options.length,
			onViewportRangeChange,
		});

		useMountEffect(() => {
			const scrollContainer = scrollContainerRef.current;
			const threadElement = threadElementRef.current;
			if (!scrollContainer || !threadElement) {
				return;
			}

			let animationFrame: number | undefined;
			const syncViewport = () => {
				animationFrame = undefined;
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
				const viewportKey = `${viewport.activeIndex}:${viewport.visibleRange[0]}:${viewport.visibleRange[1]}`;
				if (viewportKey !== lastViewportKeyRef.current) {
					lastViewportKeyRef.current = viewportKey;
					viewportStore.publishViewport(
						viewport.activeIndex,
						viewport.visibleRange,
					);
				}

				const state = viewportStateRef.current;
				const loadIndices = getPrefetchedContinuousTurnIndices(
					viewport.visibleRange,
					state.count,
					TURN_BODY_PREFETCH_RADIUS,
				);
				const loadRangeKey = loadIndices.join(":");
				if (loadRangeKey !== lastLoadRangeKeyRef.current) {
					lastLoadRangeKeyRef.current = loadRangeKey;
					state.onViewportRangeChange?.(loadIndices);
				}
			};
			const scheduleViewportSync = () => {
				if (animationFrame !== undefined) {
					return;
				}
				animationFrame = window.requestAnimationFrame(syncViewport);
			};

			scrollContainer.addEventListener("scroll", scheduleViewportSync, {
				passive: true,
			});
			const resizeObserver =
				typeof ResizeObserver === "function"
					? new ResizeObserver(scheduleViewportSync)
					: undefined;
			resizeObserver?.observe(scrollContainer);
			resizeObserver?.observe(threadElement);
			scheduleViewportSync();

			return () => {
				scrollContainer.removeEventListener("scroll", scheduleViewportSync);
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
					{options.map((option, index) => {
						const section = (
							<SessionContinuousTurnSection
								key={option.key}
								bodyState={bodyStates?.get(option.key)}
								continuesThread={index < options.length - 1}
								debugMode={debugMode}
								estimatedSize={estimateSessionContinuousTurnSize(option)}
								index={index}
								onRetryTurnBody={onRetryTurnBody}
								option={option}
								startsTrace={index === firstMemberIndex}
								traceCallDisplayMode={traceCallDisplayMode}
								userImageUrl={userImageUrl}
								viewModel={viewModel}
								viewportStore={viewportStore}
							/>
						);
						return onTurnRender ? (
							<Profiler
								key={option.key}
								id={`${option.key}:full`}
								onRender={onTurnRender}
							>
								{section}
							</Profiler>
						) : (
							section
						);
					})}
				</div>
			</ConversationTraceTreeConnectorStyleProvider>
		);
	},
);
