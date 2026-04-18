import { useQuery } from "@tanstack/react-query";
import {
	Clock,
	FolderGit2,
	GitBranch,
	GitCommitHorizontal,
	MessageSquare,
	User,
} from "lucide-react";
import { Component, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";
import { ConversationView } from "@/components/conversation/ConversationView";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import { useUserMap } from "@/features/workspace/hooks/useUserMap";
import { useTrackDashboardView } from "@/hooks/useTrackDashboardView";
import { parseConversations } from "@/lib/conversation-schema";
import { calculateCost, formatUsername } from "@/lib/format";
import { orpc } from "@/lib/orpc";
import { formatRelativeTime } from "@/lib/time-utils";

const archetypeStyles: Record<
	string,
	{ bg: string; text: string; label: string }
> = {
	quick_win: {
		bg: "bg-[color:var(--dashboardy-success-surface)]",
		text: "text-[color:var(--dashboardy-success-foreground)]",
		label: "Quick Win",
	},
	deep_work: {
		bg: "bg-[color:var(--dashboardy-chip-surface)]",
		text: "text-[color:var(--dashboardy-chip-foreground)]",
		label: "Deep Work",
	},
	struggle: {
		bg: "bg-[color:var(--dashboardy-danger-surface)]",
		text: "text-[color:var(--dashboardy-danger-foreground)]",
		label: "Struggle",
	},
	exploration: {
		bg: "bg-[color:var(--dashboardy-subsurface-strong)]",
		text: "text-[color:var(--dashboardy-heading)]",
		label: "Exploration",
	},
	abandoned: {
		bg: "bg-[color:var(--dashboardy-subsurface)]",
		text: "text-[color:var(--dashboardy-muted)]",
		label: "Abandoned",
	},
	standard: {
		bg: "bg-[color:var(--dashboardy-subsurface-strong)]",
		text: "text-[color:var(--dashboardy-muted)]",
		label: "Standard",
	},
};

function toNumber(value: unknown, fallback = 0): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}

	return fallback;
}

function toStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function toOptionalString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function toContentString(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	if (value == null) {
		return "";
	}

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return "";
	}
}

function toSubagentMap(value: unknown): Record<string, string> {
	if (Array.isArray(value)) {
		return Object.fromEntries(
			value.filter(
				(item): item is [string, string] =>
					Array.isArray(item) &&
					item.length >= 2 &&
					typeof item[0] === "string" &&
					typeof item[1] === "string",
			),
		);
	}

	if (!value || typeof value !== "object") {
		return {};
	}

	return Object.fromEntries(
		Object.entries(value).filter(
			([key, entryValue]) =>
				typeof key === "string" && typeof entryValue === "string",
		),
	);
}

function isForbiddenError(value: unknown) {
	return (
		typeof value === "object" &&
		value !== null &&
		"code" in value &&
		value.code === "FORBIDDEN"
	);
}

function getConversationSummary(content: string) {
	if (content.trim() === "") {
		return null;
	}

	try {
		const parsed = parseConversations(content);
		if (parsed.length === 0) {
			return null;
		}

		const summary = {
			totalMessages: 0,
			userMessages: 0,
			assistantMessages: 0,
			systemMessages: 0,
		};

		for (const entry of parsed) {
			if (entry.type === "user") {
				summary.userMessages += 1;
				summary.totalMessages += 1;
				continue;
			}

			if (entry.type === "assistant") {
				summary.assistantMessages += 1;
				summary.totalMessages += 1;
				continue;
			}

			if (entry.type === "system") {
				summary.systemMessages += 1;
				summary.totalMessages += 1;
			}
		}

		return summary;
	} catch {
		return null;
	}
}

function shortenLabelFromLeft(label: string, maxLength: number) {
	if (label.length <= maxLength) {
		return label;
	}

	const slashSegments = label.split("/").filter(Boolean);
	const trailingPair = slashSegments.slice(-2).join("/");

	if (trailingPair.length > 0 && trailingPair.length + 4 <= maxLength) {
		return `.../${trailingPair}`;
	}

	const trailingSegment = slashSegments.at(-1);

	if (trailingSegment && trailingSegment.length + 4 <= maxLength) {
		return `.../${trailingSegment}`;
	}

	return `...${label.slice(-(maxLength - 3))}`;
}

