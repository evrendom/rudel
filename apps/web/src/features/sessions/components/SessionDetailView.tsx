import { useQuery } from "@tanstack/react-query";
import { Clock, GitCommitHorizontal, User } from "lucide-react";
import { ConversationView } from "@/components/conversation/ConversationView";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import { useUserMap } from "@/features/workspace/hooks/useUserMap";
import { useTrackDashboardView } from "@/hooks/useTrackDashboardView";
import { calculateCost, formatUsername } from "@/lib/format";
import { orpc } from "@/lib/orpc";
import { formatRelativeTime } from "@/lib/time-utils";
import {
	createSessionMetadataBadges,
	getConversationSummary,
	isForbiddenError,
	SessionDetailErrorBoundary,
	SessionDetailHoverTooltip,
	SessionDetailMetric,
	SessionTranscriptSummaryTab,
	sessionArchetypeStyles,
	toContentString,
	toNumber,
	toOptionalString,
	toStringArray,
	toSubagentMap,
} from "./session-detail-view-parts";

type SessionDetailViewProps = {
	sessionId: string;
	trackView?: boolean;
};

const compactMetaBadgeClassName =
	"dashboardy-inline-badge inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.75rem] font-medium";

const compactMetaBadgeIconClassName = "h-3 w-3";

const stickyMetadataRowClassName =
	"flex min-w-0 flex-wrap items-center justify-end gap-2";

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

	useTrackDashboardView({
		isLoading: trackView ? isLoading : true,
		isError: trackView ? Boolean(error) : false,
		hasData: Boolean(session),
	});

	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center px-6 py-12">
				<div className="w-full max-w-xl animate-pulse space-y-4 rounded-[1.5rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] p-6">
					<div className="h-8 w-1/3 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
					<div className="h-4 w-1/2 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
					<div className="h-4 w-2/3 rounded-full bg-[color:var(--dashboardy-subsurface-strong)]" />
				</div>
			</div>
		);
	}

	if (isForbiddenError(error)) {
		return (
			<div className="flex h-full items-center justify-center px-6 py-12">
				<div className="rounded-[1.5rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-8 py-10 text-center">
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
				<div className="rounded-[1.5rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-8 py-10 text-center">
					<p className="mb-2 text-lg font-semibold text-[color:var(--dashboardy-heading)]">
						Session Not Found
					</p>
				</div>
			</div>
		);
	}

	const safeSessionId = session.session_id || "unknown-session";
	const safeSessionDate = toOptionalString(session.session_date) ?? "";
	const safeUserId = toOptionalString(session.user_id) ?? "unknown-user";
	const safeUserDisplayName =
		safeUserId === "unknown-user"
			? "User"
			: formatUsername(safeUserId, userMap);
	const safeTotalTokens = toNumber(session.total_tokens);
	const safeInputTokens = toNumber(session.input_tokens);
	const safeOutputTokens = toNumber(session.output_tokens);
	const safeCacheReadInputTokens = toNumber(session.cache_read_input_tokens);
	const safeCacheCreationInputTokens = toNumber(
		session.cache_creation_input_tokens,
	);
	const safeUncachedInputTokens = toNumber(session.uncached_input_tokens);
	const safeParentTotalTokens = toNumber(session.parent_total_tokens);
	const safeSubagentTotalTokens = toNumber(session.subagent_total_tokens);
	const safeTokenAccountingVersion = toNumber(
		session.token_accounting_version,
		1,
	);
	const safeDurationMin =
		session.duration_min === undefined
			? undefined
			: toNumber(session.duration_min);
	const safeTotalInteractions =
		session.total_interactions === undefined
			? undefined
			: toNumber(session.total_interactions);
	const safeSuccessScore =
		session.success_score === undefined
			? undefined
			: toNumber(session.success_score);
	const safeSkills = toStringArray(session.skills);
	const safeSlashCommands = toStringArray(session.slash_commands);
	const safeSubagents = toSubagentMap(session.subagents);
	const safeRepository = toOptionalString(session.repository);
	const safeGitBranch = toOptionalString(session.git_branch);
	const safeGitSha = toOptionalString(session.git_sha);
	const safeModelUsed = toOptionalString(session.model_used) ?? undefined;
	const safeSessionArchetype =
		toOptionalString(session.session_archetype) ?? undefined;
	const safeContent = toContentString(session.content);
	const metadataBadges = createSessionMetadataBadges({
		gitBranch: safeGitBranch,
		repository: safeRepository,
	});
	const conversationSummary = getConversationSummary(safeContent);
	const subagentNames = Object.keys(safeSubagents);
	const sessionArchetypeStyle = safeSessionArchetype
		? (sessionArchetypeStyles[safeSessionArchetype] ??
			sessionArchetypeStyles.standard)
		: null;
	const hasActivityBadges =
		safeSkills.length > 0 ||
		safeSlashCommands.length > 0 ||
		subagentNames.length > 0;
	const hasClaudeTokenBreakdown =
		session.source === "claude_code" && safeTokenAccountingVersion >= 2;

	return (
		<SessionDetailErrorBoundary>
			<div className="dashboardy-page flex h-full min-h-0 flex-col bg-[color:var(--dashboardy-surface)] text-[color:var(--dashboardy-heading)]">
				<div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
					<div className="sticky top-0 z-20 border-b border-[color:var(--dashboardy-divider)] bg-[color:var(--dashboardy-surface)]/95 backdrop-blur supports-[backdrop-filter]:bg-[color:var(--dashboardy-surface)]/85">
						<div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
							<div className="flex min-w-0 items-center gap-4">
								<h1 className="dashboardy-section-title text-lg/6 text-[color:var(--dashboardy-heading)] sm:text-xl/7">
									Session details
								</h1>
								{sessionArchetypeStyle ? (
									<span
										className={`inline-flex rounded-full px-2.5 py-1 text-[0.75rem] font-semibold ${sessionArchetypeStyle.bg} ${sessionArchetypeStyle.text}`}
									>
										{sessionArchetypeStyle.label}
									</span>
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
												className={compactMetaBadgeClassName}
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
									<div className="flex items-center gap-2">
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
							<div className="grid min-w-0 gap-4 rounded-[1.35rem] border border-[color:var(--dashboardy-border)] bg-[color:color-mix(in_srgb,var(--dashboardy-subsurface)_68%,white)] px-4 py-4">
								<div className="grid gap-4 xl:grid-cols-[auto_minmax(0,1fr)] xl:items-start xl:gap-5">
									<div className="flex min-w-0 flex-wrap items-center gap-2">
										{safeGitSha ? (
											<div className={compactMetaBadgeClassName}>
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
									</div>

									<div className="flex min-w-0 w-full items-stretch gap-0 overflow-x-auto rounded-[1rem] border border-[color:var(--dashboardy-divider)] bg-[color:var(--dashboardy-surface)] px-1.5 py-1.5 xl:justify-self-stretch">
										<SessionDetailMetric
											className="grid min-w-[6.5rem] flex-1 gap-1 px-3 py-2"
											label="Duration"
											value={
												safeDurationMin !== undefined
													? `${safeDurationMin} min`
													: "—"
											}
										/>
										<SessionDetailMetric
											className="grid min-w-[6.5rem] flex-1 gap-1 border-l border-[color:var(--dashboardy-divider)] px-3 py-2"
											label="Interactions"
											value={safeTotalInteractions ?? "—"}
										/>
										<SessionDetailMetric
											className="grid min-w-[8rem] flex-[1.35] gap-1 border-l border-[color:var(--dashboardy-divider)] px-3 py-2"
											label="Processed / output"
											value={`${safeInputTokens.toLocaleString()} / ${safeOutputTokens.toLocaleString()}`}
											valueClassName="text-[0.95rem] font-semibold tabular-nums whitespace-nowrap text-[color:var(--dashboardy-heading)]"
										/>
										<SessionDetailMetric
											className="grid min-w-[6.5rem] flex-1 gap-1 border-l border-[color:var(--dashboardy-divider)] px-3 py-2"
											label="Cost"
											value={`$${calculateCost(
												safeInputTokens,
												safeOutputTokens,
												safeModelUsed,
											).toFixed(4)}`}
											valueClassName="font-mono text-[0.95rem] font-semibold tabular-nums text-[color:var(--dashboardy-heading)]"
										/>
										{safeSuccessScore !== undefined ? (
											<SessionDetailMetric
												className="grid min-w-[6rem] flex-1 gap-1 border-l border-[color:var(--dashboardy-divider)] px-3 py-2"
												label="Score"
												value={
													<span className="inline-flex items-center gap-1.5">
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
												className="grid min-w-[6rem] flex-1 gap-1 border-l border-[color:var(--dashboardy-divider)] px-3 py-2"
												label="Subagents"
												value={subagentNames.length}
											/>
										) : null}
									</div>
								</div>

								{hasActivityBadges ? (
									<div className="border-t border-[color:var(--dashboardy-divider)] pt-4">
										<div className="flex flex-wrap gap-2">
											{[...new Set(safeSkills)].map((skill) => (
												<span
													key={skill}
													className="dashboardy-inline-badge inline-flex rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium"
												>
													skill:{skill}
												</span>
											))}
											{[...new Set(safeSlashCommands)].map((command) => (
												<span
													key={command}
													className="dashboardy-inline-badge inline-flex rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium"
												>
													/{command}
												</span>
											))}
											{subagentNames.map((agent) => (
												<span
													key={agent}
													className="dashboardy-inline-badge inline-flex rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium"
												>
													agent:{agent}
												</span>
											))}
										</div>
									</div>
								) : null}
							</div>

							{hasClaudeTokenBreakdown ? (
								<div className="grid gap-3 rounded-[1rem] border border-[color:var(--dashboardy-divider)] bg-[color:var(--dashboardy-surface)] px-4 py-4">
									<div className="flex items-center gap-2">
										<h2 className="text-sm font-semibold text-[color:var(--dashboardy-heading)]">
											Claude token accounting
										</h2>
										<InfoTooltip text="Anthropic reports uncached input separately from cache reads and cache writes. This panel shows the v2 processed-input breakdown used by the corrected Claude analytics path." />
									</div>
									<div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
										<SessionDetailMetric
											label="Session total"
											value={safeTotalTokens.toLocaleString()}
										/>
										<SessionDetailMetric
											label="Uncached input"
											value={safeUncachedInputTokens.toLocaleString()}
										/>
										<SessionDetailMetric
											label="Cache read"
											value={safeCacheReadInputTokens.toLocaleString()}
										/>
										<SessionDetailMetric
											label="Cache write"
											value={safeCacheCreationInputTokens.toLocaleString()}
										/>
										<SessionDetailMetric
											label="Parent total"
											value={safeParentTotalTokens.toLocaleString()}
										/>
										<SessionDetailMetric
											label="Subagent total"
											value={safeSubagentTotalTokens.toLocaleString()}
										/>
									</div>
								</div>
							) : null}

							<ConversationView content={safeContent} showHeader={false} />
						</div>
					</div>
				</div>
			</div>
		</SessionDetailErrorBoundary>
	);
}
