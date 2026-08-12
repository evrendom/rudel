import { useQuery } from "@tanstack/react-query";
import {
	useCallback,
	// biome-ignore lint/style/noRestrictedImports: the tab title must update when async session details reveal the model and when client-side navigation changes the session id.
	useEffect,
	useRef,
} from "react";
import { useLocation } from "react-router-dom";
import {
	isLeftSidebarAdalinePreviewPath,
	isLeftSidebarPreviewPath,
	isLeftSidebarTablePreviewPath,
	isLeftSidebarThreadCollapsiblePreviewPath,
	isLeftSidebarThreadPreviewPath,
	isLeftSidebarThreadV2PreviewPath,
	isLeftSidebarThreadWaterfallPreviewPath,
	isLeftSidebarTurnsPreviewPath,
} from "@/app/routes";
import { Skeleton } from "@/app/ui/skeleton";
import { ConversationView } from "@/components/conversation/ConversationView";
import { useTrackProductPageView } from "@/features/analytics/tracking/useTrackProductPageView";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import type { SessionNavigation } from "@/features/sessions/session-navigation";
import { useShellHeaderPortal } from "@/features/shell/shell-header-portal";
import { useUserMap } from "@/features/workspace/hooks/useUserMap";
import { orpc } from "@/lib/orpc";
import { cn } from "@/lib/utils";
import { NormalSessionTurnStrip } from "./normal-session-turn-strip";
import { SessionDetailHeader } from "./session-detail-header";
import {
	SessionDetailTriptychView,
	TRIPTYCH_SESSION_IDS,
	useTriptychDesktopLayout,
} from "./session-detail-triptych-view";
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

type SessionDetailViewModel = ReturnType<typeof buildSessionDetailViewModel>;

const sessionLoadingCapabilityRows = [
	{ id: "skills", labelWidth: "w-14", tagWidth: "w-24" },
	{ id: "commands", labelWidth: "w-20", tagWidth: "w-20" },
	{ id: "subagents", labelWidth: "w-16", tagWidth: "w-28" },
] as const;

const sessionCapabilityTagClassName =
	"inline-flex max-w-full items-center rounded-full bg-[color:var(--dashboardy-subsurface-strong)] px-2 py-0.5 text-base font-medium text-[color:var(--dashboardy-heading)] sm:text-[0.75rem]";

type SessionCapabilityItem =
	| {
			id: string;
			label: string;
			type: "label";
	  }
	| {
			id: string;
			model: string | undefined;
			number: number;
			totalTokens: number | undefined;
			type: "subagent";
	  };

type SessionCapabilityRow = {
	id: string;
	items: readonly SessionCapabilityItem[];
	label: string;
};

function SessionCapabilityTag({ item }: { item: SessionCapabilityItem }) {
	if (item.type === "label") {
		return (
			<li
				className={cn(sessionCapabilityTagClassName, "font-mono")}
				title={item.label}
			>
				<div className="min-w-0 truncate">{item.label}</div>
			</li>
		);
	}

	const modelLabel = item.model
		? formatModelDisplayLabel(item.model)
		: "Model unavailable";
	const tokenLabel =
		item.totalTokens === undefined
			? "Tokens unavailable"
			: `${formatRoundedTokenCount(item.totalTokens)} tokens`;

	return (
		<li
			className={cn(sessionCapabilityTagClassName, "min-w-0 gap-2")}
			title={`${modelLabel}, ${tokenLabel}`}
		>
			<div className="shrink-0 font-mono text-[color:var(--dashboardy-muted)] tabular-nums">
				{String(item.number).padStart(2, "0")}
			</div>
			<div className="min-w-0 truncate">{modelLabel}</div>
			<div className="shrink-0 font-mono text-[color:var(--dashboardy-muted)] tabular-nums">
				{tokenLabel}
			</div>
		</li>
	);
}

