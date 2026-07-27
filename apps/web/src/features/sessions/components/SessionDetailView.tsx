import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Info, User } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/ui/popover";
import { Skeleton } from "@/app/ui/skeleton";
import { ConversationView } from "@/components/conversation/ConversationView";
import { useTrackProductPageView } from "@/features/analytics/tracking/useTrackProductPageView";
import {
	DashboardModelIdentity,
	formatModelDisplayLabel,
} from "@/features/dashboard/components/DashboardModelBadges";
import { useUserMap } from "@/features/workspace/hooks/useUserMap";
import { orpc } from "@/lib/orpc";
import { formatExactDateTime } from "@/lib/time-utils";
import { cn } from "@/lib/utils";
import { buildSessionDetailViewModel } from "./session-detail-view-model";
import {
	isForbiddenError,
	SessionDetailErrorBoundary,
	SessionTranscriptSummaryTab,
} from "./session-detail-view-parts";

export type SessionDetailNavigation = {
	onPreviousSession: () => void;
	onNextSession: () => void;
	hasPreviousSession: boolean;
	hasNextSession: boolean;
};

type SessionDetailViewProps = {
	sessionId: string;
	trackView?: boolean;
	navigation?: SessionDetailNavigation;
};

const sessionNavButtonClassName =
	"dashboardy-action-button relative inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--dashboardy-border)] bg-transparent text-[color:var(--dashboardy-heading)] shadow-none hover:bg-[color:var(--dashboardy-subsurface-strong)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

const sessionNavTouchTargetClassName =
	"absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden";

/**
 * Steps through the session list behind the sheet, in the order the table
 * renders it: up is the newer neighbour, down the older one.
 */
function SessionDetailNavButtons({
	navigation,
}: {
	navigation: SessionDetailNavigation | undefined;
}) {
	if (!navigation) {
		return null;
	}

	return (
		<div className="flex shrink-0 items-center gap-1.5">
			<button
				type="button"
				aria-label="Previous session"
				className={sessionNavButtonClassName}
				disabled={!navigation.hasPreviousSession}
				onClick={navigation.onPreviousSession}
			>
				<ArrowUp className="size-4" />
				<span className={sessionNavTouchTargetClassName} aria-hidden="true" />
			</button>
			<button
				type="button"
				aria-label="Next session"
				className={sessionNavButtonClassName}
				disabled={!navigation.hasNextSession}
				onClick={navigation.onNextSession}
			>
				<ArrowDown className="size-4" />
				<span className={sessionNavTouchTargetClassName} aria-hidden="true" />
			</button>
		</div>
	);
}

function SessionInfoPopover({
	gitSha,
	metadataBadges,
	sessionId,
}: {
	gitSha: string | null;
	metadataBadges: ReturnType<
		typeof buildSessionDetailViewModel
	>["metadataBadges"];
	sessionId: string;
}) {
	const informationRows = [
		...metadataBadges.map((item) => ({
			label: item.tooltip,
			value: item.label,
		})),
		...(gitSha ? [{ label: "Commit", value: gitSha }] : []),
		{ label: "Session ID", value: sessionId },
	];

	return (
		<Popover>
			<PopoverTrigger
				type="button"
				aria-label="Session information"
				className={sessionNavButtonClassName}
			>
				<Info className="size-4" />
				<span className={sessionNavTouchTargetClassName} aria-hidden="true" />
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="bottom"
				sideOffset={8}
				className="w-[32rem] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-2xl p-0"
			>
				<dl className="divide-y divide-border/60 px-4 py-1">
					{informationRows.map((row) => (
						<div
							key={row.label}
							className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-3 py-2.5"
						>
							<dt className="text-sm font-medium text-foreground">
								{row.label}
							</dt>
							<dd className="min-w-0 break-words font-mono text-sm text-muted-foreground">
								{row.value}
							</dd>
						</div>
					))}
				</dl>
			</PopoverContent>
		</Popover>
	);
}

function SessionUserIdentity({
	displayName,
	imageUrl,
}: {
	displayName: string;
	imageUrl: string | undefined;
}) {
	return (
		<div className="flex min-w-0 items-center gap-2 text-[0.875rem] font-semibold tracking-[-0.015em] text-[color:var(--dashboardy-heading)]">
			{imageUrl ? (
				<img
					src={imageUrl}
					alt=""
					className="size-5 shrink-0 rounded-full object-cover outline-1 -outline-offset-1 outline-black/5 dark:outline-white/10"
				/>
			) : (
				<span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--dashboardy-subsurface-strong)] outline-1 -outline-offset-1 outline-black/5 dark:outline-white/10">
					<User className="size-3" />
				</span>
			)}
			<div className="min-w-0 truncate">{displayName}</div>
		</div>
	);
}

