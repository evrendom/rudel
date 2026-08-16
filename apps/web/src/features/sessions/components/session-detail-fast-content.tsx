import type { SessionDetailOverview } from "@rudel/api-routes";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { type RefObject, useMemo, useRef, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { Button } from "@/app/ui/button";
import {
	fetchSessionDetailOverview,
	fetchSessionDetailTurn,
	isSessionDetailStaleRevisionError,
	SESSION_DETAIL_BODY_CACHE_TIME_MS,
	SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	sessionDetailOverviewPageQueryKey,
	sessionDetailTurnQueryKey,
	shouldRetrySessionDetailFastQuery,
} from "./session-detail-fast-query";
import { SessionDetailFastResponsePane } from "./session-detail-fast-response-pane";
import {
	loadRemainingSessionDetailOverviewPages,
	loadSessionDetailTurnBodies,
} from "./session-detail-full-transcript";
import { SessionDetailLayout } from "./session-detail-layout";
import {
	buildSessionDetailOverviewTurnOptions,
	buildSessionDetailOverviewViewModel,
} from "./session-detail-overview-model";
import type { SessionDetailSearchLoadState } from "./session-detail-search";
import type {
	SessionContinuousTurnVirtualizerHandle,
	SessionTurnTableVirtualizerHandle,
} from "./session-detail-virtualization";
import type { SessionTurnSelection } from "./session-turn-table-selection";

const columnBottomPaddingClassName =
	"pb-[calc(5rem+env(safe-area-inset-bottom))]";

type PageLoadState =
	| { status: "idle" }
	| { status: "loading" }
	| { error: unknown; status: "error" };

export function SessionDetailFastContent({
	firstOverview,
	initialSelectedTurnId,
	onStaleRevision,
	responseScrollRef,
	userImageUrl,
	userMap,
}: {
	firstOverview: SessionDetailOverview;
	initialSelectedTurnId: string | undefined;
	onStaleRevision: (error: unknown, selectedTurnId?: string) => void;
	responseScrollRef: RefObject<HTMLDivElement | null>;
	userImageUrl: string | undefined;
	userMap: Record<string, string>;
}) {
	const queryClient = useQueryClient();
	const [additionalPages, setAdditionalPages] = useState<
		readonly SessionDetailOverview[]
	>([]);
	const [pageLoad, setPageLoad] = useState<PageLoadState>({ status: "idle" });
	const [searchLoad, setSearchLoad] = useState<SessionDetailSearchLoadState>({
		status: "idle",
	});
	const [selection, setSelection] = useState<SessionTurnSelection>(() => ({
		index: Math.max(
			firstOverview.turnPage.items.findIndex(
				(item) => item.turnId === initialSelectedTurnId,
			),
			0,
		),
		speaker: "model",
	}));
	const searchLoadControllerRef = useRef<AbortController | undefined>(
		undefined,
	);
	const turnTableSectionRef = useRef<HTMLElement>(null);
	const responseVirtualizerRef =
		useRef<SessionContinuousTurnVirtualizerHandle>(null);
	const turnTableVirtualizerRef =
		useRef<SessionTurnTableVirtualizerHandle>(null);
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
	const latestPage = pages.at(-1) ?? firstOverview;
	const nextCursor = latestPage.turnPage.nextCursor;
	const selectedOption = options[selection.index];
	const handleStaleRevision = (error: unknown) =>
		onStaleRevision(error, selectedOption?.turnId);
	const hasBucketedActivity = options.some(
		(option) =>
			items.find((item) => item.turnId === option.turnId)
				?.activityResolution === "bucketed",
	);

	useMountEffect(() => () => {
		searchLoadControllerRef.current?.abort();
	});

	function handleSelection(nextSelection: SessionTurnSelection) {
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
		responseVirtualizerRef.current?.scrollToIndex(nextSelection.index, {
			align: "start",
			behavior: "smooth",
		});
	}

	function handleContinuousTurnFocus(nextIndex: number) {
		const nextSelection = { ...selection, index: nextIndex };
		setSelection(nextSelection);
		turnTableVirtualizerRef.current?.scrollToSelection(nextSelection);
	}

	async function loadPage(cursor: string, signal?: AbortSignal) {
		signal?.throwIfAborted();
		const input = {
			revision: firstOverview.revision,
			sessionId: firstOverview.session.sessionId,
			turnCursor: cursor,
		};
		const parsed = await queryClient.fetchQuery({
			queryFn: ({ signal: querySignal }) =>
				fetchSessionDetailOverview(
					{
						expectedRevision: input.revision,
						sessionId: input.sessionId,
						turnCursor: input.turnCursor,
					},
					querySignal,
				),
			queryKey: sessionDetailOverviewPageQueryKey(input),
			retry: shouldRetrySessionDetailFastQuery,
			staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
		});
		signal?.throwIfAborted();
		return parsed.overview;
	}

	async function handleLoadNextPage() {
		if (!nextCursor || pageLoad.status === "loading") {
			return;
		}
		setPageLoad({ status: "loading" });
		try {
			const page = await loadPage(nextCursor);
			setAdditionalPages((current) => [...current, page]);
			setPageLoad({ status: "idle" });
		} catch (error) {
			if (isSessionDetailStaleRevisionError(error)) {
				handleStaleRevision(error);
				return;
			}
			setPageLoad({ error, status: "error" });
		}
	}

	async function loadSearchIndex() {
		const controller = new AbortController();
		searchLoadControllerRef.current?.abort();
		searchLoadControllerRef.current = controller;
		const streamedBodies = new Map(
			"bodies" in searchLoad ? searchLoad.bodies : [],
		);
		setSearchLoad({
			bodies: streamedBodies,
			completed: 0,
			phase: "pages",
			status: "loading",
			total: 0,
		});

		try {
			const remainingPages = await loadRemainingSessionDetailOverviewPages({
				first: latestPage,
				loadPage: (cursor) => loadPage(cursor, controller.signal),
				signal: controller.signal,
			});
			const allPages = [...pages, ...remainingPages];
			setAdditionalPages(allPages.slice(1));
			const allTurns = allPages.flatMap((page) => page.turnPage.items);
			setSearchLoad({
				bodies: streamedBodies,
				completed: 0,
				phase: "turns",
				status: "loading",
				total: allTurns.filter((turn) => turn.hasBody).length,
			});
			const result = await loadSessionDetailTurnBodies({
				concurrency: 3,
				loadTurn: (turn) =>
					loadTurnWithCache({
						controller,
						queryClient,
						revision: firstOverview.revision,
						sessionId: firstOverview.session.sessionId,
						turnId: turn.turnId,
					}),
				onProgress: ({ completed, total }) => {
					if (!controller.signal.aborted) {
						setSearchLoad({
							bodies: new Map(streamedBodies),
							completed,
							phase: "turns",
							status: "loading",
							total,
						});
					}
				},
				onTurnLoaded: (turn, body) => {
					if (!controller.signal.aborted) {
						streamedBodies.set(turn.turnId, body);
						setSearchLoad((current) =>
							current.status === "loading"
								? { ...current, bodies: new Map(streamedBodies) }
								: current,
						);
					}
				},
				signal: controller.signal,
				shouldStop: isSessionDetailStaleRevisionError,
				turns: allTurns,
			});
			if (result.failures.size > 0) {
				setSearchLoad({
					bodies: result.bodies,
					failedTurnIds: [...result.failures.keys()],
					status: "failed",
				});
			} else {
				setSearchLoad({ bodies: result.bodies, status: "complete" });
			}
		} catch (error) {
			if (controller.signal.aborted) {
				return;
			}
			if (isSessionDetailStaleRevisionError(error)) {
				handleStaleRevision(error);
				return;
			}
			setSearchLoad({
				bodies: streamedBodies,
				failedTurnIds: [],
				status: "failed",
			});
		} finally {
			if (searchLoadControllerRef.current === controller) {
				searchLoadControllerRef.current = undefined;
			}
		}
	}

	function handleSearchFocus() {
		if (searchLoad.status === "loading" || searchLoad.status === "complete") {
			return;
		}
		void loadSearchIndex();
	}

	function handleCancelSearchLoad() {
		searchLoadControllerRef.current?.abort(
			new DOMException("Transcript indexing was cancelled.", "AbortError"),
		);
		setSearchLoad((current) =>
			current.status === "loading"
				? {
						bodies: current.bodies,
						completed: current.completed,
						status: "cancelled",
						total: current.total,
					}
				: current,
		);
	}

	return (
		<div className="grid h-full min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] overflow-hidden bg-(--session-overview-surface) [--session-overview-accent:#266df0] [--session-overview-border:#eeeff1] [--session-overview-hover:#f6f7f7] [--session-overview-muted:rgba(0,0,0,0.63)] [--session-overview-subtle:rgba(0,0,0,0.5)] [--session-overview-surface:#fff] [--session-overview-text:#101112] [font-family:Inter,sans-serif] dark:[--session-overview-border:rgba(255,255,255,0.08)] dark:[--session-overview-hover:rgba(255,255,255,0.05)] dark:[--session-overview-muted:rgba(255,255,255,0.65)] dark:[--session-overview-subtle:rgba(255,255,255,0.5)] dark:[--session-overview-surface:#111827] dark:[--session-overview-text:#f8fafc]">
			<div className="flex min-h-0 flex-col">
				{hasBucketedActivity ? (
					<output className="border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-(--session-overview-text)">
						Dense activity is shown at reduced timeline resolution; token totals
						remain exact.
					</output>
				) : null}
				<SessionDetailLayout
					bottomPaddingClassName={columnBottomPaddingClassName}
					onContinuousTurnFocus={handleContinuousTurnFocus}
					onSelect={handleSelection}
					options={options}
					responsePane={({ onContinuousTurnViewportChange }) => (
						<SessionDetailFastResponsePane
							bottomPaddingClassName={columnBottomPaddingClassName}
							onCancelSearchLoad={handleCancelSearchLoad}
							onContinuousTurnFocus={handleContinuousTurnFocus}
							onContinuousTurnViewportChange={(activeIndex, visibleRange) => {
								onContinuousTurnViewportChange(activeIndex, visibleRange);
								if (nextCursor && visibleRange[1] >= options.length - 5) {
									void handleLoadNextPage();
								}
							}}
							onSearchFocus={handleSearchFocus}
							onSearchHit={(index) =>
								handleSelection({ index, speaker: "model" })
							}
							onStaleRevision={handleStaleRevision}
							options={options}
							responseScrollRef={responseScrollRef}
							revision={firstOverview.revision}
							searchLoad={searchLoad}
							selection={selection}
							sessionId={firstOverview.session.sessionId}
							subagents={firstOverview.subagents}
							userImageUrl={userImageUrl}
							viewModel={viewModel}
							virtualizerRef={responseVirtualizerRef}
						/>
					)}
					responseScrollRef={responseScrollRef}
					selection={selection}
					turnTableFooter={
						<TurnPageFooter
							loaded={items.length}
							onLoad={() => {
								void handleLoadNextPage();
							}}
							state={pageLoad}
							total={firstOverview.turnPage.total}
						/>
					}
					turnTableSectionRef={turnTableSectionRef}
					turnTableVirtualizerRef={turnTableVirtualizerRef}
					userImageUrl={userImageUrl}
					viewModel={viewModel}
				/>
			</div>
		</div>
	);
}

async function loadTurnWithCache(input: {
	controller: AbortController;
	queryClient: QueryClient;
	revision: string;
	sessionId: string;
	turnId: string;
}) {
	input.controller.signal.throwIfAborted();
	const turnInput = {
		revision: input.revision,
		sessionId: input.sessionId,
		turnId: input.turnId,
	};
	const result = await input.queryClient.fetchQuery({
		gcTime: SESSION_DETAIL_BODY_CACHE_TIME_MS,
		queryFn: ({ signal }) => fetchSessionDetailTurn(turnInput, signal),
		queryKey: sessionDetailTurnQueryKey(turnInput),
		retry: shouldRetrySessionDetailFastQuery,
		staleTime: SESSION_DETAIL_IMMUTABLE_STALE_TIME_MS,
	});
	input.controller.signal.throwIfAborted();
	return result;
}

function TurnPageFooter({
	loaded,
	onLoad,
	state,
	total,
}: {
	loaded: number;
	onLoad: () => void;
	state: PageLoadState;
	total: number;
}) {
	if (loaded >= total) {
		return null;
	}
	if (state.status === "loading") {
		return (
			<output className="border-t border-(--session-overview-border) px-3 py-2 text-center text-xs text-(--session-overview-muted)">
				Loading more turns…
			</output>
		);
	}
	return (
		<div className="flex items-center justify-between gap-2 border-t border-(--session-overview-border) px-3 py-2">
			<p className="text-xs text-(--session-overview-muted)">
				{state.status === "error"
					? "More turns could not be loaded."
					: `${loaded.toLocaleString()} of ${total.toLocaleString()} turns loaded`}
			</p>
			<Button onClick={onLoad} size="sm" type="button" variant="outline">
				{state.status === "error" ? "Retry" : "Load more"}
			</Button>
		</div>
	);
}
