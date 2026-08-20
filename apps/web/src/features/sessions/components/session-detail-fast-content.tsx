import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	type RefObject,
	useCallback,
	// biome-ignore lint/style/noRestrictedImports: revision-bound query errors synchronize the fast-path fallback.
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import {
	fetchSessionDetailOverview,
	fetchSessionDetailSpine,
	fetchSessionDetailWindow,
	isSessionDetailStaleRevisionError,
	SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	SESSION_DETAIL_WINDOW_CACHE_TIME_MS,
	sessionDetailOverviewPageQueryKey,
	sessionDetailSpineQueryKey,
	sessionDetailTurnQueryKey,
	sessionDetailWindowQueryKey,
	shouldRetrySessionDetailFastQuery,
} from "./session-detail-fast-query";
import type { NormalizedSessionDetailOverview } from "./session-detail-fast-response";
import { SessionDetailFastResponsePane } from "./session-detail-fast-response-pane";
import { loadRemainingSessionDetailOverviewPages } from "./session-detail-full-transcript";
import { SessionDetailLayout } from "./session-detail-layout";
import {
	buildSessionDetailOverviewTurnOptions,
	buildSessionDetailOverviewViewModel,
} from "./session-detail-overview-model";
import {
	applySessionDetailSkeletonDebugMode,
	getSessionDetailSkeletonDebugKey,
	resolveSessionDetailSkeletonDebugMode,
} from "./session-detail-skeleton-debug";
import type { SessionTranscriptListHandle } from "./session-transcript-list";
import type { SessionTurnTableVirtualizerHandle } from "./session-turn-table";
import type { SessionTurnSelection } from "./session-turn-table-selection";
import { recordAnchorJournal } from "./transcript-forensics";

const columnBottomPaddingClassName =
	"pb-[calc(5rem+env(safe-area-inset-bottom))]";

