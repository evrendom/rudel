// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: Virtualization, row rendering, and fixture diagnostics share one measured-row contract.
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import {
	forwardRef,
	memo,
	Profiler,
	type ProfilerOnRenderCallback,
	startTransition,
	useCallback,
	useImperativeHandle,
	useRef,
} from "react";
import { useLatestValueRef } from "@/app/hooks/useLatestValueRef";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { Button } from "@/app/ui/button";
import {
	ConversationTraceDerivedSectionRow,
	ConversationTraceTreeConnectorStyleProvider,
} from "@/components/conversation/ConversationTrace";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { SessionContinuousTurnSkeleton } from "./session-continuous-turn-skeleton";
import type { SessionContinuousTurnViewportStore } from "./session-continuous-turn-viewport-store";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import { SessionMemberRow } from "./session-member-row";
import type {
	SessionTranscriptRow,
	SessionTranscriptRowModel,
} from "./session-transcript-sections";
import {
	markTranscriptMeasure,
	publishTranscriptDebugSnapshot,
} from "./transcript-debug";

const TRANSCRIPT_OVERSCAN = 8;
const TRANSCRIPT_EDGE_LOAD_DISTANCE = 10;
const ACTIVE_TURN_MAX_FOCUS_OFFSET_PX = 160;
const ACTIVE_TURN_FOCUS_RATIO = 0.3;
const BLANK_FRAME_GAP_TOLERANCE_PX = 8;
const TRANSCRIPT_ANCHOR_CANCEL_KEYS = new Set([
	"ArrowDown",
	"ArrowUp",
	"End",
	"Home",
	"PageDown",
	"PageUp",
]);

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

export function isTranscriptAnchorCancelKey(key: string) {
	return TRANSCRIPT_ANCHOR_CANCEL_KEYS.has(key);
}

export type SessionTranscriptListHandle = {
	scrollToTurn: (turnId: string) => Promise<boolean>;
};

export type SessionTranscriptRenderMode =
	| "default"
	| "direct-position"
	| "direct-transform";

export const SessionTranscriptList = forwardRef<
	SessionTranscriptListHandle,
	{
		bodyTurnCount: number;
		debugEnabled: boolean;
		model: SessionTranscriptRowModel;
		onLoadAnchor?: (turnId: string) => Promise<boolean>;
		onLoadDirection?: (direction: "newer" | "older") => void;
		onRetryTurn?: (turnId: string) => void;
		onTurnRender?: ProfilerOnRenderCallback;
		pendingCount: number;
		renderMode?: SessionTranscriptRenderMode;
		scrollContainerRef: React.RefObject<HTMLDivElement | null>;
		selectedTurnId?: string;
		userImageUrl: string | undefined;
		viewModel: SessionDetailViewModel;
		viewportStore: SessionContinuousTurnViewportStore;
		windowsLoaded: number;
	}
