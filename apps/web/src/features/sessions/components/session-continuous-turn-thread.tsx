import { useVirtualizer } from "@tanstack/react-virtual";
import {
	memo,
	type Ref,
	type RefObject,
	useImperativeHandle,
	useRef,
} from "react";
import { Button } from "@/app/ui/button";
import { Skeleton } from "@/app/ui/skeleton";
import {
	ConversationTraceTreeConnectorStyleProvider,
	type TraceCallDisplayMode,
} from "@/components/conversation/ConversationTrace";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import {
	estimateSessionContinuousTurnSize,
	getSessionVirtualViewport,
	SESSION_DETAIL_VIRTUAL_OVERSCAN,
	type SessionContinuousTurnVirtualizerHandle,
} from "./session-detail-virtualization";
import { SessionMemberRow } from "./session-member-row";
import { SessionTurnResponseTrace } from "./session-turn-response-trace";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";
import type { SessionTurnSelection } from "./session-turn-table-selection";

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

export type SessionContinuousTurnBodyState = "error" | "loading";

export function SessionContinuousTurnThread({
	onActiveIndexChange,
	bodyStates,
	onRenderedRangeChange,
	onRetryTurnBody,
	onViewportChange,
	options,
	scrollContainerRef,
	selection,
	traceCallDisplayMode = "normal",
	userImageUrl,
	viewModel,
	virtualizerRef,
}: {
	onActiveIndexChange: (index: number) => void;
	bodyStates?: ReadonlyMap<string, SessionContinuousTurnBodyState>;
	onRenderedRangeChange?: (indices: readonly number[]) => void;
	onRetryTurnBody?: (index: number) => void;
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
	virtualizerRef?: Ref<SessionContinuousTurnVirtualizerHandle>;
}) {
	const lastRenderedKeyRef = useRef("");
	const lastViewportKeyRef = useRef("");
	const virtualizer = useVirtualizer<HTMLDivElement, HTMLElement>({
		count: options.length,
		estimateSize: (index) => {
			const option = options[index];
			return option ? estimateSessionContinuousTurnSize(option) : 240;
		},
		getItemKey: (index) => options[index]?.key ?? index,
		getScrollElement: () => scrollContainerRef.current,
		onChange: (instance) => {
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
				if (
					instance.isScrolling &&
					nextViewport.activeIndex !== selection.index
				) {
					onActiveIndexChange(nextViewport.activeIndex);
				}
				onViewportChange(nextViewport.activeIndex, nextViewport.visibleRange);
			}
		},
		overscan: SESSION_DETAIL_VIRTUAL_OVERSCAN,
		useAnimationFrameWithResizeObserver: true,
	});
	const virtualItems = virtualizer.getVirtualItems();

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
				style={{ height: virtualizer.getTotalSize() }}
			>
				{virtualItems.map((virtualItem) => {
					const index = virtualItem.index;
					const option = options[index];
					if (!option) {
						return null;
					}
					const scheduleMeasurement = (element: HTMLElement) => {
						window.requestAnimationFrame(() =>
							virtualizer.measureElement(element),
						);
					};
					return (
						<div
							key={option.key}
							ref={virtualizer.measureElement}
							className="absolute top-0 left-0 w-full"
							data-index={index}
							style={{ transform: `translateY(${virtualItem.start}px)` }}
							onPointerUpCapture={(event) =>
								scheduleMeasurement(event.currentTarget)
							}
							onKeyUpCapture={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									scheduleMeasurement(event.currentTarget);
								}
							}}
							onTransitionEndCapture={(event) =>
								scheduleMeasurement(event.currentTarget)
							}
						>
							<ContinuousTurnSection
								activeSpeaker={
									index === selection.index ? selection.speaker : undefined
								}
								bodyState={bodyStates?.get(option.key)}
								continuesThread={index < options.length - 1}
								estimatedSize={estimateSessionContinuousTurnSize(option)}
								index={index}
								onRetry={
									onRetryTurnBody ? () => onRetryTurnBody(index) : undefined
								}
								option={option}
								startsTrace={index === firstMemberIndex}
								traceCallDisplayMode={traceCallDisplayMode}
								userImageUrl={userImageUrl}
								viewModel={viewModel}
							/>
						</div>
					);
				})}
			</div>
		</ConversationTraceTreeConnectorStyleProvider>
	);
}

const ContinuousTurnSection = memo(function ContinuousTurnSection({
	activeSpeaker,
	bodyState,
	continuesThread,
	estimatedSize,
	index,
	onRetry,
	option,
	startsTrace,
	traceCallDisplayMode,
	userImageUrl,
	viewModel,
}: {
	activeSpeaker: SessionTurnSelection["speaker"] | undefined;
	bodyState: SessionContinuousTurnBodyState | undefined;
	continuesThread: boolean;
	estimatedSize: number;
	index: number;
	onRetry: (() => void) | undefined;
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
					) : option.hasBody === false ? (
						<p className="py-10 text-center text-sm text-(--session-overview-muted)">
							No response recorded
						</p>
					) : bodyState === "error" ? (
						<div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-(--session-overview-muted)">
							<p>This turn could not be loaded.</p>
							{onRetry ? (
								<Button
									onClick={onRetry}
									size="sm"
									type="button"
									variant="outline"
								>
									Retry turn
								</Button>
							) : null}
						</div>
					) : (
						<div
							aria-busy="true"
							className="grid gap-3 p-4"
							style={{ minHeight: estimatedSize }}
						>
							<output className="sr-only">Loading turn</output>
							<Skeleton className="h-16 w-full rounded-md" />
							<Skeleton className="h-32 w-full rounded-md" />
						</div>
					)}
				</section>
			</div>
		</section>
	);
});
