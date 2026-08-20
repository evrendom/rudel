// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: Virtualization, row rendering, and fixture diagnostics share one measured-row contract.
import {
	elementScroll,
	measureElement as measureVirtualElement,
	useVirtualizer,
	type VirtualItem,
	type Virtualizer,
} from "@tanstack/react-virtual";
import {
	forwardRef,
	memo,
	Profiler,
	type ProfilerOnRenderCallback,
	startTransition,
	useCallback,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import { useLatestValueRef } from "@/app/hooks/useLatestValueRef";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { Button } from "@/app/ui/button";
import {
	ConversationTraceDerivedSectionRow,
	type ConversationTraceEventSubtreeRenderer,
	ConversationTraceTreeConnectorStyleProvider,
	createTraceExpansionStore,
	TraceExpansionNamespaceProvider,
	TraceExpansionStoreProvider,
} from "@/components/conversation/ConversationTrace";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { SessionContinuousTurnSkeleton } from "./session-continuous-turn-skeleton";
import type { SessionContinuousTurnViewportStore } from "./session-continuous-turn-viewport-store";
import type { SessionDetailLevel } from "./session-detail-level";
import type { buildSessionDetailViewModel } from "./session-detail-view-model";
import { SessionMemberRow } from "./session-member-row";
import type {
	SessionTranscriptRow,
	SessionTranscriptRowModel,
} from "./session-transcript-sections";
import type { SessionTurnSelection } from "./session-turn-table-selection";
import {
	markTranscriptMeasure,
	publishTranscriptDebugSnapshot,
} from "./transcript-debug";
import {
	attachTranscriptTraceScroller,
	createTranscriptTraceInstanceId,
	ensureTranscriptTrace,
	recordAnchorJournal,
	recordTranscriptAdjustment,
	recordTranscriptComponentLifecycle,
	recordTranscriptMeasurement,
	recordTranscriptProgrammaticWrite,
	recordTranscriptReactCommit,
	recordTranscriptRowLifecycle,
	recordTranscriptRowMount,
	recordTranscriptViewportGeometry,
	reportAnchorJournalFailure,
	type TranscriptAnchorDeactivationClause,
	type TranscriptForensicsContentFlags,
	type TranscriptForensicsReactCommitReason,
} from "./transcript-forensics";
import {
	deriveTranscriptStickyHeaderGroups,
	TranscriptFoldSummaryControl,
	type TranscriptMemberHeaderData,
	type TranscriptModelHeaderData,
	TranscriptStickyHeaderWrappers,
	useTranscriptStickyHeaderWrappers,
} from "./use-transcript-sticky-header-wrappers";
import "./session-transcript-mask.css";

const TRANSCRIPT_OVERSCAN = 8;
const TRANSCRIPT_EDGE_LOAD_DISTANCE = 10;
const ACTIVE_TURN_MAX_FOCUS_OFFSET_PX = 160;
const ACTIVE_TURN_FOCUS_RATIO = 0.3;
const BLANK_FRAME_GAP_TOLERANCE_PX = 8;
const TRANSCRIPT_ANCHOR_DRIFT_TOLERANCE_PX = 2;
const TRANSCRIPT_ANCHOR_STABLE_FRAME_COUNT = 2;
const TRANSCRIPT_ANCHOR_STABLE_SETTLE_EXPECTATION_MS =
	TRANSCRIPT_ANCHOR_STABLE_FRAME_COUNT * 16;
const TRANSCRIPT_ANCHOR_SETTLE_TIMEOUT_MS = 700;
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
	scrollToTurn: (
		turnId: string,
		options?: {
			expandFolds?: boolean;
			speaker?: SessionTurnSelection["speaker"];
		},
	) => Promise<boolean>;
};

export function getTranscriptAnchorRowIndex(
	model: SessionTranscriptRowModel,
	turnId: string,
	speaker: SessionTurnSelection["speaker"] | undefined,
) {
	const firstRowIndex = model.turnFirstRowIndex.get(turnId);
	if (firstRowIndex === undefined || speaker === undefined) {
		return firstRowIndex;
	}
	if (speaker === "member") {
		return model.rowIndex.get(`${turnId}:member`) ?? firstRowIndex;
	}
	for (let index = firstRowIndex; index < model.rows.length; index += 1) {
		const row = model.rows[index];
		if (!row || !("turnId" in row) || row.turnId !== turnId) {
			break;
		}
		if (row.kind !== "member") {
			return index;
		}
	}
	return firstRowIndex;
}

type SessionTranscriptRenderMode =
	| "default"
	| "direct-position"
	| "direct-transform";

export const SessionTranscriptList = forwardRef<
	SessionTranscriptListHandle,
	{
		bodyTurnCount: number;
		debugEnabled: boolean;
		debugPaintEpoch?: number;
		level: SessionDetailLevel;
		model: SessionTranscriptRowModel;
		onLoadAnchor?: (turnId: string) => Promise<boolean>;
		onLoadDirection?: (direction: "newer" | "older") => void;
		onExpandTurn?: (turnId: string) => void;
		onRetryTurn?: (turnId: string) => void;
		onToggleFold?: (turnId: string) => void;
		onTurnRender?: ProfilerOnRenderCallback;
		onVisibleTurnIds?: (turnIds: readonly string[]) => void;
		pendingCount: number;
		renderMode?: SessionTranscriptRenderMode;
		renderEventSubtree?: ConversationTraceEventSubtreeRenderer;
		scrollContainerRef: React.RefObject<HTMLDivElement | null>;
		selectedTurnId?: string;
		stickyHeaderHeights?: Partial<Record<"member" | "model", number>>;
		userImageUrl: string | undefined;
		viewModel: SessionDetailViewModel;
		viewportStore: SessionContinuousTurnViewportStore;
		windowsLoaded: number;
	}