>(function SessionTranscriptList(
	{
		bodyTurnCount,
		debugEnabled,
		model,
		onLoadAnchor,
		onLoadDirection,
		onRetryTurn,
		onTurnRender,
		pendingCount,
		renderMode = "direct-position",
		scrollContainerRef,
		selectedTurnId,
		userImageUrl,
		viewModel,
		viewportStore,
		windowsLoaded,
	},
	ref,
) {
	const rowsRef = useRef(model.rows);
	rowsRef.current = model.rows;
	const modelRef = useLatestValueRef(model);
	const feederInputRef = useLatestValueRef({
		bodyTurnCount,
		debugEnabled,
		onLoadDirection,
		pendingCount,
		windowsLoaded,
	});
	const blankFrameCountRef = useRef(0);
	const lastBlankGapRef = useRef(0);
	const loadingEdgesRef = useRef(new Set<"newer" | "older">());
	const scrollModeRef = useRef<
		{ kind: "free-scrolling" } | { kind: "anchoring-turn"; turnId: string }
	>({ kind: "free-scrolling" });
	const scrollOwnerEpochRef = useRef(0);
	const scheduleFeederRef = useRef<() => void>(() => {});
	const handleVirtualizerChange = useCallback(
		() => scheduleFeederRef.current(),
		[],
	);
	const getItemKey = useCallback(
		(index: number) => rowsRef.current[index]?.id ?? `missing-row:${index}`,
		[],
	);
	const estimateSize = useCallback(
		(index: number) => estimateTranscriptRow(rowsRef.current[index]),
		[],
	);
	const getScrollElement = useCallback(
		() => scrollContainerRef.current,
		[scrollContainerRef],
	);
	const directDomUpdates = renderMode !== "default";
	const virtualizer = useVirtualizer<HTMLDivElement, HTMLElement>({
		anchorTo: "end",
		count: model.rows.length,
		directDomUpdates,
		directDomUpdatesMode:
			renderMode === "direct-transform" ? "transform" : "position",
		estimateSize,
		getItemKey,
		getScrollElement,
		onChange: handleVirtualizerChange,
		overscan: TRANSCRIPT_OVERSCAN,
		useFlushSync: renderMode === "default",
	});
	const virtualItems = virtualizer.getVirtualItems();

	useImperativeHandle(
		ref,
		() => ({
			scrollToTurn: async (turnId) => {
				let index = modelRef.current.turnFirstRowIndex.get(turnId);
				if (index === undefined && onLoadAnchor) {
					const loaded = await onLoadAnchor(turnId);
					if (loaded) {
						await new Promise<void>((resolve) =>
							window.requestAnimationFrame(() => resolve()),
						);
						index = modelRef.current.turnFirstRowIndex.get(turnId);
					}
				}
				if (index === undefined) {
					return false;
				}
				const ownerEpoch = scrollOwnerEpochRef.current + 1;
				scrollOwnerEpochRef.current = ownerEpoch;
				scrollModeRef.current = { kind: "anchoring-turn", turnId };
				markTranscriptMeasure("anchor", "start", debugEnabled);
				const startedAt = performance.now();
				virtualizer.scrollToIndex(index, { align: "start" });
				await observeVirtualizerSettle({
					index,
					scrollContainerRef,
					virtualizer,
				});
				if (scrollOwnerEpochRef.current !== ownerEpoch) {
					return false;
				}
				scrollModeRef.current = { kind: "free-scrolling" };
				scheduleFeederRef.current();
				const element = scrollContainerRef.current;
				if (element) {
					element.dataset.transcriptAnchorSettleMs = String(
						Math.round(performance.now() - startedAt),
					);
				}
				markTranscriptMeasure("anchor", "end", debugEnabled);
				for (let frame = 0; frame < 12; frame += 1) {
					if (scrollOwnerEpochRef.current !== ownerEpoch) {
						return false;
					}
					const target = Array.from(
						scrollContainerRef.current?.querySelectorAll<HTMLElement>(
							"[data-transcript-turn-id]",
						) ?? [],
					).find((element) => element.dataset.transcriptTurnId === turnId);
					if (target) {
						target.focus({ preventScroll: true });
						if (document.activeElement === target) {
							break;
						}
					}
					await new Promise<void>((resolve) =>
						window.requestAnimationFrame(() => resolve()),
					);
				}
				return true;
			},
		}),
		[debugEnabled, modelRef, onLoadAnchor, scrollContainerRef, virtualizer],
	);

	useMountEffect(() => {
		const scrollElement = scrollContainerRef.current;
		if (!scrollElement) {
			return;
		}
		let animationFrame: number | undefined;
		const sync = () => {
			animationFrame = undefined;
			const rows = rowsRef.current;
			const indexedModel = modelRef.current;
			const scrollTop = scrollElement.scrollTop;
			const clientHeight = scrollElement.clientHeight;
			const viewportBottom = scrollTop + clientHeight;
			const visibleItems = virtualizer
				.getVirtualItems()
				.filter((item) => item.start < viewportBottom && item.end > scrollTop);
			const turnItems = visibleItems.flatMap((item) => {
				const row = rows[item.index];
				const turnIndex = row
					? indexedModel.rowTurnIndex.get(row.id)
					: undefined;
				return turnIndex === undefined ? [] : [{ item, turnIndex }];
			});
			const viewport = getTranscriptVirtualViewport({
				clientHeight,
				scrollHeight: virtualizer.getTotalSize(),
				scrollTop,
				turnItems,
				turnTotal: new Set(indexedModel.rowTurnIndex.values()).size,
			});
			if (viewport && scrollModeRef.current.kind === "free-scrolling") {
				viewportStore.publishViewport(
					viewport.activeTurn,
					viewport.visibleRange,
				);
			}
			const virtualContentBottom = Math.min(
				viewportBottom,
				virtualizer.getTotalSize(),
			);
			const blankGap =
				visibleItems.length === 0
					? 0
					: getVisibleBlankGap(visibleItems, scrollTop, virtualContentBottom);
			if (blankGap > BLANK_FRAME_GAP_TOLERANCE_PX) {
				blankFrameCountRef.current += 1;
				lastBlankGapRef.current = Math.round(blankGap);
			}
			triggerApproachingEdges({
				firstVisibleIndex: visibleItems[0]?.index,
				input: feederInputRef.current,
				lastVisibleIndex: visibleItems.at(-1)?.index,
				loadingEdges: loadingEdgesRef.current,
				model: indexedModel,
			});
			if (feederInputRef.current.debugEnabled) {
				publishTranscriptDebugSnapshot(scrollElement, {
					activeTurn: viewport?.activeTurn,
					blankFrames: blankFrameCountRef.current,
					bodyTurns: feederInputRef.current.bodyTurnCount,
					lastGap: lastBlankGapRef.current,
					pending: feederInputRef.current.pendingCount,
					scrollMode: scrollModeRef.current.kind,
					visibleRange: viewport?.visibleRange,
					windows: feederInputRef.current.windowsLoaded,
				});
			}
		};
		const schedule = () => {
			if (animationFrame === undefined) {
				animationFrame = window.requestAnimationFrame(sync);
			}
		};
		const cancelAnchor = (event: Event) => {
			if (
				scrollModeRef.current.kind !== "anchoring-turn" ||
				(event instanceof KeyboardEvent &&
					!isTranscriptAnchorCancelKey(event.key))
			) {
				return;
			}
			scrollOwnerEpochRef.current += 1;
			scrollModeRef.current = { kind: "free-scrolling" };
			virtualizer.scrollToOffset(scrollElement.scrollTop, { behavior: "auto" });
			schedule();
		};
		scheduleFeederRef.current = schedule;
		scrollElement.addEventListener("scroll", schedule, { passive: true });
		scrollElement.addEventListener("wheel", cancelAnchor, { passive: true });
		scrollElement.addEventListener("touchmove", cancelAnchor, {
			passive: true,
		});
		scrollElement.addEventListener("pointerdown", cancelAnchor, {
			passive: true,
		});
		window.addEventListener("keydown", cancelAnchor, { passive: true });
		const resizeObserver =
			typeof ResizeObserver === "function"
				? new ResizeObserver(schedule)
				: undefined;
		resizeObserver?.observe(scrollElement);
		schedule();
		return () => {
			scheduleFeederRef.current = () => {};
			scrollElement.removeEventListener("scroll", schedule);
			scrollElement.removeEventListener("wheel", cancelAnchor);
			scrollElement.removeEventListener("touchmove", cancelAnchor);
			scrollElement.removeEventListener("pointerdown", cancelAnchor);
			window.removeEventListener("keydown", cancelAnchor);
			resizeObserver?.disconnect();
			if (animationFrame !== undefined) {
				window.cancelAnimationFrame(animationFrame);
			}
		};
	});

	const sizeContainerRef = useCallback(
		(node: HTMLDivElement | null) => {
			virtualizer.containerRef(node);
		},
		[virtualizer],
	);

	return (
		<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots-no-horizontal">
			<div
				ref={sizeContainerRef}
				className="relative min-w-0"
				data-transcript-virtual-list
				style={
					directDomUpdates ? undefined : { height: virtualizer.getTotalSize() }
				}
			>
				{virtualItems.map((virtualItem) => {
					const row = model.rows[virtualItem.index];
					if (!row) {
						return null;
					}
					const rendered = (
						<TranscriptVirtualRow
							key={row.id}
							active={"turnId" in row && row.turnId === selectedTurnId}
							debugEnabled={debugEnabled}
							directDomUpdates={directDomUpdates}
							measureElement={virtualizer.measureElement}
							model={model}
							onLoadDirection={onLoadDirection}
							onRetryTurn={onRetryTurn}
							row={row}
							userImageUrl={userImageUrl}
							viewModel={viewModel}
							virtualItem={virtualItem}
						/>
					);
					return onTurnRender ? (
						<Profiler
							key={row.id}
							id={`${row.id}:virtual`}
							onRender={onTurnRender}
						>
							{rendered}
						</Profiler>
					) : (
						rendered
					);
				})}
			</div>
		</ConversationTraceTreeConnectorStyleProvider>
	);
});