export function SessionDetailFastContent({
	firstOverview,
	initialSelectedTurnId,
	onStaleRevision,
	responseScrollRef,
	userImageUrl,
	userMap,
}: {
	firstOverview: NormalizedSessionDetailOverview;
	initialSelectedTurnId: string | undefined;
	onStaleRevision: (error: unknown, selectedTurnId?: string) => void;
	responseScrollRef: RefObject<HTMLDivElement | null>;
	userImageUrl: string | undefined;
	userMap: Record<string, string>;
}) {
	const queryClient = useQueryClient();
	const [searchParams, setSearchParams] = useSearchParams();
	const requestedTurnId = searchParams.get("turn") ?? undefined;
	const [selectedActivityAnchor, setSelectedActivityAnchor] = useState<{
		eventId: string | undefined;
		requestId: number;
		turnId: string | undefined;
	}>(() => ({ eventId: undefined, requestId: 0, turnId: undefined }));
	const [selection, setSelection] = useState<SessionTurnSelection>(() => ({
		index: Math.max(
			firstOverview.turnPage.items.findIndex(
				(item) => item.turnId === (requestedTurnId ?? initialSelectedTurnId),
			),
			0,
		),
		speaker: "model",
	}));
	const turnTableSectionRef = useRef<HTMLElement>(null);
	const turnTableVirtualizerRef =
		useRef<SessionTurnTableVirtualizerHandle>(null);
	const transcriptListRef = useRef<SessionTranscriptListHandle>(null);
	const anchorRequestIdRef = useRef(0);
	const prefetchTimeoutRef = useRef<number>(undefined);
	const skeletonDebugMode = useMemo(
		() =>
			resolveSessionDetailSkeletonDebugMode(
				searchParams.get("skeletons"),
				import.meta.env.DEV,
			),
		[searchParams],
	);
	const windowModeKey = getSessionDetailSkeletonDebugKey(skeletonDebugMode);
	const spineInput = useMemo(
		() => ({
			revision: firstOverview.revision,
			sessionId: firstOverview.session.sessionId,
		}),
		[firstOverview.revision, firstOverview.session.sessionId],
	);
	const spineQuery = useQuery({
		queryFn: ({ signal }) => fetchSessionDetailSpine(spineInput, signal),
		queryKey: sessionDetailSpineQueryKey(spineInput),
		retry: shouldRetrySessionDetailFastQuery,
		staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	});
	const remainingOverviewPagesQuery = useQuery({
		queryFn: ({ signal }) =>
			loadRemainingSessionDetailOverviewPages({
				first: firstOverview,
				loadPage: async (cursor) => {
					const input = {
						revision: firstOverview.revision,
						sessionId: firstOverview.session.sessionId,
						turnCursor: cursor,
					};
					const parsed = await queryClient.fetchQuery({
						queryFn: () =>
							fetchSessionDetailOverview(
								{
									expectedRevision: input.revision,
									sessionId: input.sessionId,
									turnCursor: input.turnCursor,
								},
								signal,
							),
						queryKey: sessionDetailOverviewPageQueryKey(input),
						retry: shouldRetrySessionDetailFastQuery,
						staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
					});
					return parsed.overview;
				},
				signal,
			}),
		queryKey: [
			"session-detail",
			"all-overview-pages",
			firstOverview.session.sessionId,
			firstOverview.revision,
		],
		retry: shouldRetrySessionDetailFastQuery,
		staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	});
	const additionalPages = remainingOverviewPagesQuery.data ?? [];
	const pages = useMemo(
		() => [firstOverview, ...additionalPages],
		[additionalPages, firstOverview],
	);
	const items = useMemo(
		() => pages.flatMap((page) => page.turnPage.items),
		[pages],
	);
	const options = useMemo(
		() => buildSessionDetailOverviewTurnOptions(items),
		[items],
	);
	const viewModel = useMemo(
		() => buildSessionDetailOverviewViewModel(firstOverview, userMap),
		[firstOverview, userMap],
	);
	const selectedOption = options[selection.index];
	const selectedTurnId =
		selectedActivityAnchor.turnId ?? requestedTurnId ?? selectedOption?.turnId;
	const anchorTurnId = selectedActivityAnchor.turnId ?? requestedTurnId;
	const anchorTurnSource =
		selectedActivityAnchor.turnId === undefined
			? ("url-fallback" as const)
			: ("click-pair" as const);
	useEffect(() => {
		if (!anchorTurnId) {
			return;
		}
		recordAnchorJournal({
			requestId: selectedActivityAnchor.requestId,
			source: anchorTurnSource,
			turnId: anchorTurnId,
			type: "anchorDerive",
		});
	}, [anchorTurnId, anchorTurnSource, selectedActivityAnchor.requestId]);
	useEffect(() => {
		if (
			spineQuery.error &&
			isSessionDetailStaleRevisionError(spineQuery.error)
		) {
			onStaleRevision(spineQuery.error, selectedTurnId);
		}
	}, [onStaleRevision, selectedTurnId, spineQuery.error]);
	useEffect(() => {
		if (
			remainingOverviewPagesQuery.error &&
			isSessionDetailStaleRevisionError(remainingOverviewPagesQuery.error)
		) {
			onStaleRevision(remainingOverviewPagesQuery.error, selectedTurnId);
		}
	}, [onStaleRevision, remainingOverviewPagesQuery.error, selectedTurnId]);
	useEffect(
		() => () => {
			if (prefetchTimeoutRef.current !== undefined) {
				window.clearTimeout(prefetchTimeoutRef.current);
			}
		},
		[],
	);
	const handleStaleRevision = (error: unknown) =>
		onStaleRevision(error, selectedTurnId);
	const hasBucketedActivity = options.some(
		(option) =>
			items.find((item) => item.turnId === option.turnId)
				?.activityResolution === "bucketed",
	);
	const handlePrefetchTurn = useCallback(
		(turnId: string, immediate: boolean) => {
			if (prefetchTimeoutRef.current !== undefined) {
				window.clearTimeout(prefetchTimeoutRef.current);
			}
			const prefetch = () => {
				prefetchTimeoutRef.current = undefined;
				const request = {
					anchorTurnId: turnId,
					includeBodies: true as const,
					mode: "anchor" as const,
					revision: firstOverview.revision,
					sessionId: firstOverview.session.sessionId,
				};
				void queryClient.prefetchQuery({
					gcTime: SESSION_DETAIL_WINDOW_CACHE_TIME_MS,
					queryFn: async ({ signal }) =>
						applySessionDetailSkeletonDebugMode(
							await fetchSessionDetailWindow(request, signal),
							skeletonDebugMode,
							signal,
						),
					queryKey: sessionDetailWindowQueryKey(request, windowModeKey),
					retry: shouldRetrySessionDetailFastQuery,
					staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
				});
			};
			if (immediate) {
				prefetch();
				return;
			}
			prefetchTimeoutRef.current = window.setTimeout(prefetch, 75);
		},
		[
			firstOverview.revision,
			firstOverview.session.sessionId,
			queryClient,
			skeletonDebugMode,
			windowModeKey,
		],
	);

	function handleSelection(
		nextSelection: SessionTurnSelection,
		activityEventId: string | undefined = undefined,
	) {
		const nextTurnId = options[nextSelection.index]?.turnId;
		if (selectedOption) {
			void queryClient.cancelQueries({
				exact: true,
				queryKey: sessionDetailTurnQueryKey({
					revision: firstOverview.revision,
					sessionId: firstOverview.session.sessionId,
					turnId: selectedOption.turnId,
				}),
			});
		}
		setSelection(nextSelection);
		if (nextTurnId) {
			const requestId = anchorRequestIdRef.current + 1;
			anchorRequestIdRef.current = requestId;
			setSelectedActivityAnchor({
				eventId: activityEventId,
				requestId,
				turnId: nextTurnId,
			});
			recordAnchorJournal({
				requestId,
				turnId: nextTurnId,
				type: "anchorRequest",
			});
			void transcriptListRef.current?.scrollToTurn(nextTurnId, {
				expandFolds: activityEventId !== undefined,
				speaker: nextSelection.speaker,
			});
			setSearchParams(
				(current) => {
					const next = new URLSearchParams(current);
					next.set("turn", nextTurnId);
					return next;
				},
				{ replace: true },
			);
		}
	}

	return (
		<div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden bg-(--session-overview-surface) [--session-overview-accent:#266df0] [--session-overview-border:#eeeff1] [--session-overview-hover:#f6f7f7] [--session-overview-muted:rgba(0,0,0,0.63)] [--session-overview-subtle:rgba(0,0,0,0.5)] [--session-overview-surface:#fcfcfc] [--session-overview-text:#101112] [font-family:Inter,sans-serif] dark:[--session-overview-border:rgba(255,255,255,0.08)] dark:[--session-overview-hover:rgba(255,255,255,0.05)] dark:[--session-overview-muted:rgba(255,255,255,0.65)] dark:[--session-overview-subtle:rgba(255,255,255,0.5)] dark:[--session-overview-surface:#111827] dark:[--session-overview-text:#f8fafc]">
			<div className="flex min-h-0 flex-col">
				{hasBucketedActivity ? (
					<output className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-(--session-overview-text)">
						Dense activity is shown at reduced timeline resolution; token totals
						remain exact.
					</output>
				) : null}
				<SessionDetailLayout
					onPrefetchTurn={handlePrefetchTurn}
					onSelect={handleSelection}
					options={options}
					responsePane={({ onMinimumWidthChange, viewportStore }) => (
						<SessionDetailFastResponsePane
							activityTotals={firstOverview.activityTotals}
							anchorEventId={selectedActivityAnchor.eventId}
							anchorEventRequestId={selectedActivityAnchor.requestId}
							anchorRequestTurnId={selectedActivityAnchor.turnId}
							anchorTurnId={anchorTurnId}
							bottomPaddingClassName={columnBottomPaddingClassName}
							onMinimumWidthChange={onMinimumWidthChange}
							onSelectTurn={({ eventId, turnIndex }) => {
								handleSelection(
									{ index: turnIndex, speaker: "model" },
									eventId,
								);
							}}
							onStaleRevision={handleStaleRevision}
							options={options}
							overviewLoading={remainingOverviewPagesQuery.isPending}
							responseScrollRef={responseScrollRef}
							revision={firstOverview.revision}
							selection={selection}
							sessionId={firstOverview.session.sessionId}
							subagents={firstOverview.subagents}
							userImageUrl={userImageUrl}
							viewModel={viewModel}
							viewportStore={viewportStore}
							transcriptListRef={transcriptListRef}
							turnSpine={spineQuery.data?.turns ?? []}
						/>
					)}
					selection={selection}
					turnTableSectionRef={turnTableSectionRef}
					turnTableVirtualizerRef={turnTableVirtualizerRef}
					userImageUrl={userImageUrl}
					viewModel={viewModel}
				/>
			</div>
		</div>
	);
}