>(function SessionTranscriptList(
	{
		bodyTurnCount,
		debugEnabled,
		debugPaintEpoch = 0,
		level,
		model,
		onLoadAnchor,
		onLoadDirection,
		onExpandTurn,
		onRetryTurn,
		onToggleFold,
		onTurnRender,
		onVisibleTurnIds,
		pendingCount,
		renderEventSubtree,
		renderMode = "direct-position",
		scrollContainerRef,
		selectedTurnId,
		stickyHeaderHeights,
		userImageUrl,
		viewModel,
		viewportStore,
		windowsLoaded,
	},
	ref,
) {
	ensureTranscriptTrace(debugEnabled);
	const [traceInstanceId] = useState(() =>
		createTranscriptTraceInstanceId("list"),
	);
	const [traceExpansionStore] = useState(createTraceExpansionStore);
	const rowsRef = useRef(model.rows);
	const rowCommitStatesRef = useRef(
		new Map<
			string,
			{
				active: boolean;
				level: SessionDetailLevel;
				row: SessionTranscriptRow;
			}
		>(),
	);
	const committedRowsRef = useRef(model.rows);
	const [, resetPrependAnchor] = useReducer(
		(version: number) => version + 1,
		0,
	);
	const anchorsPrepend = shouldAnchorTranscriptPrepend(
		committedRowsRef.current,
		model.rows,
	);
	rowsRef.current = model.rows;
	const modelRef = useLatestValueRef(model);
	const scheduleFeederRef = useRef<() => void>(() => {});
	const stickyHeaderGroups = useMemo(
		() =>
			deriveTranscriptStickyHeaderGroups({
				agentModel: viewModel.safeModelUsed,
				headerHeights: stickyHeaderHeights,
				rows: model.rows,
				userImageUrl,
				userLabel: viewModel.safeUserDisplayName,
			}),
		[
			model.rows,
			stickyHeaderHeights,
			userImageUrl,
			viewModel.safeModelUsed,
			viewModel.safeUserDisplayName,
		],
	);
	const modelHeadersByTurn = useMemo(
		() =>
			new Map(
				stickyHeaderGroups.flatMap((group) =>
					group.header.kind === "model"
						? [[group.turnId, group.header] as const]
						: [],
				),
			),
		[stickyHeaderGroups],
	);
	const memberHeadersByTurn = useMemo(
		() =>
			new Map(
				stickyHeaderGroups.flatMap((group) =>
					group.header.kind === "member"
						? [[group.turnId, group.header] as const]
						: [],
				),
			),
		[stickyHeaderGroups],
	);
	const {
		placements: stickyHeaderPlacements,
		registerWrapper: registerStickyHeaderWrapper,
		sync: syncStickyHeaderWrappers,
	} = useTranscriptStickyHeaderWrappers({
		groups: stickyHeaderGroups,
	});
	const feederInputRef = useLatestValueRef({
		bodyTurnCount,
		debugPaintEpoch,
		debugEnabled,
		onLoadDirection,
		onVisibleTurnIds,
		pendingCount,
		windowsLoaded,
	});
	const maskedGapFrameCountRef = useRef(0);
	const trueBlankFrameCountRef = useRef(0);
	const lastBlankGapRef = useRef(0);
	const loadingEdgesRef = useRef(new Set<"newer" | "older">());
	const scrollModeRef = useRef<
		| { kind: "free-scrolling" }
		| { kind: "anchoring-turn"; turnId: string }
		| { kind: "soft-anchored"; turnId: string }
	>({ kind: "free-scrolling" });
	const scrollOwnerEpochRef = useRef(0);
	const anchorPinEnforcerRef = useRef<() => void>(() => {});
	const anchorPinDeactivationRef = useRef<() => void>(() => {});
	const pendingMeasurementRef = useRef<
		| {
				at: number;
				est: number;
				measured: number;
				rowId: string;
		  }
		| undefined
	>(undefined);
	const stickyHeaderRangeRef = useRef<
		| {
				endIndex: number;
				startIndex: number;
		  }
		| undefined
	>(undefined);
	const handleVirtualizerChange = useCallback(
		(
			instance: Virtualizer<HTMLDivElement, HTMLElement>,
			scrollUpdate: boolean,
		) => {
			scheduleFeederRef.current();
			anchorPinEnforcerRef.current();
			const range = instance.range;
			const previousRange = stickyHeaderRangeRef.current;
			const rangeChanged =
				range?.startIndex !== previousRange?.startIndex ||
				range?.endIndex !== previousRange?.endIndex;
			if (range) {
				stickyHeaderRangeRef.current = {
					endIndex: range.endIndex,
					startIndex: range.startIndex,
				};
			}
			if (scrollUpdate && !rangeChanged) {
				return;
			}
			syncStickyHeaderWrappers({
				measurements: instance.measurementsCache,
				virtualItems: instance.getVirtualItems(),
			});
		},
		[syncStickyHeaderWrappers],
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
	const measureTranscriptElement = useCallback(
		(
			element: HTMLElement,
			entry: ResizeObserverEntry | undefined,
			instance: Virtualizer<HTMLDivElement, HTMLElement>,
		) => {
			const measured = measureVirtualElement(element, entry, instance);
			const index = Number(element.dataset.index);
			const row = Number.isInteger(index) ? rowsRef.current[index] : undefined;
			if (row) {
				const context = {
					at: performance.now(),
					est: estimateTranscriptRow(row),
					measured,
					rowId: row.id,
				};
				pendingMeasurementRef.current = context;
				recordTranscriptMeasurement({
					...context,
					delta: measured - context.est,
				});
				queueMicrotask(() => {
					if (pendingMeasurementRef.current === context) {
						pendingMeasurementRef.current = undefined;
					}
				});
			}
			anchorPinEnforcerRef.current();
			return measured;
		},
		[],
	);
	const scrollToFn = useCallback(
		(
			offset: number,
			options: {
				adjustments?: number;
				behavior?: ScrollBehavior;
			},
			instance: Virtualizer<HTMLDivElement, HTMLElement>,
		) => {
			const element = instance.scrollElement;
			const at = performance.now();
			const measurement = pendingMeasurementRef.current;
			const currentMeasurement =
				measurement && at - measurement.at <= 4 ? measurement : undefined;
			if (element instanceof HTMLElement) {
				const adjustment = options.adjustments ?? 0;
				const target = offset + adjustment;
				const cause =
					adjustment !== 0 && currentMeasurement
						? "resize-adjustment"
						: scrollModeRef.current.kind !== "free-scrolling"
							? "turn-anchor"
							: anchorsPrepend
								? "prepend-anchor"
								: "virtualizer";
				recordTranscriptProgrammaticWrite({
					at,
					cause,
					delta: target - element.scrollTop,
					est: currentMeasurement?.est,
					measured: currentMeasurement?.measured,
					rowId: currentMeasurement?.rowId,
					target,
				});
				if (adjustment !== 0 && currentMeasurement) {
					recordTranscriptAdjustment({
						at,
						delta: adjustment,
						est: currentMeasurement.est,
						measured: currentMeasurement.measured,
						rowId: currentMeasurement.rowId,
					});
				}
			}
			elementScroll(offset, options, instance);
		},
		[anchorsPrepend],
	);
	const directDomUpdates = renderMode !== "default";
	const virtualizer = useVirtualizer<HTMLDivElement, HTMLElement>({
		anchorTo: anchorsPrepend ? "end" : "start",
		count: model.rows.length,
		directDomUpdates,
		directDomUpdatesMode:
			renderMode === "direct-transform" ? "transform" : "position",
		estimateSize,
		getItemKey,
		getScrollElement,
		measureElement: measureTranscriptElement,
		onChange: handleVirtualizerChange,
		overscan: TRANSCRIPT_OVERSCAN,
		scrollToFn,
		useFlushSync: renderMode === "default",
	});
	const virtualItems = virtualizer.getVirtualItems();
	useLayoutEffect(() => {
		syncStickyHeaderWrappers({
			measurements: virtualizer.measurementsCache,
			virtualItems,
		});
	}, [syncStickyHeaderWrappers, virtualItems, virtualizer]);
	useLayoutEffect(() => {
		committedRowsRef.current = model.rows;
		if (anchorsPrepend) {
			resetPrependAnchor();
		}
	}, [anchorsPrepend, model.rows]);
	const handleRowRender = useCallback<ProfilerOnRenderCallback>(
		(id, phase, actualDuration, baseDuration, startTime, commitTime) => {
			onTurnRender?.(
				id,
				phase,
				actualDuration,
				baseDuration,
				startTime,
				commitTime,
			);
			if (!debugEnabled) {
				return;
			}
			const rowId = id.endsWith(":virtual") ? id.slice(0, -8) : id;
			const rowIndex = modelRef.current.rowIndex.get(rowId);
			const row =
				rowIndex === undefined ? undefined : modelRef.current.rows[rowIndex];
			if (!row) {
				return;
			}
			const active = "turnId" in row && row.turnId === selectedTurnId;
			const previousState = rowCommitStatesRef.current.get(rowId);
			let reason: TranscriptForensicsReactCommitReason = "no-data-change";
			if (phase === "mount") {
				const replacedPendingBody =
					"turnId" in row &&
					[...rowCommitStatesRef.current.values()].some(
						(state) =>
							"turnId" in state.row &&
							state.row.turnId === row.turnId &&
							state.row.kind === "turn-pending",
					);
				reason = replacedPendingBody ? "body-attached" : "mount";
			} else if (previousState?.active !== active) {
				reason = "selection";
			} else if (previousState?.level !== level) {
				reason = "level-change";
			} else if (previousState?.row !== row) {
				reason = "fold-or-row-data";
			}
			rowCommitStatesRef.current.set(rowId, { active, level, row });
			recordTranscriptReactCommit({
				actualDuration,
				at: commitTime,
				phase,
				reason,
				rowId,
			});
			if (phase !== "mount") {
				return;
			}
			recordTranscriptRowMount({
				actualDuration,
				commitTime,
				flags: getTranscriptRowContentFlags(row),
				rowId,
				rowKind: row.kind,
				startTime,
			});
		},
		[debugEnabled, level, modelRef, onTurnRender, selectedTurnId],
	);
	const listFingerprintRef = useLatestValueRef(
		`${renderMode}:${model.rows.length}`,
	);
	useMountEffect(() => {
		if (!debugEnabled) {
			return;
		}
		recordTranscriptComponentLifecycle({
			component: "list",
			instanceId: traceInstanceId,
			phase: "mount",
			propsFingerprint: listFingerprintRef.current,
		});
		return () =>
			recordTranscriptComponentLifecycle({
				component: "list",
				instanceId: traceInstanceId,
				phase: "unmount",
				propsFingerprint: listFingerprintRef.current,
			});
	});

	useImperativeHandle(
		ref,
		() => ({
			scrollToTurn: async (turnId, options) => {
				if (
					options?.expandFolds &&
					modelRef.current.rowIndex.has(`${turnId}:fold`)
				) {
					onExpandTurn?.(turnId);
					await new Promise<void>((resolve) =>
						window.requestAnimationFrame(() => resolve()),
					);
				}
				const index = getTranscriptAnchorRowIndex(
					modelRef.current,
					turnId,
					options?.speaker,
				);
				if (index === undefined) {
					const scrollElement = scrollContainerRef.current;
					if (scrollElement) {
						scrollElement.dataset.transcriptAnchorOutcome = "missing-index";
					}
					if (debugEnabled) {
						recordAnchorJournal({
							turnFirstRowIndexSize: modelRef.current.turnFirstRowIndex.size,
							turnId,
							type: "scrollToTurn:missing-index",
						});
						reportAnchorJournalFailure(undefined);
					}
					return false;
				}
				const ownerEpoch = scrollOwnerEpochRef.current + 1;
				const deactivatePreviousAnchor = anchorPinDeactivationRef.current;
				scrollOwnerEpochRef.current = ownerEpoch;
				scrollModeRef.current = { kind: "anchoring-turn", turnId };
				deactivatePreviousAnchor();
				markTranscriptMeasure("anchor", "start", debugEnabled);
				const startedAt = performance.now();
				const scrollElement = scrollContainerRef.current;
				if (scrollElement) {
					delete scrollElement.dataset.transcriptAnchorSettleMs;
					publishTranscriptAnchorDomState(scrollElement, {
						epoch: ownerEpoch,
						outcome: undefined,
						state: "anchoring",
						turnId,
					});
				}
				const estimatedStart =
					virtualizer.measurementsCache[index]?.start ??
					virtualizer.getVirtualItems().find((item) => item.index === index)
						?.start;
				if (debugEnabled) {
					recordAnchorJournal({
						epoch: ownerEpoch,
						estimatedStart,
						rowIndex: index,
						scrollTop: scrollElement?.scrollTop,
						turnId,
						type: "scrollToTurn:start",
					});
				}
				let deactivationRecorded = false;
				const recordDeactivation = () => {
					if (deactivationRecorded) {
						return;
					}
					deactivationRecorded = true;
					const clause: TranscriptAnchorDeactivationClause =
						scrollModeRef.current.kind === "free-scrolling"
							? "mode-free-scrolling"
							: scrollOwnerEpochRef.current !== ownerEpoch
								? "epoch-superseded"
								: "turn-mismatch";
					if (debugEnabled) {
						recordAnchorJournal({
							clause,
							epoch: ownerEpoch,
							type: "pin:deactivate",
						});
						reportAnchorJournalFailure(ownerEpoch);
					}
					const currentScrollElement = scrollContainerRef.current;
					if (
						currentScrollElement &&
						scrollOwnerEpochRef.current === ownerEpoch
					) {
						currentScrollElement.dataset.transcriptAnchorOutcome = `cancelled:${clause}`;
					}
				};
				anchorPinDeactivationRef.current = recordDeactivation;
				const pin = startTranscriptAnchorPin({
					getAnchorStart: () => {
						const currentIndex = getTranscriptAnchorRowIndex(
							modelRef.current,
							turnId,
							options?.speaker,
						);
						return currentIndex === undefined
							? undefined
							: (virtualizer.measurementsCache[currentIndex]?.start ??
									virtualizer
										.getVirtualItems()
										.find((item) => item.index === currentIndex)?.start);
					},
					getScrollElement: () => scrollContainerRef.current,
					isActive: () =>
						scrollOwnerEpochRef.current === ownerEpoch &&
						scrollModeRef.current.kind !== "free-scrolling" &&
						scrollModeRef.current.turnId === turnId,
					onDeactivate: recordDeactivation,
					onSettle: debugEnabled
						? ({ elapsedMs, settled, starvedMs, via }) => {
								recordAnchorJournal({
									elapsedMs,
									epoch: ownerEpoch,
									settled,
									starvedMs,
									type: "pin:settle",
									via,
								});
								if (!settled) {
									reportAnchorJournalFailure(ownerEpoch);
								}
							}
						: undefined,
					onWrite: (target, delta) => {
						const measurement = pendingMeasurementRef.current;
						recordTranscriptProgrammaticWrite({
							at: performance.now(),
							cause: "turn-anchor",
							delta,
							est: measurement?.est,
							measured: measurement?.measured,
							rowId: measurement?.rowId,
							target,
						});
						if (debugEnabled) {
							recordAnchorJournal({
								delta,
								epoch: ownerEpoch,
								phase:
									scrollModeRef.current.kind === "soft-anchored"
										? "soft"
										: "hard",
								target,
								type: "pin:write",
							});
						}
					},
				});
				anchorPinEnforcerRef.current = pin.enforce;
				virtualizer.scrollToIndex(index, { align: "start" });
				void onLoadAnchor?.(turnId);
				pin.enforce();
				const settled = await pin.settled;
				if (
					!settled ||
					scrollOwnerEpochRef.current !== ownerEpoch ||
					scrollModeRef.current.kind !== "anchoring-turn" ||
					scrollModeRef.current.turnId !== turnId
				) {
					recordDeactivation();
					return false;
				}
				scrollModeRef.current = { kind: "soft-anchored", turnId };
				scheduleFeederRef.current();
				const settledScrollElement = scrollContainerRef.current;
				if (settledScrollElement) {
					settledScrollElement.dataset.transcriptAnchorSettleMs = String(
						Math.round(performance.now() - startedAt),
					);
					publishTranscriptAnchorDomState(settledScrollElement, {
						epoch: ownerEpoch,
						outcome: "settled",
						state: "soft",
						turnId,
					});
				}
				markTranscriptMeasure("anchor", "end", debugEnabled);
				return true;
			},
		}),
		[
			debugEnabled,
			modelRef,
			onExpandTurn,
			onLoadAnchor,
			scrollContainerRef,
			virtualizer,
		],
	);

	useMountEffect(() => {
		const scrollElement = scrollContainerRef.current;
		if (!scrollElement) {
			return;
		}
		publishTranscriptAnchorDomState(scrollElement, {
			epoch: scrollOwnerEpochRef.current,
			outcome: undefined,
			state: "free",
			turnId: undefined,
		});
		const detachTrace = debugEnabled
			? attachTranscriptTraceScroller(scrollElement)
			: () => undefined;
		let animationFrame: number | undefined;
		const sync = () => {
			animationFrame = undefined;
			const rows = rowsRef.current;
			const indexedModel = modelRef.current;
			const scrollTop = scrollElement.scrollTop;
			const clientHeight = scrollElement.clientHeight;
			const viewportBottom = scrollTop + clientHeight;
			const currentVirtualItems = virtualizer.getVirtualItems();
			const visibleItems = currentVirtualItems.filter(
				(item) => item.start < viewportBottom && item.end > scrollTop,
			);
			if (feederInputRef.current.debugEnabled) {
				recordTranscriptViewportGeometry({
					clientHeight,
					rows: currentVirtualItems.flatMap((item) => {
						const row = rows[item.index];
						return row
							? [
									{
										contentVersion: `${getTranscriptRowContentVersion(row)}:epoch:${feederInputRef.current.debugPaintEpoch}`,
										end: item.end,
										rowId: row.id,
										start: item.start,
									},
								]
							: [];
					}),
					scrollTop,
				});
			}
			const turnItems = visibleItems.flatMap((item) => {
				const row = rows[item.index];
				const turnIndex = row
					? indexedModel.rowTurnIndex.get(row.id)
					: undefined;
				return turnIndex === undefined || !row
					? []
					: [
							{
								item,
								speaker: row.kind === "member" ? "member" : "model",
								turnIndex,
							} satisfies TranscriptViewportItem,
						];
			});
			const visibleTurnIds = [
				...new Set(
					visibleItems.flatMap((item) => {
						const row = rows[item.index];
						return row && "turnId" in row ? [row.turnId] : [];
					}),
				),
			];
			const viewport = getTranscriptVirtualViewport({
				clientHeight,
				scrollHeight: virtualizer.getTotalSize(),
				scrollTop,
				turnItems,
				turnTotal: new Set(indexedModel.rowTurnIndex.values()).size,
			});
			if (viewport) {
				feederInputRef.current.onVisibleTurnIds?.(visibleTurnIds);
				viewportStore.publishViewport(
					viewport.activeSelection,
					viewport.visibleRange,
					viewport.viewedSelections,
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
				if (scrollElement.classList.contains("session-transcript-mask")) {
					maskedGapFrameCountRef.current += 1;
				} else {
					trueBlankFrameCountRef.current += 1;
				}
				lastBlankGapRef.current = Math.round(blankGap);
			}
			if (scrollModeRef.current.kind !== "anchoring-turn") {
				triggerApproachingEdges({
					firstVisibleIndex: visibleItems[0]?.index,
					input: feederInputRef.current,
					lastVisibleIndex: visibleItems.at(-1)?.index,
					loadingEdges: loadingEdgesRef.current,
					model: indexedModel,
				});
			}
			if (feederInputRef.current.debugEnabled) {
				publishTranscriptDebugSnapshot(scrollElement, {
					activeTurn: viewport?.activeTurn,
					bodyTurns: feederInputRef.current.bodyTurnCount,
					lastGap: lastBlankGapRef.current,
					maskedGapFrames: maskedGapFrameCountRef.current,
					pending: feederInputRef.current.pendingCount,
					scrollMode: scrollModeRef.current.kind,
					visibleRange: viewport?.visibleRange,
					windows: feederInputRef.current.windowsLoaded,
					trueBlankFrames: trueBlankFrameCountRef.current,
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
				scrollModeRef.current.kind === "free-scrolling" ||
				(event instanceof KeyboardEvent &&
					!isTranscriptAnchorCancelKey(event.key))
			) {
				return;
			}
			const modeAtCancel = scrollModeRef.current.kind;
			const cancelledEpoch = scrollOwnerEpochRef.current;
			if (debugEnabled) {
				recordAnchorJournal({
					epoch: cancelledEpoch,
					eventType: event.type,
					key: event instanceof KeyboardEvent ? event.key : undefined,
					modeAtCancel,
					type: "cancelAnchor",
				});
			}
			anchorPinEnforcerRef.current = () => {};
			scrollOwnerEpochRef.current += 1;
			scrollModeRef.current = { kind: "free-scrolling" };
			publishTranscriptAnchorDomState(scrollElement, {
				epoch: scrollOwnerEpochRef.current,
				outcome: "cancelled:mode-free-scrolling",
				state: "free",
				turnId: undefined,
			});
			anchorPinDeactivationRef.current();
			anchorPinDeactivationRef.current = () => {};
			if (debugEnabled) {
				reportAnchorJournalFailure(cancelledEpoch);
			}
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
			detachTrace();
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
		<TraceExpansionStoreProvider store={traceExpansionStore}>
			<ConversationTraceTreeConnectorStyleProvider style="interfere-branch-dots-no-horizontal">
				<div
					ref={sizeContainerRef}
					className="relative min-w-0"
					data-transcript-virtual-list
					style={
						directDomUpdates
							? undefined
							: { height: virtualizer.getTotalSize() }
					}
				>
					<TranscriptStickyHeaderWrappers
						onToggleFold={onToggleFold}
						placements={stickyHeaderPlacements}
						registerWrapper={registerStickyHeaderWrapper}
					/>
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
								debugPaintEpoch={debugPaintEpoch}
								directDomUpdates={directDomUpdates}
								measureElement={virtualizer.measureElement}
								memberHeaderData={
									"turnId" in row
										? memberHeadersByTurn.get(row.turnId)
										: undefined
								}
								modelHeaderData={
									"turnId" in row
										? modelHeadersByTurn.get(row.turnId)
										: undefined
								}
								model={model}
								onLoadDirection={onLoadDirection}
								onRetryTurn={onRetryTurn}
								onToggleFold={onToggleFold}
								renderEventSubtree={renderEventSubtree}
								row={row}
								userImageUrl={userImageUrl}
								viewModel={viewModel}
								virtualItem={virtualItem}
							/>
						);
						return debugEnabled || onTurnRender ? (
							<Profiler
								key={row.id}
								id={`${row.id}:virtual`}
								onRender={handleRowRender}
							>
								{rendered}
							</Profiler>
						) : (
							rendered
						);
					})}
				</div>
			</ConversationTraceTreeConnectorStyleProvider>
		</TraceExpansionStoreProvider>
	);
});

export function shouldAnchorTranscriptPrepend(
	previous: readonly SessionTranscriptRow[],
	next: readonly SessionTranscriptRow[],
) {
	if (next.length <= previous.length) {
		return false;
	}
	const previousFirstTurnRowIndex = previous.findIndex(
		(row) => "turnId" in row,
	);
	const previousFirstTurnRow = previous[previousFirstTurnRowIndex];
	if (!previousFirstTurnRow) {
		return false;
	}
	const nextIndex = next.findIndex((row) => row.id === previousFirstTurnRow.id);
	return nextIndex > previousFirstTurnRowIndex;
}

type TranscriptVirtualRowProps = {
	active: boolean;
	debugEnabled: boolean;
	debugPaintEpoch: number;
	directDomUpdates: boolean;
	measureElement: (element: HTMLElement | null) => void;
	memberHeaderData: TranscriptMemberHeaderData | undefined;
	model: SessionTranscriptRowModel;
	modelHeaderData: TranscriptModelHeaderData | undefined;
	onLoadDirection: ((direction: "newer" | "older") => void) | undefined;
	onRetryTurn: ((turnId: string) => void) | undefined;
	onToggleFold: ((turnId: string) => void) | undefined;
	renderEventSubtree: ConversationTraceEventSubtreeRenderer | undefined;
	row: SessionTranscriptRow;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
	virtualItem: VirtualItem;
};

const transcriptRowContentVersions = new WeakMap<
	SessionTranscriptRow,
	string
>();
let transcriptRowContentVersionSequence = 0;

function getTranscriptRowContentVersion(row: SessionTranscriptRow) {
	const existing = transcriptRowContentVersions.get(row);
	if (existing) {
		return existing;
	}
	transcriptRowContentVersionSequence += 1;
	const version = `${row.id}:content:${transcriptRowContentVersionSequence}`;
	transcriptRowContentVersions.set(row, version);
	return version;
}

const TranscriptVirtualRow = memo(function TranscriptVirtualRow({
	active,
	debugEnabled,
	debugPaintEpoch,
	directDomUpdates,
	measureElement,
	memberHeaderData,
	model,
	modelHeaderData,
	onLoadDirection,
	onRetryTurn,
	onToggleFold,
	renderEventSubtree,
	row,
	userImageUrl,
	viewModel,
	virtualItem,
}: TranscriptVirtualRowProps) {
	const contentVersion = `${getTranscriptRowContentVersion(row)}:epoch:${debugPaintEpoch}`;
	useLayoutEffect(() => {
		if (!debugEnabled) {
			return;
		}
		recordTranscriptRowLifecycle(row.id, contentVersion, "mount");
		return () =>
			recordTranscriptRowLifecycle(row.id, contentVersion, "unmount");
	}, [contentVersion, debugEnabled, row.id]);
	const elementTimingAttributes = debugEnabled
		? { elementtiming: "transcript-row" }
		: {};
	const pendingMinHeight =
		row.kind === "turn-pending" ? row.estimatedHeight : undefined;
	const style = directDomUpdates
		? {
				left: 0,
				minHeight: pendingMinHeight,
				position: "absolute" as const,
				width: "100%",
			}
		: {
				left: 0,
				minHeight: pendingMinHeight,
				position: "absolute" as const,
				top: virtualItem.start,
				width: "100%",
			};
	return (
		<section
			{...elementTimingAttributes}
			ref={measureElement}
			aria-busy={row.kind === "turn-pending" || undefined}
			aria-current={active ? "true" : undefined}
			aria-label={getTranscriptRowLabel(row)}
			className="session-transcript-row-surface min-w-0 scroll-mt-0"
			data-index={virtualItem.index}
			data-row-id={debugEnabled ? row.id : undefined}
			data-transcript-content-version={
				debugEnabled ? contentVersion : undefined
			}
			data-transcript-row-id={row.id}
			data-transcript-row-kind={row.kind}
			data-transcript-turn-id={"turnId" in row ? row.turnId : undefined}
			style={style}
		>
			{debugEnabled ? (
				<span
					{...elementTimingAttributes}
					key={contentVersion}
					aria-hidden
					className="pointer-events-none absolute top-0 left-0 size-px overflow-hidden text-[1px] leading-none opacity-[0.01]"
				>
					{contentVersion}
				</span>
			) : null}
			<TraceExpansionNamespaceProvider
				namespace={"turnId" in row ? row.turnId : row.id}
			>
				<TranscriptRowContent
					memberHeaderData={memberHeaderData}
					model={model}
					modelHeaderData={modelHeaderData}
					onLoadDirection={onLoadDirection}
					onRetryTurn={onRetryTurn}
					onToggleFold={onToggleFold}
					renderEventSubtree={renderEventSubtree}
					row={row}
					userImageUrl={userImageUrl}
					viewModel={viewModel}
				/>
			</TraceExpansionNamespaceProvider>
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
		left.debugPaintEpoch === right.debugPaintEpoch &&
		left.directDomUpdates === right.directDomUpdates &&
		left.measureElement === right.measureElement &&
		left.memberHeaderData === right.memberHeaderData &&
		left.model === right.model &&
		left.modelHeaderData === right.modelHeaderData &&
		left.onLoadDirection === right.onLoadDirection &&
		left.onRetryTurn === right.onRetryTurn &&
		left.onToggleFold === right.onToggleFold &&
		left.renderEventSubtree === right.renderEventSubtree &&
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
	memberHeaderData,
	model,
	modelHeaderData,
	onLoadDirection,
	onRetryTurn,
	onToggleFold,
	renderEventSubtree,
	row,
	userImageUrl,
	viewModel,
}: {
	memberHeaderData: TranscriptMemberHeaderData | undefined;
	model: SessionTranscriptRowModel;
	modelHeaderData: TranscriptModelHeaderData | undefined;
	onLoadDirection: ((direction: "newer" | "older") => void) | undefined;
	onRetryTurn: ((turnId: string) => void) | undefined;
	onToggleFold: ((turnId: string) => void) | undefined;
	renderEventSubtree: ConversationTraceEventSubtreeRenderer | undefined;
	row: SessionTranscriptRow;
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	switch (row.kind) {
		case "member":
			return (
				<SessionMemberRow
					active={false}
					continues={memberHeaderData?.continues ?? true}
					headerHeight={memberHeaderData?.renderHeight}
					headingId={`${row.id}:heading`}
					items={[...row.items]}
					speakerLayout="trace-tree"
					startsTrace={row.startsTrace}
					stickyHeader={false}
					terminal={memberHeaderData?.terminal ?? false}
					userImageUrl={userImageUrl}
					userLabel={viewModel.safeUserDisplayName}
				/>
			);
		case "section": {
			const payload = row.section.payload;
			return (
				<ConversationTraceDerivedSectionRow
					agentLabel={
						modelHeaderData?.agentLabel ??
						(viewModel.safeModelUsed
							? formatModelDisplayLabel(viewModel.safeModelUsed)
							: undefined)
					}
					agentModel={modelHeaderData?.agentModel ?? viewModel.safeModelUsed}
					allEvents={payload.allEvents.events}
					continuesAfter={
						modelHeaderData?.continues ??
						(model.rowIndex.get(row.id) ?? 0) < model.rows.length - 1
					}
					isFirst={row.isFirst}
					modelDisclosureId={row.turnId}
					modelExpandable={false}
					modelHeaderHeight={modelHeaderData?.renderHeight}
					modelHeaderTerminal={modelHeaderData?.terminal}
					modelSetting={modelHeaderData?.modelSetting ?? payload.modelSetting}
					planMode={modelHeaderData?.planMode ?? payload.planMode}
					renderEventSubtree={renderEventSubtree}
					section={payload.traceSection}
					stickyModelHeader={false}
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
				<ConversationTraceDerivedSectionRow
					agentLabel={
						modelHeaderData?.agentLabel ??
						(viewModel.safeModelUsed
							? formatModelDisplayLabel(viewModel.safeModelUsed)
							: undefined)
					}
					agentModel={
						modelHeaderData?.agentModel ??
						row.agentModel ??
						viewModel.safeModelUsed
					}
					allEvents={row.allEvents}
					continuesAfter={
						modelHeaderData?.continues ??
						(model.rowIndex.get(row.id) ?? 0) < model.rows.length - 1
					}
					modelHeaderTrailing={
						<TranscriptFoldSummaryControl
							expanded={row.expanded}
							hidden={row.hidden}
							onToggle={() => onToggleFold?.(row.turnId)}
							stickyTurnId={undefined}
							turnId={row.turnId}
						/>
					}
					isFirst
					modelDisclosureId={row.turnId}
					modelExpandable={false}
					modelHeaderHeight={modelHeaderData?.renderHeight}
					modelHeaderTerminal={modelHeaderData?.terminal}
					modelSetting={modelHeaderData?.modelSetting ?? row.modelSetting}
					planMode={modelHeaderData?.planMode ?? row.planMode}
					renderEventSubtree={renderEventSubtree}
					stickyModelHeader={false}
					userImageUrl={userImageUrl}
					userLabel={viewModel.safeUserDisplayName}
				/>
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

type TranscriptViewportItem = {
	item: VirtualItem;
	speaker: SessionTurnSelection["speaker"];
	turnIndex: number;
};

export function getTranscriptVirtualViewport(input: {
	clientHeight: number;
	scrollHeight: number;
	scrollTop: number;
	turnItems: readonly TranscriptViewportItem[];
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
	let activeEntry = input.turnItems[0];
	for (const entry of input.turnItems) {
		if (entry.item.start <= focusLine) {
			activeEntry = entry;
		}
		if (entry.item.start <= focusLine && entry.item.end > focusLine) {
			activeEntry = entry;
			break;
		}
	}
	if (input.scrollTop <= 2) {
		activeEntry =
			input.turnItems.find((entry) => entry.turnIndex === 0) ?? activeEntry;
	} else if (input.scrollHeight - input.clientHeight - input.scrollTop <= 2) {
		for (let index = input.turnItems.length - 1; index >= 0; index -= 1) {
			const entry = input.turnItems[index];
			if (entry?.turnIndex === input.turnTotal - 1) {
				activeEntry = entry;
				break;
			}
		}
	}
	const activeSelection = {
		index: activeEntry?.turnIndex ?? visibleTurns[0] ?? 0,
		speaker: activeEntry?.speaker ?? "model",
	} as const;
	const viewedSelections = Array.from(
		new Map(
			input.turnItems
				.filter(
					(entry) =>
						entry.item.end > input.scrollTop &&
						entry.item.start < input.scrollTop + input.clientHeight,
				)
				.map((entry) => {
					const selection = {
						index: entry.turnIndex,
						speaker: entry.speaker,
					} as const;
					return [`${selection.index}:${selection.speaker}`, selection];
				}),
		).values(),
	);
	return {
		activeSelection,
		activeTurn: activeSelection.index,
		viewedSelections,
		visibleRange: [
			visibleTurns[0] ?? activeSelection.index,
			visibleTurns.at(-1) ?? activeSelection.index,
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
			return 196;
		case "section":
			return row.section.estimatedHeight;
		case "section-overflow":
		case "window-edge":
			return 48;
		case "turn-fold":
			return 40;
		case "turn-pending":
			return row.estimatedHeight ?? 320;
		case "turn-error":
			return 192;
		case "no-response":
			return 96;
		case "subagents-anchor":
			return 1;
	}
}

function getTranscriptRowContentFlags(
	row: SessionTranscriptRow,
): TranscriptForensicsContentFlags {
	const content =
		row.kind === "section"
			? row.section.payload.traceSection
			: row.kind === "member"
				? row.items
				: row;
	const inspected = inspectTranscriptContent(content, new WeakSet());
	const traceSection =
		row.kind === "section" ? row.section.payload.traceSection : undefined;
	return {
		charCount: inspected.charCount,
		eventCount:
			traceSection?.kind === "agent"
				? traceSection.events.length
				: row.kind === "member"
					? row.items.length
					: 0,
		hasCodeBlock:
			inspected.hasCodeBlock ||
			(traceSection?.kind === "agent" &&
				traceSection.events.some((event) => event.kind === "tool")),
	};
}

function inspectTranscriptContent(
	value: unknown,
	seen: WeakSet<object>,
): { charCount: number; hasCodeBlock: boolean } {
	if (typeof value === "string") {
		return {
			charCount: value.length,
			hasCodeBlock: value.includes("```"),
		};
	}
	if (typeof value !== "object" || value === null || seen.has(value)) {
		return { charCount: 0, hasCodeBlock: false };
	}
	seen.add(value);
	return Object.values(value).reduce(
		(result, child) => {
			const inspected = inspectTranscriptContent(child, seen);
			return {
				charCount: result.charCount + inspected.charCount,
				hasCodeBlock: result.hasCodeBlock || inspected.hasCodeBlock,
			};
		},
		{ charCount: 0, hasCodeBlock: false },
	);
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

type TranscriptAnchorScrollElement = Pick<
	HTMLElement,
	"clientHeight" | "scrollHeight" | "scrollTop"
>;

export function startTranscriptAnchorPin(input: {
	getAnchorStart: () => number | undefined;
	getScrollElement: () => TranscriptAnchorScrollElement | null;
	isActive: () => boolean;
	now?: () => number;
	onDeactivate?: () => void;
	onSettle?: (result: {
		elapsedMs: number;
		settled: boolean;
		starvedMs: number;
		via: "stable-frames" | "timeout";
	}) => void;
	onWrite: (target: number, delta: number) => void;
	requestFrame?: (callback: FrameRequestCallback) => number;
}) {
	const now = input.now ?? (() => performance.now());
	const requestFrame =
		input.requestFrame ??
		((callback) => window.requestAnimationFrame(callback));
	const startedAt = now();
	let deactivated = false;
	let settleResolved = false;
	let stableFrames = 0;
	let resolveSettled: (settled: boolean) => void = () => {};
	const settled = new Promise<boolean>((resolve) => {
		resolveSettled = resolve;
	});
	const resolveSettle = (didSettle: boolean) => {
		if (settleResolved) {
			return;
		}
		settleResolved = true;
		resolveSettled(didSettle);
	};
	const enforce = () => {
		if (deactivated) {
			return false;
		}
		if (!input.isActive()) {
			deactivated = true;
			input.onDeactivate?.();
			resolveSettle(false);
			return false;
		}
		const anchorStart = input.getAnchorStart();
		const scrollElement = input.getScrollElement();
		if (anchorStart === undefined || !scrollElement) {
			stableFrames = 0;
			return false;
		}
		const maximumScrollTop = Math.max(
			0,
			scrollElement.scrollHeight - scrollElement.clientHeight,
		);
		const target = Math.min(Math.max(0, anchorStart), maximumScrollTop);
		const delta = target - scrollElement.scrollTop;
		if (Math.abs(delta) > TRANSCRIPT_ANCHOR_DRIFT_TOLERANCE_PX) {
			stableFrames = 0;
			input.onWrite(target, delta);
			scrollElement.scrollTop = target;
			return false;
		}
		return true;
	};
	const checkFrame = () => {
		if (enforce()) {
			stableFrames += 1;
		}
		if (
			stableFrames >= TRANSCRIPT_ANCHOR_STABLE_FRAME_COUNT ||
			now() - startedAt >= TRANSCRIPT_ANCHOR_SETTLE_TIMEOUT_MS
		) {
			const didSettle = input.isActive();
			const elapsedMs = now() - startedAt;
			const via =
				stableFrames >= TRANSCRIPT_ANCHOR_STABLE_FRAME_COUNT
					? "stable-frames"
					: "timeout";
			const expectedMs =
				via === "stable-frames"
					? TRANSCRIPT_ANCHOR_STABLE_SETTLE_EXPECTATION_MS
					: TRANSCRIPT_ANCHOR_SETTLE_TIMEOUT_MS;
			input.onSettle?.({
				elapsedMs,
				settled: didSettle,
				starvedMs: Math.max(0, elapsedMs - expectedMs),
				via,
			});
			resolveSettle(didSettle);
			return;
		}
		if (!settleResolved) {
			requestFrame(checkFrame);
		}
	};
	requestFrame(checkFrame);
	return { enforce, settled };
}

function publishTranscriptAnchorDomState(
	element: HTMLElement,
	state: {
		epoch: number;
		outcome: string | undefined;
		state: "anchoring" | "free" | "soft";
		turnId: string | undefined;
	},
) {
	element.dataset.transcriptAnchorState = state.state;
	element.dataset.transcriptAnchorTurn = state.turnId ?? "";
	element.dataset.transcriptAnchorEpoch = String(state.epoch);
	if (state.outcome === undefined) {
		delete element.dataset.transcriptAnchorOutcome;
	} else {
		element.dataset.transcriptAnchorOutcome = state.outcome;
	}
}