type TranscriptVirtualRowProps = {
	active: boolean;
	debugEnabled: boolean;
	directDomUpdates: boolean;
	measureElement: (element: HTMLElement | null) => void;
	model: SessionTranscriptRowModel;
	onLoadDirection: ((direction: "newer" | "older") => void) | undefined;
	onRetryTurn: ((turnId: string) => void) | undefined;
	row: SessionTranscriptRow;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
	virtualItem: VirtualItem;
};

const TranscriptVirtualRow = memo(function TranscriptVirtualRow({
	active,
	debugEnabled,
	directDomUpdates,
	measureElement,
	model,
	onLoadDirection,
	onRetryTurn,
	row,
	userImageUrl,
	viewModel,
	virtualItem,
}: TranscriptVirtualRowProps) {
	const style = directDomUpdates
		? { left: 0, position: "absolute" as const, width: "100%" }
		: {
				left: 0,
				position: "absolute" as const,
				top: virtualItem.start,
				width: "100%",
			};
	return (
		<section
			ref={measureElement}
			aria-busy={row.kind === "turn-pending" || undefined}
			aria-current={active ? "true" : undefined}
			aria-label={getTranscriptRowLabel(row)}
			className="min-w-0 scroll-mt-0"
			data-index={virtualItem.index}
			data-transcript-row-id={row.id}
			data-transcript-row-kind={row.kind}
			data-transcript-turn-id={"turnId" in row ? row.turnId : undefined}
			style={style}
			tabIndex={"turnId" in row ? -1 : undefined}
		>
			<TranscriptRowContent
				model={model}
				onLoadDirection={onLoadDirection}
				onRetryTurn={onRetryTurn}
				row={row}
				userImageUrl={userImageUrl}
				viewModel={viewModel}
			/>
			{debugEnabled ? (
				<TranscriptRowDebugBadge
					estimate={estimateTranscriptRow(row)}
					row={row}
				/>
			) : null}
		</section>
	);
}, areTranscriptVirtualRowPropsEqual);

