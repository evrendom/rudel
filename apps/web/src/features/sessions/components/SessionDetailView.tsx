import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	useCallback,
	// biome-ignore lint/style/noRestrictedImports: the tab title must update when async session details reveal the model and when client-side navigation changes the session id.
	useEffect,
	useRef,
} from "react";
import { Button } from "@/app/ui/button";
import { Skeleton } from "@/app/ui/skeleton";
import { useTrackProductPageView } from "@/features/analytics/tracking/useTrackProductPageView";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import type { SessionNavigation } from "@/features/sessions/session-navigation";
import { useShellHeaderPortal } from "@/features/shell/shell-header-portal";
import { useUserMap } from "@/features/workspace/hooks/useUserMap";
import { SessionDetailContent } from "./session-detail-content";
import { SessionDetailFastContent } from "./session-detail-fast-content";
import { isSessionDetailFastPathEnabled } from "./session-detail-fast-path";
import {
	fetchSessionDetailOverview,
	SESSION_DETAIL_OVERVIEW_STALE_TIME_MS,
	sessionDetailBodyQueryPrefix,
	sessionDetailFirstOverviewQueryKey,
	sessionDetailOverviewPageQueryKey,
	sessionDetailRevisionQueryPrefix,
	sessionDetailWindowQueryPrefix,
	shouldRetrySessionDetailFastQuery,
} from "./session-detail-fast-query";
import { SessionDetailHeader } from "./session-detail-header";
import { buildSessionDetailOverviewViewModel } from "./session-detail-overview-model";
import { fetchSessionDetail } from "./session-detail-query";
import { shouldRetrySessionDetailQuery } from "./session-detail-response";
import { buildSessionDetailViewModel } from "./session-detail-view-model";
import {
	canRetrySessionDetailError,
	getSessionDetailErrorState,
} from "./session-detail-view-utils";

type SessionDetailViewProps = {
	navigation: SessionNavigation;
	position: number | undefined;
	sessionId: string;
	totalSessions: number;
	onReturn: () => void;
};

const SESSION_LOADING_METRICS = [
	"turns",
	"duration",
	"cost",
	"input",
	"output",
	"tools",
] as const;

function SessionDetailContentLoadingView() {
	return (
		<div
			aria-busy="true"
			className="grid h-full min-h-0 min-w-0 grid-rows-[5rem_7rem_minmax(0,1fr)]"
		>
			<output className="sr-only">Loading session details</output>
			<div className="grid grid-cols-6 gap-px border-b border-(--dashboardy-divider) bg-(--dashboardy-divider)">
				{SESSION_LOADING_METRICS.map((metric) => (
					<div key={metric} className="bg-(--dashboardy-surface) px-4 py-3">
						<Skeleton className="mb-2 h-3 w-12 rounded-sm" />
						<Skeleton className="h-4 w-20 rounded-sm" />
					</div>
				))}
			</div>
			<Skeleton className="m-3 rounded-sm" />
			<div className="grid min-h-0 grid-cols-2 gap-px bg-(--dashboardy-divider)">
				<Skeleton className="rounded-none bg-(--dashboardy-surface)" />
				<Skeleton className="rounded-none bg-(--dashboardy-surface)" />
			</div>
		</div>
	);
}

function SessionDetailStateMessage({
	description,
	isRetrying = false,
	onRetry,
	title,
}: {
	description: string | undefined;
	isRetrying?: boolean;
	onRetry?: () => void;
	title: string;
}) {
	return (
		<div className="flex h-full items-center justify-center px-6 py-12">
			<div className="dashboardy-card rounded-[1.5rem] border px-8 py-10 text-center shadow-none">
				<p className="mb-2 text-lg font-semibold text-(--dashboardy-heading)">
					{title}
				</p>
				{description ? (
					<p className="text-sm text-(--dashboardy-muted)">{description}</p>
				) : null}
				{onRetry ? (
					<Button
						className="mt-5"
						disabled={isRetrying}
						onClick={onRetry}
						size="sm"
						type="button"
						variant="outline"
					>
						{isRetrying ? "Trying again…" : "Try again"}
					</Button>
				) : null}
			</div>
		</div>
	);
}

export function SessionDetailView(props: SessionDetailViewProps) {
	return isSessionDetailFastPathEnabled() ? (
		<SessionDetailFastView {...props} />
	) : (
		<SessionDetailLegacyView {...props} />
	);
}

