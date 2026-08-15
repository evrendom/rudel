import { useQuery } from "@tanstack/react-query";
import {
	useCallback,
	// biome-ignore lint/style/noRestrictedImports: the tab title must update when async session details reveal the model and when client-side navigation changes the session id.
	useEffect,
	useRef,
} from "react";
import { Skeleton } from "@/app/ui/skeleton";
import { useTrackProductPageView } from "@/features/analytics/tracking/useTrackProductPageView";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import type { SessionNavigation } from "@/features/sessions/session-navigation";
import { useShellHeaderPortal } from "@/features/shell/shell-header-portal";
import { useUserMap } from "@/features/workspace/hooks/useUserMap";
import { orpc } from "@/lib/orpc";
import { SessionDetailContent } from "./session-detail-content";
import { SessionDetailHeader } from "./session-detail-header";
import { buildSessionDetailViewModel } from "./session-detail-view-model";
import { SessionDetailErrorBoundary } from "./session-detail-view-parts";
import { getSessionDetailErrorState } from "./session-detail-view-utils";

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
	title,
}: {
	description: string | undefined;
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
			</div>
		</div>
	);
}

export function SessionDetailView({
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
	const {
		data: session,
		error,
		isLoading,
	} = useQuery({
		...orpc.analytics.sessions.detail.queryOptions({
			input: { sessionId },
		}),
		enabled: sessionId.length > 0,
	});

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

	return (
		<SessionDetailErrorBoundary>
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
							title={errorState.title}
						/>
					) : null}
					{!isLoading && !errorState && viewModel ? (
						<SessionDetailContent
							key={viewModel.safeSessionId}
							responseScrollRef={responseScrollRef}
							userImageUrl={avatarMap[viewModel.safeUserId]}
							viewModel={viewModel}
						/>
					) : null}
					{!isLoading && !errorState && !viewModel ? (
						<SessionDetailStateMessage
							description={undefined}
							title="Session Not Found"
						/>
					) : null}
				</div>
			</div>
		</SessionDetailErrorBoundary>
	);
}