function areTranscriptVirtualRowPropsEqual(
	left: TranscriptVirtualRowProps,
	right: TranscriptVirtualRowProps,
) {
	return (
		left.active === right.active &&
		left.debugEnabled === right.debugEnabled &&
		left.directDomUpdates === right.directDomUpdates &&
		left.measureElement === right.measureElement &&
		left.model === right.model &&
		left.onLoadDirection === right.onLoadDirection &&
		left.onRetryTurn === right.onRetryTurn &&
		left.row === right.row &&
		left.userImageUrl === right.userImageUrl &&
		left.viewModel === right.viewModel &&
		left.virtualItem.index === right.virtualItem.index &&
		left.virtualItem.key === right.virtualItem.key &&
		(left.directDomUpdates ||
			(left.virtualItem.start === right.virtualItem.start &&
				left.virtualItem.size === right.virtualItem.size))
	);
}

function TranscriptRowContent({
	model,
	onLoadDirection,
	onRetryTurn,
	row,
	userImageUrl,
	viewModel,
}: {
	model: SessionTranscriptRowModel;
	onLoadDirection: ((direction: "newer" | "older") => void) | undefined;
	onRetryTurn: ((turnId: string) => void) | undefined;
	row: SessionTranscriptRow;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	switch (row.kind) {
		case "member":
			return (
				<SessionMemberRow
					active={false}
					headingId={`${row.id}:heading`}
					items={[...row.items]}
					speakerLayout="trace-tree"
					startsTrace={row.startsTrace}
					userImageUrl={userImageUrl}
					userLabel={viewModel.safeUserDisplayName}
				/>
			);
		case "section": {
			const payload = row.section.payload;
			return (
				<ConversationTraceDerivedSectionRow
					agentLabel={
						viewModel.safeModelUsed
							? formatModelDisplayLabel(viewModel.safeModelUsed)
							: undefined
					}
					agentModel={viewModel.safeModelUsed}
					allEvents={payload.allEvents.events}
					continuesAfter={
						(model.rowIndex.get(row.id) ?? 0) < model.rows.length - 1
					}
					isFirst={payload.isFirst}
					planMode={payload.planMode}
					section={payload.traceSection}
					userImageUrl={userImageUrl}
					userLabel={viewModel.safeUserDisplayName}
				/>
			);
		}
		case "section-overflow":
			return (
				<button
					type="button"
					className="min-h-11 w-full border-y border-(--session-overview-border) px-3 text-left text-xs text-(--session-overview-muted)"
				>
					Show {row.hidden.events.toLocaleString()} more {row.hidden.kindLabel}
				</button>
			);
		case "turn-fold":
			return (
				<button
					type="button"
					className="min-h-11 w-full px-3 text-left text-xs"
				>
					Show {row.hidden.toolCalls.toLocaleString()} tool calls and{" "}
					{row.hidden.events.toLocaleString()} events
				</button>
			);
		case "turn-pending":
			return (
				<SessionContinuousTurnSkeleton
					continuesThread
					option={row.option}
					userLabel={viewModel.safeUserDisplayName}
				/>
			);
		case "turn-error":
			return (
				<div className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-sm text-(--session-overview-muted)">
					<p>This turn could not be loaded.</p>
					<Button
						onClick={() => onRetryTurn?.(row.turnId)}
						size="sm"
						type="button"
						variant="outline"
					>
						Retry turn
					</Button>
				</div>
			);
		case "no-response":
			return (
				<p className="py-10 text-center text-sm text-(--session-overview-muted)">
					No response recorded
				</p>
			);
		case "window-edge":
			return (
				<div className="flex min-h-12 items-center justify-center border-y border-(--session-overview-border) p-2">
					<Button
						disabled={row.state === "loading"}
						onClick={() =>
							startTransition(() => onLoadDirection?.(row.direction))
						}
						size="sm"
						type="button"
						variant="outline"
					>
						{row.state === "loading"
							? "Loading…"
							: row.state === "error"
								? `Retry ${row.direction}`
								: `Load ${row.direction}`}
					</Button>
				</div>
			);
		case "subagents-anchor":
			return <div id="subagents" className="h-px" />;
	}
}

function TranscriptRowDebugBadge({
	estimate,
	row,
}: {
	estimate: number;
	row: SessionTranscriptRow;
}) {
	const outputRef = useRef<HTMLOutputElement>(null);
	const badgeInputRef = useLatestValueRef({ estimate, row });
	useMountEffect(() => {
		const output = outputRef.current;
		const element = output?.parentElement;
		if (!output || !element) {
			return;
		}
		const publish = () => {
			const measured = Math.round(element.offsetHeight);
			const latest = badgeInputRef.current;
			const delta = measured - latest.estimate;
			output.textContent = `${latest.row.kind} · ${latest.row.id} · est ${latest.estimate}px · measured ${measured}px · Δ ${delta >= 0 ? "+" : ""}${delta}px`;
		};
		publish();
		const observer =
			typeof ResizeObserver === "function"
				? new ResizeObserver(publish)
				: undefined;
		observer?.observe(element);
		return () => observer?.disconnect();
	});
	return (
		<output
			ref={outputRef}
			className="pointer-events-none absolute top-1 right-2 z-50 rounded-md border border-(--session-overview-border) bg-(--session-overview-surface) px-2 py-1 text-[0.6875rem] text-(--session-overview-muted) shadow-sm"
		/>
	);
}

export function getTranscriptVirtualViewport(input: {
	clientHeight: number;
	scrollHeight: number;
	scrollTop: number;
	turnItems: readonly { item: VirtualItem; turnIndex: number }[];
	turnTotal: number;
}) {
	if (input.turnItems.length === 0 || input.turnTotal === 0) {
		return undefined;
	}
	const visibleTurns = [
		...new Set(input.turnItems.map((entry) => entry.turnIndex)),
	];
	const focusLine =
		input.scrollTop +
		Math.min(
			input.clientHeight * ACTIVE_TURN_FOCUS_RATIO,
			ACTIVE_TURN_MAX_FOCUS_OFFSET_PX,
		);
	let activeTurn = visibleTurns[0] ?? 0;
	for (const entry of input.turnItems) {
		if (entry.item.start <= focusLine) {
			activeTurn = entry.turnIndex;
		}
		if (entry.item.start <= focusLine && entry.item.end > focusLine) {
			activeTurn = entry.turnIndex;
			break;
		}
	}
	if (input.scrollTop <= 2) {
		activeTurn = 0;
	} else if (input.scrollHeight - input.clientHeight - input.scrollTop <= 2) {
		activeTurn = input.turnTotal - 1;
	}
	return {
		activeTurn,
		visibleRange: [
			visibleTurns[0] ?? activeTurn,
			visibleTurns.at(-1) ?? activeTurn,
		] as const,
	};
}

export function getVisibleBlankGap(
	items: readonly VirtualItem[],
	viewportTop: number,
	viewportBottom: number,
) {
	let cursor = viewportTop;
	let maximumGap = 0;
	for (const item of [...items].sort(
		(left, right) => left.start - right.start,
	)) {
		const start = Math.max(item.start, viewportTop);
		const end = Math.min(item.end, viewportBottom);
		if (end <= viewportTop || start >= viewportBottom) {
			continue;
		}
		maximumGap = Math.max(maximumGap, start - cursor);
		cursor = Math.max(cursor, end);
	}
	return Math.max(maximumGap, viewportBottom - cursor);
}

function estimateTranscriptRow(row: SessionTranscriptRow | undefined) {
	if (!row) {
		return 96;
	}
	switch (row.kind) {
		case "member":
			return 112;
		case "section":
			return row.section.estimatedHeight;
		case "section-overflow":
		case "turn-fold":
		case "window-edge":
			return 48;
		case "turn-pending":
			return 320;
		case "turn-error":
			return 192;
		case "no-response":
			return 96;
		case "subagents-anchor":
			return 1;
	}
}

function getTranscriptRowLabel(row: SessionTranscriptRow) {
	if ("turnId" in row) {
		return `${row.turnId} ${row.kind}`;
	}
	return row.kind === "window-edge" ? `Load ${row.direction}` : "Subagents";
}

function triggerApproachingEdges(input: {
	firstVisibleIndex: number | undefined;
	input: {
		onLoadDirection?: (direction: "newer" | "older") => void;
	};
	lastVisibleIndex: number | undefined;
	loadingEdges: Set<"newer" | "older">;
	model: SessionTranscriptRowModel;
}) {
	for (const direction of ["older", "newer"] as const) {
		const edgeIndex = input.model.rowIndex.get(`window-edge:${direction}`);
		const edgeRow =
			edgeIndex === undefined ? undefined : input.model.rows[edgeIndex];
		const visibleIndex =
			direction === "older" ? input.firstVisibleIndex : input.lastVisibleIndex;
		if (
			edgeIndex === undefined ||
			edgeRow?.kind !== "window-edge" ||
			edgeRow.state === "loading" ||
			visibleIndex === undefined ||
			Math.abs(edgeIndex - visibleIndex) > TRANSCRIPT_EDGE_LOAD_DISTANCE ||
			input.loadingEdges.has(direction)
		) {
			continue;
		}
		input.loadingEdges.add(direction);
		input.input.onLoadDirection?.(direction);
		window.setTimeout(() => input.loadingEdges.delete(direction), 250);
	}
}

async function observeVirtualizerSettle(input: {
	index: number;
	scrollContainerRef: React.RefObject<HTMLDivElement | null>;
	virtualizer: ReturnType<typeof useVirtualizer<HTMLDivElement, HTMLElement>>;
}) {
	const startedAt = performance.now();
	await new Promise<void>((resolve) => {
		const observe = () => {
			const item = input.virtualizer
				.getVirtualItems()
				.find((candidate) => candidate.index === input.index);
			const scrollElement = input.scrollContainerRef.current;
			const scrollTop = scrollElement?.scrollTop;
			const maximumScrollTop = scrollElement
				? scrollElement.scrollHeight - scrollElement.clientHeight
				: undefined;
			if (
				(item &&
					scrollTop !== undefined &&
					(Math.abs(item.start - scrollTop) <= 2 ||
						(maximumScrollTop !== undefined &&
							item.start >= maximumScrollTop &&
							maximumScrollTop - scrollTop <= 2))) ||
				performance.now() - startedAt >= 5_000
			) {
				resolve();
				return;
			}
			window.requestAnimationFrame(observe);
		};
		window.requestAnimationFrame(observe);
	});
}