function SessionDetailLegacyView({
	navigation,
	position,
	sessionId,
	totalSessions,
	onReturn,
}: SessionDetailViewProps) {
	const headerRef = useRef<HTMLElement>(null);
	const responseScrollRef = useRef<HTMLDivElement>(null);
	const shellHeaderPortal = useShellHeaderPortal();

	const handleHeaderWheel = useCallback((event: WheelEvent) => {
		if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();
		if (responseScrollRef.current) {
			responseScrollRef.current.scrollTop += event.deltaY;
		}
	}, []);
	const setHeaderElement = useCallback(
		(element: HTMLElement | null) => {
			headerRef.current?.removeEventListener("wheel", handleHeaderWheel);
			headerRef.current = element;
			element?.addEventListener("wheel", handleHeaderWheel, { passive: false });
		},
		[handleHeaderWheel],
	);
	const { userMap, avatarMap } = useUserMap();
	const { data, error, isFetching, isLoading, refetch } = useQuery({
		// Namespaced away from the oRPC-derived key: this cache entry stores the
		// parsed boundary shape, not the raw procedure response.
		queryKey: ["session-detail-parsed", sessionId],
		queryFn: ({ signal }) => fetchSessionDetail(sessionId, signal),
		enabled: sessionId.length > 0,
		retry: shouldRetrySessionDetailQuery,
	});
	const session = data?.session;

	useTrackProductPageView({
		isLoading,
		isError: Boolean(error),
		hasData: Boolean(session),
	});

	const viewModel = session
		? buildSessionDetailViewModel(session, userMap)
		: undefined;
	const sessionTabTitle = `${
		viewModel?.safeModelUsed
			? formatModelDisplayLabel(viewModel.safeModelUsed)
			: "Session"
	} · ${sessionId}`;

	useEffect(() => {
		const previousTitle = document.title;
		document.title = sessionTabTitle;

		return () => {
			document.title = previousTitle;
		};
	}, [sessionTabTitle]);

	const errorState = getSessionDetailErrorState(error);
	const hasShapeWarning = (data?.shapeIssueFields.length ?? 0) > 0;

	return (
		<div className="dashboardy-page flex h-full min-h-0 min-w-0 flex-1 flex-col bg-(--dashboardy-surface) text-(--dashboardy-heading)">
			<SessionDetailHeader
				avatarMap={avatarMap}
				headerRef={setHeaderElement}
				hideMetrics
				isLoading={isLoading}
				navigation={navigation}
				onReturn={onReturn}
				portalHost={shellHeaderPortal}
				position={position}
				sessionId={sessionId}
				totalSessions={totalSessions}
				viewModel={viewModel}
			/>

			<div
				key={sessionId}
				className="relative min-h-0 min-w-0 flex-1 overflow-hidden"
			>
				{isLoading ? <SessionDetailContentLoadingView /> : null}
				{!isLoading && errorState ? (
					<SessionDetailStateMessage
						description={errorState.description}
						isRetrying={isFetching}
						onRetry={
							canRetrySessionDetailError(error)
								? () => {
										void refetch();
									}
								: undefined
						}
						title={errorState.title}
					/>
				) : null}
				{!isLoading && !errorState && viewModel ? (
					<div className="flex h-full min-h-0 flex-col">
						{hasShapeWarning ? (
							<output className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-(--dashboardy-heading)">
								Some session fields were unavailable. The rest of the transcript
								is shown with safe defaults.
							</output>
						) : null}
						<div className="min-h-0 flex-1">
							<SessionDetailContent
								key={`${viewModel.safeSessionId}:expanded-speakers-v1`}
								responseScrollRef={responseScrollRef}
								userImageUrl={avatarMap[viewModel.safeUserId]}
								viewModel={viewModel}
							/>
						</div>
					</div>
				) : null}
				{!isLoading && !errorState && !viewModel ? (
					<SessionDetailStateMessage
						description={undefined}
						title="Session Not Found"
					/>
				) : null}
			</div>
		</div>
	);
}

