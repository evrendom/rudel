import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import {
	memo,
	Profiler,
	type ProfilerOnRenderCallback,
	type Ref,
	type RefObject,
	useCallback,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
} from "react";
import {
	ConversationTraceTreeConnectorStyleProvider,
	type TraceCallDisplayMode,
} from "@/components/conversation/ConversationTrace";
import {
	type SessionContinuousTurnBodyState,
	SessionContinuousTurnSection,
	SessionContinuousTurnShell,
} from "./session-continuous-turn-row";
import type { SessionContinuousTurnViewportStore } from "./session-continuous-turn-viewport-store";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import {
	estimateSessionContinuousTurnSize,
	getSessionVirtualViewport,
	measureSessionVirtualElement,
	SESSION_DETAIL_VIRTUAL_OVERSCAN,
	type SessionContinuousTurnVirtualizerHandle,
} from "./session-detail-virtualization";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

function positionMountedSessionVirtualRows(
	virtualizer: Virtualizer<HTMLDivElement, HTMLElement>,
	scrollContainer: HTMLDivElement | null,
) {
	if (!scrollContainer) {
		return;
	}
	const virtualItemsByIndex = new Map(
		virtualizer.getVirtualItems().map((item) => [item.index, item]),
	);
	const mountedRows = Array.from(
		scrollContainer.querySelectorAll<HTMLElement>(
			"[data-session-virtual-turn-index]",
		),
	)
		.map((element) => ({
			element,
			index: Number(element.dataset.sessionVirtualTurnIndex),
		}))
		.sort((left, right) => left.index - right.index);

	let segmentStart = 0;
	while (segmentStart < mountedRows.length) {
		let segmentEnd = segmentStart + 1;
		while (
			segmentEnd < mountedRows.length &&
			mountedRows[segmentEnd]?.index ===
				(mountedRows[segmentEnd - 1]?.index ?? -1) + 1
		) {
			segmentEnd += 1;
		}
		const segment = mountedRows.slice(segmentStart, segmentEnd);
		const anchorOffset = segment.findIndex((row) =>
			virtualItemsByIndex.has(row.index),
		);
		const anchor = segment[anchorOffset];
		const anchorItem = anchor
			? virtualItemsByIndex.get(anchor.index)
			: undefined;
		if (anchor && anchorItem) {
			const starts = new Map<number, number>([
				[anchorOffset, anchorItem.start],
			]);
			for (
				let offset = anchorOffset + 1;
				offset < segment.length;
				offset += 1
			) {
				const previous = segment[offset - 1];
				const previousStart = starts.get(offset - 1);
				if (previous && previousStart !== undefined) {
					starts.set(offset, previousStart + previous.element.offsetHeight);
				}
			}
			for (let offset = anchorOffset - 1; offset >= 0; offset -= 1) {
				const row = segment[offset];
				const nextStart = starts.get(offset + 1);
				if (row && nextStart !== undefined) {
					starts.set(offset, nextStart - row.element.offsetHeight);
				}
			}
			for (const [offset, start] of starts) {
				const row = segment[offset];
				if (row) {
					row.element.style.transform = `translateY(${start}px)`;
				}
			}
		}
		segmentStart = segmentEnd;
	}
}