const stickyStatsGroupClassName =
	"flex h-8 w-full min-w-0 items-stretch divide-x divide-[color:var(--dashboardy-divider)] overflow-x-auto rounded-(--session-stats-radius) border border-[color:var(--dashboardy-border-strong)] bg-transparent p-(--session-stats-padding) [--session-stats-avatar-inset:0.375rem] [--session-stats-padding:--spacing(0.5)] [--session-stats-radius:1rem] [--session-stats-size:2rem] lg:w-auto lg:justify-self-end";

const sessionStatSegmentClassName =
	"flex min-w-0 shrink-0 items-center gap-1.5 px-2.5 text-[0.75rem] font-medium";

const activityMetadataItemClassName =
	"flex min-w-0 max-w-full items-center gap-2 text-[0.75rem] font-medium text-[color:var(--dashboardy-muted)]";

/**
 * A compact fact inside the segmented stats group.
 */
function SessionFactSegment({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string | number;
	mono?: boolean;
}) {
	return (
		<div className={sessionStatSegmentClassName} title={`${label}: ${value}`}>
			<span className="sr-only">{label}: </span>
			<div
				className={cn(
					"min-w-0 truncate text-[color:var(--dashboardy-heading)]",
					mono && "font-mono tabular-nums",
				)}
			>
				{value}
			</div>
		</div>
	);
}