function SessionCapabilitiesTable({
	rows,
}: {
	rows: readonly SessionCapabilityRow[];
}) {
	return (
		<table className="w-full table-fixed">
			<caption className="sr-only">Session capabilities</caption>
			<colgroup>
				<col className="w-40" />
				<col />
			</colgroup>
			<thead className="sr-only">
				<tr>
					<th scope="col">Capability</th>
					<th scope="col">Usage</th>
				</tr>
			</thead>
			<tbody className="divide-y divide-[color:var(--dashboardy-divider)]">
				{rows.map((row) => (
					<tr key={row.id}>
						<th
							scope="row"
							className="py-2 pr-4 text-left align-top text-base font-medium whitespace-nowrap text-[color:var(--dashboardy-muted)] sm:text-[0.8125rem]"
						>
							{row.label}
						</th>
						<td className="py-2 align-top">
							<ul className="flex min-w-0 list-none flex-wrap justify-end gap-1">
								{row.items.length > 0 ? (
									row.items.map((item) => (
										<SessionCapabilityTag key={item.id} item={item} />
									))
								) : (
									<li
										className={cn(
											sessionCapabilityTagClassName,
											"bg-[color:var(--dashboardy-subsurface)] text-[color:var(--dashboardy-muted)]",
										)}
									>
										Not used
									</li>
								)}
							</ul>
						</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

function formatRoundedTokenCount(value: number) {
	if (value < 1_000) {
		return Math.round(value).toLocaleString();
	}

	return `${Math.round(value / 1_000)}k`;
}

function SessionDetailContentLoadingView() {
	return (
		<div aria-busy="true" className="min-h-full min-w-0">
			<output className="sr-only">Loading session details</output>
			<div aria-hidden="true" className="px-6 py-5">
				<div className="grid gap-5">
					<div className="divide-y divide-[color:var(--dashboardy-divider)]">
						{sessionLoadingCapabilityRows.map((row) => (
							<div
								key={row.id}
								className="grid grid-cols-[10rem_minmax(0,1fr)] items-start gap-4 py-2"
							>
								<Skeleton
									className={cn(
										"h-4 rounded-sm bg-[color:var(--dashboardy-subsurface-strong)]",
										row.labelWidth,
									)}
								/>
								<div className="flex justify-end">
									<Skeleton
										className={cn(
											"h-5 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]",
											row.tagWidth,
										)}
									/>
								</div>
							</div>
						))}
					</div>

					<div className="grid gap-3.5">
						<Skeleton className="h-20 rounded-[1.2rem] bg-[color:var(--dashboardy-subsurface-strong)]" />
						<Skeleton className="h-24 rounded-[1.2rem] bg-[color:var(--dashboardy-subsurface-strong)]" />
						<Skeleton className="h-20 rounded-[1.2rem] bg-[color:var(--dashboardy-subsurface-strong)]" />
					</div>
				</div>
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
				<p className="mb-2 text-lg font-semibold text-[color:var(--dashboardy-heading)]">
					{title}
				</p>
				{description ? (
					<p className="text-sm text-[color:var(--dashboardy-muted)]">
						{description}
					</p>
				) : null}
			</div>
		</div>
	);
}

function SessionDetailLoadedContent({
	userImageUrl,
	viewModel,
}: {
	userImageUrl: string | undefined;
	viewModel: SessionDetailViewModel;
}) {
	const {
		safeContent,
		safeModelUsed,
		safeSkills,
		safeSlashCommands,
		safeUserDisplayName,
		subagentSummaries,
	} = viewModel;
	const capabilityRows: SessionCapabilityRow[] = [
		{
			id: "skills",
			items: [...new Set(safeSkills)].map((skill) => ({
				id: skill,
				label: skill,
				type: "label",
			})),
			label: "Skills",
		},
		{
			id: "commands",
			items: [...new Set(safeSlashCommands)].map((command) =>
				command.startsWith("/")
					? { id: command, label: command, type: "label" }
					: { id: command, label: `/${command}`, type: "label" },
			),
			label: "Slash commands",
		},
		{
			id: "subagents",
			items: subagentSummaries.map((subagent, index) => ({
				id: subagent.id,
				model: subagent.model,
				number: index + 1,
				totalTokens: subagent.totalTokens,
				type: "subagent",
			})),
			label: "Subagents",
		},
	];

	return (
		<div className="px-6 py-5">
			<div className="grid gap-5">
				<SessionCapabilitiesTable rows={capabilityRows} />

				<ConversationView
					content={safeContent}
					userLabel={safeUserDisplayName}
					userImageUrl={userImageUrl}
					agentLabel={
						safeModelUsed ? formatModelDisplayLabel(safeModelUsed) : undefined
					}
					agentModel={safeModelUsed}
				/>
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
	const transcriptScrollRef = useRef<HTMLDivElement>(null);
	const location = useLocation();
	const shellHeaderPortal = useShellHeaderPortal();
	const isTriptychDesktopLayout = useTriptychDesktopLayout();

	const handleHeaderWheel = useCallback((event: WheelEvent) => {
		if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		const transcriptScroll = transcriptScrollRef.current;
		if (transcriptScroll) {
			transcriptScroll.scrollTop += event.deltaY;
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
	const isAdalinePreview = isLeftSidebarAdalinePreviewPath(location.pathname);
	const isTablePreview = isLeftSidebarTablePreviewPath(location.pathname);
	const isCollapsibleThreadPreview = isLeftSidebarThreadCollapsiblePreviewPath(
		location.pathname,
	);
	const isThreadPreview = isLeftSidebarThreadPreviewPath(location.pathname);
	const isThreadWaterfallPreview = isLeftSidebarThreadWaterfallPreviewPath(
		location.pathname,
	);
	const isThreadV2Preview = isLeftSidebarThreadV2PreviewPath(location.pathname);
	const isTurnsPreview = isLeftSidebarTurnsPreviewPath(location.pathname);
	const isTriptychExample =
		(isLeftSidebarPreviewPath(location.pathname) ||
			isAdalinePreview ||
			isTablePreview ||
			isCollapsibleThreadPreview ||
			isThreadWaterfallPreview ||
			isThreadV2Preview ||
			isThreadPreview ||
			isTurnsPreview) &&
		TRIPTYCH_SESSION_IDS.has(sessionId.toLowerCase());
	const showTriptych =
		!isLoading &&
		errorState === undefined &&
		viewModel !== undefined &&
		isTriptychExample &&
		isTriptychDesktopLayout;

	return (
		<SessionDetailErrorBoundary>
			<div className="dashboardy-page flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[color:var(--dashboardy-surface)] text-[color:var(--dashboardy-heading)]">
				<SessionDetailHeader
					avatarMap={avatarMap}
					headerRef={setHeaderElement}
					hideMetrics={isTriptychExample}
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
					{showTriptych && viewModel ? (
						<SessionDetailTriptychView
							key={`${viewModel.safeSessionId}-${isAdalinePreview ? "adaline" : isThreadWaterfallPreview ? "thread-waterfall" : isThreadV2Preview ? "thread-v2" : isCollapsibleThreadPreview ? "thread-collapsible" : isThreadPreview ? "thread" : isTablePreview ? "table" : isTurnsPreview ? "focus" : "overview"}`}
							responseScrollRef={transcriptScrollRef}
							turnRailVariant={
								isAdalinePreview
									? "adaline"
									: isThreadWaterfallPreview
										? "thread-waterfall"
										: isThreadV2Preview
											? "thread-v2"
											: isCollapsibleThreadPreview
												? "thread-collapsible"
												: isThreadPreview
													? "thread"
													: isTablePreview
														? "table"
														: isTurnsPreview
															? "focus"
															: "overview"
							}
							userImageUrl={avatarMap[viewModel.safeUserId]}
							viewModel={viewModel}
						/>
					) : (
						<div className="flex h-full min-h-0 min-w-0">
							<div
								ref={transcriptScrollRef}
								className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-none pb-[calc(5rem+env(safe-area-inset-bottom))]"
							>
								{isLoading ? <SessionDetailContentLoadingView /> : null}
								{!isLoading && errorState ? (
									<SessionDetailStateMessage
										description={errorState.description}
										title={errorState.title}
									/>
								) : null}
								{!isLoading && !errorState && viewModel ? (
									<SessionDetailLoadedContent
										key={viewModel.safeSessionId}
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
							{!isLoading && !errorState && viewModel ? (
								<NormalSessionTurnStrip
									content={viewModel.safeContent}
									scrollContainerRef={transcriptScrollRef}
								/>
							) : null}
						</div>
					)}
				</div>
			</div>
		</SessionDetailErrorBoundary>
	);
}