export const SessionContinuousTurnThread = memo(
	function SessionContinuousTurnThread({
		bodyStates,
		onRenderedRangeChange,
		onRetryTurnBody,
		onTurnRender,
		options,
		scrollContainerRef,
		traceCallDisplayMode = "normal",
		userImageUrl,
		viewModel,
		viewportStore,
		virtualizerRef,
	}: {
		bodyStates?: ReadonlyMap<string, SessionContinuousTurnBodyState>;
		onRenderedRangeChange?: (indices: readonly number[]) => void;
		onRetryTurnBody?: (index: number) => void;
		onTurnRender?: ProfilerOnRenderCallback;
		options: readonly SessionTurnTablePaneOption[];
		scrollContainerRef: RefObject<HTMLDivElement | null>;
		traceCallDisplayMode?: TraceCallDisplayMode;
		userImageUrl: string | undefined;
		viewModel: SessionDetailViewModel;
		viewportStore: SessionContinuousTurnViewportStore;
		virtualizerRef?: Ref<SessionContinuousTurnVirtualizerHandle>;
	}) {
		const lastRenderedKeyRef = useRef("");
		const lastViewportKeyRef = useRef("");
		const fullTurnKeysRef = useRef(new Set<string>());
		const hasScrolledRef = useRef(false);
		const virtualizer = useVirtualizer<HTMLDivElement, HTMLElement>({
			count: options.length,
			estimateSize: (index) => {
				const option = options[index];
				return option ? estimateSessionContinuousTurnSize(option) : 240;
			},
			getItemKey: (index) => options[index]?.key ?? index,
			getScrollElement: () => scrollContainerRef.current,
			isScrollingResetDelay: 500,
			measureElement: measureSessionVirtualElement,
			onChange: (instance) => {
				if (instance.isScrolling) {
					hasScrolledRef.current = true;
				}
				const nextVirtualItems = instance.getVirtualItems();
				const nextRenderedIndices = nextVirtualItems.map((item) => item.index);
				const nextRenderedKey = nextRenderedIndices.join(":");
				if (nextRenderedKey !== lastRenderedKeyRef.current) {
					lastRenderedKeyRef.current = nextRenderedKey;
					onRenderedRangeChange?.(nextRenderedIndices);
				}
				const nextViewport = getSessionVirtualViewport({
					count: options.length,
					items: nextVirtualItems,
					scrollOffset: instance.scrollOffset ?? 0,
					viewportSize:
						scrollContainerRef.current?.clientHeight ??
						instance.scrollRect?.height ??
						0,
				});
				if (!nextViewport) {
					return;
				}
				const nextViewportKey = `${nextViewport.activeIndex}:${nextViewport.visibleRange[0]}:${nextViewport.visibleRange[1]}`;
				if (nextViewportKey !== lastViewportKeyRef.current) {
					lastViewportKeyRef.current = nextViewportKey;
					viewportStore.publishViewport(
						nextViewport.activeIndex,
						nextViewport.visibleRange,
					);
				}
			},
			overscan: SESSION_DETAIL_VIRTUAL_OVERSCAN,
		});
		const virtualItems = virtualizer.getVirtualItems();
		if (!virtualizer.isScrolling) {
			const viewportStart = virtualizer.scrollOffset ?? 0;
			const viewportEnd =
				viewportStart +
				(scrollContainerRef.current?.clientHeight ??
					virtualizer.scrollRect?.height ??
					0);
			for (const virtualItem of virtualItems) {
				if (
					!hasScrolledRef.current &&
					(virtualItem.end <= viewportStart || virtualItem.start >= viewportEnd)
				) {
					continue;
				}
				const option = options[virtualItem.index];
				if (option) {
					fullTurnKeysRef.current.add(option.key);
				}
			}
		}
		const measureMountedRows = useCallback(() => {
			const scrollContainer = scrollContainerRef.current;
			if (!scrollContainer) {
				return;
			}
			const elements = Array.from(
				scrollContainer.querySelectorAll<HTMLElement>(
					"[data-session-virtual-turn-index]",
				),
			);
			for (const element of elements) {
				const index = Number(element.dataset.sessionVirtualTurnIndex);
				virtualizer.resizeItem(index, measureSessionVirtualElement(element));
			}
			positionMountedSessionVirtualRows(virtualizer, scrollContainer);
		}, [scrollContainerRef, virtualizer]);
		const measurementVersion =
			options.length === 0
				? ""
				: `${traceCallDisplayMode}:${options
						.map(
							(option) =>
								`${option.key}:${option.turn ? "loaded" : (bodyStates?.get(option.key) ?? "idle")}`,
						)
						.join("|")}`;

		useLayoutEffect(() => {
			if (!measurementVersion) {
				return;
			}
			measureMountedRows();
		}, [measurementVersion, measureMountedRows]);

		useImperativeHandle(
			virtualizerRef,
			() => ({
				measure: () => virtualizer.measure(),
				scrollToIndex: (index, scrollOptions) => {
					virtualizer.scrollToIndex(index, {
						align: scrollOptions?.align ?? "auto",
						behavior: scrollOptions?.behavior,
					});
				},
			}),
			[virtualizer],
		);

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
				<div
					className="relative min-w-0"
					data-session-virtual-turn-container
					style={{ height: virtualizer.getTotalSize() }}
				>
					{virtualItems.map((virtualItem) => {
						const index = virtualItem.index;
						const option = options[index];
						if (!option) {
							return null;
						}
						const estimatedSize = estimateSessionContinuousTurnSize(option);
						const rendersFullTurn = fullTurnKeysRef.current.has(option.key);
						const section = rendersFullTurn ? (
							<SessionContinuousTurnSection
								bodyState={bodyStates?.get(option.key)}
								continuesThread={index < options.length - 1}
								estimatedSize={estimatedSize}
								index={index}
								onRetryTurnBody={onRetryTurnBody}
								option={option}
								startsTrace={index === firstMemberIndex}
								traceCallDisplayMode={traceCallDisplayMode}
								userImageUrl={userImageUrl}
								viewModel={viewModel}
								viewportStore={viewportStore}
							/>
						) : (
							<SessionContinuousTurnShell
								estimatedSize={Math.max(estimatedSize, virtualItem.size)}
								index={index}
								option={option}
								viewportStore={viewportStore}
							/>
						);
						const scheduleMeasurement = () => {
							window.requestAnimationFrame(measureMountedRows);
						};
						return (
							<div
								key={option.key}
								ref={virtualizer.measureElement}
								className="absolute top-0 left-0 w-full"
								data-index={index}
								data-session-virtual-turn-index={index}
								data-session-virtual-turn-render={
									rendersFullTurn ? "full" : "shell"
								}
								data-session-virtual-turn-size={virtualItem.size}
								style={{ transform: `translateY(${virtualItem.start}px)` }}
								onPointerUpCapture={scheduleMeasurement}
								onKeyUpCapture={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										scheduleMeasurement();
									}
								}}
								onTransitionEndCapture={scheduleMeasurement}
							>
								{onTurnRender ? (
									<Profiler
										id={`${option.key}:${rendersFullTurn ? "full" : "shell"}`}
										onRender={onTurnRender}
									>
										{section}
									</Profiler>
								) : (
									section
								)}
							</div>
						);
					})}
				</div>
			</ConversationTraceTreeConnectorStyleProvider>
		);
	},
);