function SessionTranscriptSummaryTab({
	totalMessages,
	userMessages,
	assistantMessages,
	systemMessages,
}: {
	totalMessages: number;
	userMessages: number;
	assistantMessages: number;
	systemMessages: number;
}) {
	const segments = [
		{
			id: "user",
			count: userMessages,
			className: "bg-[#25B6AA]",
		},
		{
			id: "assistant",
			count: assistantMessages,
			className: "bg-[color:var(--dashboardy-accent)]",
		},
		{
			id: "system",
			count: systemMessages,
			className: "bg-[color:var(--dashboardy-warning-foreground)]",
		},
	].filter((segment) => segment.count > 0);

	return (
		<div className="dashboardy-meter-badge inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1.5">
			<MessageSquare className="size-4 shrink-0 text-[color:var(--dashboardy-heading)]" />
			<div className="text-[0.8125rem] font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
				{totalMessages}
			</div>
			<div className="flex h-1.5 w-16 overflow-hidden rounded-full bg-[color:var(--dashboardy-divider)]/55">
				{segments.map((segment) => (
					<div
						key={segment.id}
						className={segment.className}
						style={{ flexGrow: segment.count }}
					/>
				))}
			</div>
		</div>
	);
}

type SessionDetailErrorBoundaryProps = {
	children: ReactNode;
};

type SessionDetailErrorBoundaryState = {
	hasError: boolean;
};

function SessionDetailMetric({
	label,
	value,
	className,
	valueClassName,
}: {
	label: string;
	value: ReactNode;
	className?: string;
	valueClassName?: string;
}) {
	return (
		<div className={className ?? "grid gap-1"}>
			<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-muted)]">
				{label}
			</p>
			<div
				className={
					valueClassName ??
					"text-[0.95rem] font-semibold tabular-nums text-[color:var(--dashboardy-heading)]"
				}
			>
				{value}
			</div>
		</div>
	);
}

function SessionDetailHoverTooltip({
	children,
	text,
}: {
	children: ReactNode;
	text: string;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent>{text}</TooltipContent>
		</Tooltip>
	);
}

class SessionDetailErrorBoundary extends Component<
	SessionDetailErrorBoundaryProps,
	SessionDetailErrorBoundaryState
> {
	override state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	override componentDidCatch(error: unknown) {
		console.error("[SessionDetailView] Failed to render session detail", error);
	}

	override render() {
		if (this.state.hasError) {
			return (
				<div className="flex h-full items-center justify-center px-6 py-10">
					<div className="max-w-md rounded-[1.5rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-6 py-5 text-center shadow-[0_18px_40px_rgba(15,23,42,0.06)]">
						<p className="text-lg font-semibold text-[color:var(--dashboardy-heading)]">
							Unable to render this session
						</p>
						<p className="mt-2 text-sm text-[color:var(--dashboardy-muted)]">
							The transcript payload for this session uses an unexpected shape.
						</p>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}

export function SessionDetailView({
	sessionId,
	trackView = true,
}: {
	sessionId: string;
	trackView?: boolean;
}) {
	const { userMap } = useUserMap();

	const {
		data: session,
		isLoading,
		error,
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
	const safeInputTokens = toNumber(session.input_tokens);
	const safeOutputTokens = toNumber(session.output_tokens);
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
	const compactMetaBadgeClassName =
		"dashboardy-inline-badge inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.75rem] font-medium";
	const compactMetaBadgeIconClassName = "h-3 w-3";
	const stickyMetadataRowClassName =
		"flex min-w-0 flex-wrap items-center justify-end gap-2";
	const metadataBadges: Array<{
		displayLabel: string;
		icon: typeof FolderGit2 | typeof GitBranch;
		label: string;
		tooltip: string;
	}> = [];
	if (safeRepository) {
		metadataBadges.push({
			displayLabel: shortenLabelFromLeft(safeRepository, 30),
			icon: FolderGit2,
			label: safeRepository,
			tooltip: "Worktree",
		});
	}
	if (safeGitBranch) {
		metadataBadges.push({
			displayLabel: shortenLabelFromLeft(safeGitBranch, 26),
			icon: GitBranch,
			label: safeGitBranch,
			tooltip: "Branch",
		});
	}
	const conversationSummary = getConversationSummary(safeContent);

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
								{safeSessionArchetype &&
									(() => {
										const style =
											archetypeStyles[safeSessionArchetype] ??
											archetypeStyles.standard;
										return (
											<span
												className={`inline-flex rounded-full px-2.5 py-1 text-[0.75rem] font-semibold ${style.bg} ${style.text}`}
											>
												{style.label}
											</span>
										);
									})()}
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
											label="Tokens"
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
										{Object.keys(safeSubagents).length > 0 ? (
											<SessionDetailMetric
												className="grid min-w-[6rem] flex-1 gap-1 border-l border-[color:var(--dashboardy-divider)] px-3 py-2"
												label="Subagents"
												value={Object.keys(safeSubagents).length}
											/>
										) : null}
									</div>
								</div>

								{safeSkills.length > 0 ||
								safeSlashCommands.length > 0 ||
								Object.keys(safeSubagents).length > 0 ? (
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
											{Object.keys(safeSubagents).map((agent) => (
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

							{/* idk if it works, none of my sessions show tools */}

							<ConversationView
								content={safeContent}
								showHeader={false}
								userLabel={safeUserDisplayName}
							/>
						</div>
					</div>
				</div>
			</div>
		</SessionDetailErrorBoundary>
	);
}
