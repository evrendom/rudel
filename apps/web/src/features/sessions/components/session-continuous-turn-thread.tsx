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
			let measurementsDirty = true;
			let sectionTops: number[] = [];
			let sectionIndices: number[] = [];

			// Section offsets are cached in scroll-content coordinates and only
			// re-read when geometry changes; scroll frames must stay free of
			// per-section layout reads.
			const measureSections = () => {
				measurementsDirty = false;
				const turnElements = threadElement.querySelectorAll<HTMLElement>(
					"[data-continuous-turn-index]",
				);
				const contentOrigin =
					scrollContainer.getBoundingClientRect().top -
					scrollContainer.scrollTop;
				sectionTops = Array.from(
					turnElements,
					(element) => element.getBoundingClientRect().top - contentOrigin,
				);
				sectionIndices = Array.from(turnElements, (element) =>
					Number(element.dataset.continuousTurnIndex),
				);
			};

			const syncViewport = () => {
				animationFrame = undefined;
				if (measurementsDirty) {
					measureSections();
				}
				if (sectionTops.length === 0) {
					return;
				}

				const scrollTop = scrollContainer.scrollTop;
				const clientHeight = scrollContainer.clientHeight;
				const focusOffset = Math.min(
					clientHeight * ACTIVE_TURN_FOCUS_RATIO,
					ACTIVE_TURN_MAX_FOCUS_OFFSET_PX,
				);
				const viewport = getContinuousTurnViewport({
					focusLine: scrollTop + focusOffset,
					isAtScrollEnd:
						scrollContainer.scrollHeight - clientHeight - scrollTop <= 2,
					isAtScrollStart: scrollTop <= 2,
					sectionIndices,
					sectionTops,
					viewportBottom: scrollTop + clientHeight,
					viewportTop: scrollTop,
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
			const invalidateMeasurements = () => {
				measurementsDirty = true;
				scheduleViewportSync();
			};

			scrollContainer.addEventListener("scroll", scheduleViewportSync, {
				passive: true,
			});
			const resizeObserver =
				typeof ResizeObserver === "function"
					? new ResizeObserver(invalidateMeasurements)
					: undefined;
			resizeObserver?.observe(scrollContainer);
			resizeObserver?.observe(threadElement);
			invalidateMeasurements();

			return () => {
				scrollContainer.removeEventListener("scroll", scheduleViewportSync);
				resizeObserver?.disconnect();
				if (animationFrame !== undefined) {
					window.cancelAnimationFrame(animationFrame);
				}
			};
		});

		const firstMemberIndex = options.findIndex(
			(option) =>
				option.turn?.userItems.some((item) => item.kind === "user") ??
				option.memberPreview !== "No member message",
		);

		// The empty state renders inside the same ref'd wrapper as the turns so
		// the mount-once viewport effect keeps its listeners on a live element
		// and picks sections up when they arrive.
		return (
			<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots-no-horizontal">
				<div ref={threadElementRef} className="min-w-0">
					{options.length === 0 ? (
						<div className="flex min-h-60 items-center justify-center border-b border-(--session-overview-border) p-8 text-center text-sm text-(--session-overview-muted)">
							No conversation data available
						</div>
					) : null}
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