function SessionDetailLoadingView({
	navigation,
}: {
	navigation?: SessionDetailNavigation;
}) {
	return (
		<div
			aria-busy="true"
			aria-live="polite"
			className="dashboardy-page flex h-full min-h-0 flex-col bg-[color:var(--dashboardy-surface)] text-[color:var(--dashboardy-heading)]"
		>
			<div className="min-h-0 flex-1 overflow-hidden">
				<div className="border-b border-[color:var(--dashboardy-divider)] bg-[color:var(--dashboardy-surface)]/95">
					<div className="grid gap-3 px-6 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
						<div className="flex min-w-0 flex-wrap items-center gap-3">
							<div className="flex shrink-0 items-center gap-1.5">
								<SessionDetailNavButtons navigation={navigation} />
								<Skeleton className="size-8 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
							</div>
							<div className="flex items-center gap-2">
								<Skeleton className="size-4 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
								<Skeleton className="h-4 w-28 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
							</div>
							<div className="flex items-center gap-2">
								<Skeleton className="size-5 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
								<Skeleton className="h-4 w-24 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
							</div>
							<Skeleton className="h-4 w-32 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
						</div>
						<div className={stickyStatsGroupClassName}>
							<div className={sessionStatSegmentClassName}>
								<Skeleton className="h-4 w-16 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
							</div>
							<div className={sessionStatSegmentClassName}>
								<Skeleton className="h-4 w-20 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
							</div>
							<div className={sessionStatSegmentClassName}>
								<Skeleton className="h-4 w-24 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
							</div>
							<div className={sessionStatSegmentClassName}>
								<Skeleton className="h-4 w-16 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
							</div>
							<div className={sessionStatSegmentClassName}>
								<Skeleton className="h-4 w-32 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
							</div>
						</div>
					</div>
				</div>

				<div className="px-6 py-5">
					<div className="grid gap-5">
						<div className="flex flex-wrap items-center gap-3">
							<Skeleton className="h-3 w-28 rounded-sm bg-[color:var(--dashboardy-subsurface-strong)]" />
							<span
								aria-hidden="true"
								className="size-1 rounded-full bg-[color:var(--dashboardy-divider)]"
							/>
							<Skeleton className="h-3 w-24 rounded-sm bg-[color:var(--dashboardy-subsurface-strong)]" />
							<span
								aria-hidden="true"
								className="size-1 rounded-full bg-[color:var(--dashboardy-divider)]"
							/>
							<Skeleton className="h-3 w-20 rounded-sm bg-[color:var(--dashboardy-subsurface-strong)]" />
						</div>

						<div className="grid gap-3.5">
							<Skeleton className="h-20 rounded-[1.2rem] bg-[color:var(--dashboardy-subsurface-strong)]" />
							<Skeleton className="h-24 rounded-[1.2rem] bg-[color:var(--dashboardy-subsurface-strong)]" />
							<Skeleton className="h-20 rounded-[1.2rem] bg-[color:var(--dashboardy-subsurface-strong)]" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export function SessionDetailView({
	sessionId,
	trackView = true,
	navigation,
}: SessionDetailViewProps) {
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
		isLoading: trackView ? isLoading : true,
		isError: trackView ? Boolean(error) : false,
		hasData: Boolean(session),
	});

	if (isLoading) {
		return <SessionDetailLoadingView navigation={navigation} />;
	}

	if (isForbiddenError(error)) {
		return (
			<div className="flex h-full items-center justify-center px-6 py-12">
				<div className="dashboardy-card rounded-[1.5rem] border px-8 py-10 text-center shadow-none">
					<p className="mb-2 text-lg font-semibold text-[color:var(--dashboardy-heading)]">
						Access Denied
					</p>
					<p className="text-sm text-[color:var(--dashboardy-muted)]">
						You can only view your own session transcripts.
					</p>
				</div>
			</div>
		);
	}

	if (!session) {
		return (
			<div className="flex h-full items-center justify-center px-6 py-12">
				<div className="dashboardy-card rounded-[1.5rem] border px-8 py-10 text-center shadow-none">
					<p className="mb-2 text-lg font-semibold text-[color:var(--dashboardy-heading)]">
						Session Not Found
					</p>
				</div>
			</div>
		);
	}

	const {
		conversationSummary,
		costLabel,
		metadataBadges,
		safeContent,
		safeDurationMin,
		safeGitSha,
		safeModelUsed,
		safeSessionDate,
		safeSessionId,
		safeSkills,
		safeSlashCommands,
		safeUserDisplayName,
		safeUserId,
		subagentNames,
		tokenUsageLabel,
	} = buildSessionDetailViewModel(session, userMap);
	const activityItems = [
		...[...new Set(safeSkills)].map((skill) => ({
			id: `skill:${skill}`,
			label: `skill:${skill}`,
		})),
		...[...new Set(safeSlashCommands)].map((command) => ({
			id: `command:${command}`,
			label: `/${command}`,
		})),
	];

	return (
		<SessionDetailErrorBoundary>
			<div className="dashboardy-page flex h-full min-h-0 flex-col bg-[color:var(--dashboardy-surface)] text-[color:var(--dashboardy-heading)]">
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
					<div className="sticky top-0 z-20 border-b border-[color:var(--dashboardy-divider)] bg-[color:var(--dashboardy-surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--dashboardy-surface)]/85">
						<div className="grid gap-3 px-6 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
							<div className="flex min-w-0 flex-wrap items-center gap-3">
								<div className="flex shrink-0 items-center gap-1.5">
									<SessionDetailNavButtons navigation={navigation} />
									<SessionInfoPopover
										gitSha={safeGitSha}
										metadataBadges={metadataBadges}
										sessionId={safeSessionId}
									/>
								</div>
								<div className="flex min-w-0 flex-wrap items-end gap-3">
									{safeModelUsed ? (
										<DashboardModelIdentity model={safeModelUsed} />
									) : null}
									<SessionUserIdentity
										displayName={safeUserDisplayName}
										imageUrl={avatarMap[safeUserId]}
									/>
								</div>
							</div>

							<div className={stickyStatsGroupClassName}>
								{conversationSummary ? (
									<SessionTranscriptSummaryTab
										userMessages={conversationSummary.userMessages}
										assistantMessages={conversationSummary.assistantMessages}
										userDisplayName={safeUserDisplayName}
										userImageUrl={avatarMap[safeUserId]}
										model={safeModelUsed}
									/>
								) : null}
								<SessionFactSegment
									label="Duration"
									value={
										safeDurationMin !== undefined
											? `${safeDurationMin} min`
											: "—"
									}
								/>
								<SessionFactSegment
									label="Tokens"
									value={tokenUsageLabel}
									mono
								/>
								<SessionFactSegment label="Cost" value={costLabel} mono />
								{subagentNames.length > 0 ? (
									<SessionFactSegment
										label="Subagents"
										value={`${subagentNames.length} ${
											subagentNames.length === 1 ? "subagent" : "subagents"
										}`}
									/>
								) : null}
								<SessionFactSegment
									label="Date"
									value={formatExactDateTime(safeSessionDate)}
								/>
							</div>
						</div>
					</div>

					<div className="px-6 py-5">
						<div className="grid gap-5">
							{activityItems.length > 0 ? (
								<ul className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
									{activityItems.map((item, index) => (
										<li
											key={item.id}
											className={activityMetadataItemClassName}
											title={item.label}
										>
											{index > 0 ? (
												<span
													aria-hidden="true"
													className="size-1 shrink-0 rounded-full bg-[color:var(--dashboardy-divider)]"
												/>
											) : null}
											<span className="min-w-0 truncate font-mono">
												{item.label}
											</span>
										</li>
									))}
								</ul>
							) : null}

							<ConversationView
								content={safeContent}
								userLabel={safeUserDisplayName}
								agentLabel={
									safeModelUsed
										? formatModelDisplayLabel(safeModelUsed)
										: undefined
								}
								agentModel={safeModelUsed}
							/>
						</div>
					</div>
				</div>
			</div>
		</SessionDetailErrorBoundary>
	);
}
