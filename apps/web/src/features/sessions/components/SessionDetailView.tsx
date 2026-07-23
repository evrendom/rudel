import { useQuery } from "@tanstack/react-query";
import { Clock, GitCommitHorizontal, User } from "lucide-react";
import { Skeleton } from "@/app/ui/skeleton";
import { ConversationView } from "@/components/conversation/ConversationView";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useTrackProductPageView } from "@/features/analytics/tracking/useTrackProductPageView";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import { useUserMap } from "@/features/workspace/hooks/useUserMap";
import { orpc } from "@/lib/orpc";
import { formatRelativeTime } from "@/lib/time-utils";
import { buildSessionDetailViewModel } from "./session-detail-view-model";
import {
	SessionDetailErrorBoundary,
	SessionDetailHoverTooltip,
	SessionDetailMetric,
	SessionTranscriptSummaryTab,
	sessionArchetypeStyles,
} from "./session-detail-view-parts";

type SessionDetailViewProps = {
	sessionId: string;
	trackView?: boolean;
};

const compactMetaBadgeClassName =
	"dashboardy-inline-badge inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.75rem] font-medium";

const compactIconBadgeClassName =
	"dashboardy-inline-badge inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border py-1 pr-2.5 pl-1.5 text-[0.75rem] font-medium";

const compactMetaBadgeIconClassName = "size-3 shrink-0";

const stickyMetadataRowClassName =
	"flex min-w-0 flex-wrap items-center gap-2 lg:justify-end";

const sessionSummaryPanelClassName =
	"dashboardy-card grid min-w-0 gap-4 rounded-[1.4rem] border px-4 py-4 shadow-none";

const metricStripClassName =
	"flex min-w-0 w-full items-stretch overflow-hidden rounded-[1rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] [&>*+*]:border-l [&>*+*]:border-[color:var(--dashboardy-divider)]";

const metricCellClassName = "min-w-0 flex-[6] px-2.5 py-3";

const wideMetricCellClassName = "min-w-0 flex-[7] px-2.5 py-3";

const activityBadgeClassName =
	"dashboardy-inline-badge inline-flex min-w-0 max-w-full rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium";