function SessionDetailFastView({
	navigation,
	position,
	sessionId,
	totalSessions,
	onReturn,
}: SessionDetailViewProps) {
	const headerRef = useRef<HTMLElement>(null);
	const responseScrollRef = useRef<HTMLDivElement>(null);
	const preservedTurnIdRef = useRef<string | undefined>(undefined);
	const shellHeaderPortal = useShellHeaderPortal();
	const queryClient = useQueryClient();
	const handleHeaderWheel = useCallback((event: WheelEvent) => {
		if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		if (responseScrollRef.current) {
			responseScrollRef.current.scrollTop += event.deltaY;
		}
	}, []);
	const setHeaderElement = useCallback(
		(element: HTMLElement | null) => {
			headerRef.current?.removeEventListener("wheel", handleHeaderWheel);
			headerRef.current = element;
			element?.addEventListener("wheel", handleHeaderWheel, { passive: false });
		},
		[handleHeaderWheel],
	);
	const { userMap, avatarMap } = useUserMap();
	const overviewQuery = useQuery({
		enabled: sessionId.length > 0,
		queryFn: async ({ signal }) => {
			const parsed = await fetchSessionDetailOverview({ sessionId }, signal);
			queryClient.setQueryData(
				sessionDetailOverviewPageQueryKey({
					revision: parsed.overview.revision,
					sessionId,
					turnCursor: "first",
				}),
				parsed,
			);
			return parsed;
		},
		queryKey: sessionDetailFirstOverviewQueryKey(sessionId),
		retry: shouldRetrySessionDetailFastQuery,
		staleTime: SESSION_DETAIL_OVERVIEW_STALE_TIME_MS,
	});
	const overview = overviewQuery.data?.overview;
	const viewModel = overview
		? buildSessionDetailOverviewViewModel(overview, userMap)
		: undefined;
	const sessionTabTitle = `${
		viewModel?.safeModelUsed
			? formatModelDisplayLabel(viewModel.safeModelUsed)
			: "Session"
	} · ${sessionId}`;

	useEffect(() => {
		const previousTitle = document.title;
		document.title = sessionTabTitle;
		return () => {
			document.title = previousTitle;
		};
	}, [sessionTabTitle]);

	useTrackProductPageView({
		isLoading: overviewQuery.isLoading,
		isError: Boolean(overviewQuery.error),
		hasData: Boolean(overview),
	});

	function handleStaleRevision(error: unknown, selectedTurnId?: string) {
		preservedTurnIdRef.current = selectedTurnId;
		if (overview) {
			void queryClient.cancelQueries({
				queryKey: sessionDetailRevisionQueryPrefix(
					sessionId,
					overview.revision,
				),
			});
			queryClient.removeQueries({
				queryKey: sessionDetailRevisionQueryPrefix(
					sessionId,
					overview.revision,
				),
			});
		}
		void queryClient.cancelQueries({
			queryKey: sessionDetailBodyQueryPrefix(sessionId),
		});
		queryClient.removeQueries({
			queryKey: sessionDetailBodyQueryPrefix(sessionId),
		});
		void queryClient.cancelQueries({
			queryKey: sessionDetailWindowQueryPrefix(sessionId),
		});
		queryClient.removeQueries({
			queryKey: sessionDetailWindowQueryPrefix(sessionId),
		});
		console.info("[SessionDetailView] Refreshing a stale session revision", {
			code:
				typeof error === "object" && error !== null && "code" in error
					? error.code
					: "STALE_REVISION",
			sessionId,
		});
		void overviewQuery.refetch();
	}

	const errorState = getSessionDetailErrorState(overviewQuery.error);
	const hasShapeWarning =
		(overviewQuery.data?.shapeIssueFields.length ?? 0) > 0;

	return (
		<div className="dashboardy-page flex h-full min-h-0 min-w-0 flex-1 flex-col bg-(--dashboardy-surface) text-(--dashboardy-heading)">
			<SessionDetailHeader
				avatarMap={avatarMap}
				headerRef={setHeaderElement}
				hideMetrics
				isLoading={overviewQuery.isLoading}
				navigation={navigation}
				onReturn={onReturn}
				portalHost={shellHeaderPortal}
				position={position}
				sessionId={sessionId}
				totalSessions={totalSessions}
				viewModel={viewModel}
			/>

			<div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
				{overviewQuery.isLoading ? <SessionDetailContentLoadingView /> : null}
				{!overviewQuery.isLoading && errorState ? (
					<SessionDetailStateMessage
						description={errorState.description}
						isRetrying={overviewQuery.isFetching}
						onRetry={
							canRetrySessionDetailError(overviewQuery.error)
								? () => {
										void overviewQuery.refetch();
									}
								: undefined
						}
						title={errorState.title}
					/>
				) : null}
				{!overviewQuery.isLoading && !errorState && overview && viewModel ? (
					<div className="flex h-full min-h-0 flex-col">
						{hasShapeWarning ? (
							<output className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-(--dashboardy-heading)">
								Some session fields were unavailable. Safe overview values are
								shown.
							</output>
						) : null}
						<div className="min-h-0 flex-1">
							<SessionDetailFastContent
								key={`${sessionId}:${overview.revision}`}
								firstOverview={overview}
								initialSelectedTurnId={preservedTurnIdRef.current}
								onStaleRevision={handleStaleRevision}
								responseScrollRef={responseScrollRef}
								userImageUrl={avatarMap[viewModel.safeUserId]}
								userMap={userMap}
							/>
						</div>
					</div>
				) : null}
				{!overviewQuery.isLoading && !errorState && !overview ? (
					<SessionDetailStateMessage
						description={undefined}
						title="Session Not Found"
					/>
				) : null}
			</div>
		</div>
	);
}