function SessionDetailLoadingView() {
	const metricSkeletons = [
		"Duration",
		"Interactions",
		"Tokens",
		"Cost",
		"Score",
		"Subagents",
	];

	return (
		<div
			aria-busy="true"
			aria-live="polite"
			className="dashboardy-page flex h-full min-h-0 flex-col bg-[color:var(--dashboardy-surface)] text-[color:var(--dashboardy-heading)]"
		>
			<div className="min-h-0 flex-1 overflow-hidden">
				<div className="border-b border-[color:var(--dashboardy-divider)] bg-[color:var(--dashboardy-surface)]/95">
					<div className="grid gap-3 px-6 py-4 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)] lg:items-center">
						<div className="flex min-w-0 flex-wrap items-center gap-3">
							<Skeleton className="h-7 w-36 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
							<Skeleton className="h-6 w-20 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
						</div>
						<div className={stickyMetadataRowClassName}>
							<Skeleton className="h-8 w-40 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
							<Skeleton className="h-8 w-52 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
							<Skeleton className="h-8 w-36 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
						</div>
					</div>
				</div>

				<div className="px-6 py-5">
					<div className="grid gap-5">
						<div className={sessionSummaryPanelClassName}>
							<div className={metricStripClassName}>
								{metricSkeletons.map((label) => (
									<div key={label} className={metricCellClassName}>
										<Skeleton className="h-3 w-20 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
										<Skeleton className="mt-2 h-5 max-w-full rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
									</div>
								))}
							</div>

							<div className="border-t border-[color:var(--dashboardy-divider)] pt-4">
								<div className="flex flex-wrap gap-2">
									<Skeleton className="h-8 w-28 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
									<Skeleton className="h-8 w-24 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
									<Skeleton className="h-8 w-20 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
									<Skeleton className="h-8 w-32 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
									<Skeleton className="h-8 w-72 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
									<Skeleton className="h-8 w-56 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
									<Skeleton className="h-8 w-44 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
								</div>
							</div>
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
}: SessionDetailViewProps) {
	const { userMap } = useUserMap();
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
		return <SessionDetailLoadingView />;
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
		safeSessionArchetype,
		safeSessionDate,
		safeSessionId,
		safeSkills,
		safeSlashCommands,
		safeSuccessScore,
		safeTotalInteractions,
		safeUserDisplayName,
		subagentNames,
		tokenUsageLabel,
	} = buildSessionDetailViewModel(session, userMap);
	const sessionArchetypeStyle = safeSessionArchetype
		? (sessionArchetypeStyles[safeSessionArchetype] ??
			sessionArchetypeStyles.standard)
		: null;
	return (
		<SessionDetailErrorBoundary>
			<div className="dashboardy-page flex h-full min-h-0 flex-col bg-[color:var(--dashboardy-surface)] text-[color:var(--dashboardy-heading)]">
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
					<div className="sticky top-0 z-20 border-b border-[color:var(--dashboardy-divider)] bg-[color:var(--dashboardy-surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--dashboardy-surface)]/85">
						<div className="grid gap-3 px-6 py-4 lg:grid-cols-[minmax(0,auto)_minmax(0,1fr)] lg:items-center">
							<div className="flex min-w-0 flex-wrap items-center gap-3">
								<h1 className="dashboardy-section-title text-lg/6 text-[color:var(--dashboardy-heading)] sm:text-xl/7">
									Session details
								</h1>
								{sessionArchetypeStyle ? (
									<div
										className={`inline-flex rounded-full px-2.5 py-1 text-[0.75rem] font-semibold ${sessionArchetypeStyle.bg} ${sessionArchetypeStyle.text}`}
									>
										{sessionArchetypeStyle.label}
									</div>
								) : null}
							</div>

							<div className={stickyMetadataRowClassName}>
								{metadataBadges.map((item) => {
									const Icon = item.icon;

									return (
										<SessionDetailHoverTooltip
											key={item.label}
											text={item.tooltip}
										>
											<div
												className={compactIconBadgeClassName}
												title={item.label}
											>
												<Icon className={compactMetaBadgeIconClassName} />
												<div className="min-w-0 max-w-[12rem] overflow-hidden text-ellipsis whitespace-nowrap sm:max-w-[14rem] xl:max-w-[18rem]">
													{item.displayLabel}
												</div>
											</div>
										</SessionDetailHoverTooltip>
									);
								})}
								{safeModelUsed ? (
									<div className="flex shrink-0 items-center">
										<DashboardModelBadges models={[safeModelUsed]} size="md" />
									</div>
								) : null}
								{conversationSummary ? (
									<SessionTranscriptSummaryTab
										totalMessages={conversationSummary.totalMessages}
										userMessages={conversationSummary.userMessages}
										assistantMessages={conversationSummary.assistantMessages}
										systemMessages={conversationSummary.systemMessages}
									/>
								) : null}
							</div>
						</div>
					</div>

					<div className="px-6 py-5">
						<div className="grid gap-5">
							<div className={sessionSummaryPanelClassName}>
								<div className={metricStripClassName}>
									<SessionDetailMetric
										className={metricCellClassName}
										label="Duration"
										value={
											safeDurationMin !== undefined
												? `${safeDurationMin} min`
												: "—"
										}
									/>
									<SessionDetailMetric
										className={wideMetricCellClassName}
										label="Interactions"
										value={safeTotalInteractions ?? "—"}
									/>
									<SessionDetailMetric
										className={wideMetricCellClassName}
										label="Tokens"
										value={tokenUsageLabel}
										title={tokenUsageLabel}
										valueClassName="dashboardy-mono truncate whitespace-nowrap"
									/>
									<SessionDetailMetric
										className={metricCellClassName}
										label="Cost"
										value={costLabel}
										title={costLabel}
										valueClassName="dashboardy-mono truncate"
									/>
									{safeSuccessScore !== undefined ? (
										<SessionDetailMetric
											className={metricCellClassName}
											label="Score"
											value={
												<span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
													<span
														className={
															safeSuccessScore >= 70
																? "font-semibold text-status-success-icon"
																: safeSuccessScore >= 40
																	? "font-semibold text-status-warning-icon"
																	: "font-semibold text-status-error-icon"
														}
													>
														{safeSuccessScore.toFixed(0)}/100
													</span>
													<InfoTooltip text="Session quality score (0–100): earns points for a git commit (+20), high output ratio (+15), and skills used (+5 each, max 3); loses points for errors (−2 each) and abandoned sessions." />
												</span>
											}
										/>
									) : null}
									{subagentNames.length > 0 ? (
										<SessionDetailMetric
											className={metricCellClassName}
											label="Subagents"
											value={subagentNames.length}
										/>
									) : null}
								</div>

								<div className="border-t border-[color:var(--dashboardy-divider)] pt-4">
									<div className="flex flex-wrap gap-2">
										{safeGitSha ? (
											<div className={compactIconBadgeClassName}>
												<GitCommitHorizontal
													className={compactMetaBadgeIconClassName}
												/>
												<div className="font-mono tabular-nums">
													{safeGitSha.slice(0, 8)}...
												</div>
											</div>
										) : null}
										<div className={compactMetaBadgeClassName}>
											<span className="text-[color:var(--dashboardy-muted)]">
												ID
											</span>
											<div className="font-mono tabular-nums">
												{safeSessionId.slice(0, 8)}...
											</div>
										</div>
										<div className={compactMetaBadgeClassName}>
											<Clock className={compactMetaBadgeIconClassName} />
											{formatRelativeTime(safeSessionDate)}
										</div>
										<div className={compactMetaBadgeClassName}>
											<User className={compactMetaBadgeIconClassName} />
											{safeUserDisplayName}
										</div>
										{[...new Set(safeSkills)].map((skill) => (
											<div
												key={skill}
												className={activityBadgeClassName}
												title={`skill:${skill}`}
											>
												<span className="truncate">skill:{skill}</span>
											</div>
										))}
										{[...new Set(safeSlashCommands)].map((command) => (
											<div
												key={command}
												className={activityBadgeClassName}
												title={`/${command}`}
											>
												<span className="truncate">/{command}</span>
											</div>
										))}
										{subagentNames.map((agent) => (
											<div
												key={agent}
												className={activityBadgeClassName}
												title={`agent:${agent}`}
											>
												<span className="truncate">agent:{agent}</span>
											</div>
										))}
									</div>
								</div>
							</div>

							<ConversationView content={safeContent} showHeader={false} />
						</div>
					</div>
				</div>
			</div>
		</SessionDetailErrorBoundary>
	);
}
