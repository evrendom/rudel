import { useQuery } from "@tanstack/react-query";
import {
	CheckCircle2,
	ChevronDown,
	Clock,
	Copy,
	FolderGit2,
	GitBranch,
	GitCommitHorizontal,
	User,
} from "lucide-react";
import { Component, type ReactNode, useCallback, useState } from "react";
import { toast } from "sonner";
import { ConversationView } from "@/components/conversation/ConversationView";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import {
	type TokenDataPoint,
	TokenUsageChart,
} from "@/components/conversation/TokenUsageChart";
import {
	ToolActivityChart,
	type ToolActivityPoint,
} from "@/components/conversation/ToolActivityChart";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { useUserMap } from "@/features/workspace/hooks/useUserMap";
import { useTrackDashboardView } from "@/hooks/useTrackDashboardView";
import { copyTextToClipboard } from "@/lib/clipboard";
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

type SessionDetailErrorBoundaryProps = {
	children: ReactNode;
};

type SessionDetailErrorBoundaryState = {
	hasError: boolean;
};

function SessionDetailMetric({
	label,
	value,
	valueClassName,
}: {
	label: string;
	value: ReactNode;
	valueClassName?: string;
}) {
	return (
		<div className="grid gap-1">
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
	utilitySourceComponent = "session_detail_page",
}: {
	sessionId: string;
	trackView?: boolean;
	utilitySourceComponent?: string;
}) {
	const { userMap } = useUserMap();
	const { trackUtilityUsed } = useAnalyticsTracking();
	const [copied, setCopied] = useState(false);
	const [tokenData, setTokenData] = useState<TokenDataPoint[]>([]);
	const [toolActivityData, setToolActivityData] = useState<ToolActivityPoint[]>(
		[],
	);
	const [totalMessages, setTotalMessages] = useState(0);

	const handleTokenDataReady = useCallback(
		(data: TokenDataPoint[], total: number) => {
			setTokenData(data);
			setTotalMessages(total);
		},
		[],
	);

	const handleToolActivityReady = useCallback((data: ToolActivityPoint[]) => {
		setToolActivityData(data);
	}, []);

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

	async function handleCopySessionId() {
		if (!session) {
			return;
		}

		trackUtilityUsed({
			utilityName: "copy_session_id",
			sourceComponent: utilitySourceComponent,
		});

		const copiedToClipboard = await copyTextToClipboard(session.session_id);
		if (!copiedToClipboard) {
			toast.error("Failed to copy session ID");
			return;
		}

		setCopied(true);
		window.setTimeout(() => setCopied(false), 2000);
	}

	async function handleCopyGitSha(gitSha: string) {
		const copiedToClipboard = await copyTextToClipboard(gitSha);
		if (!copiedToClipboard) {
			toast.error("Failed to copy commit SHA");
		}
	}

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
	const safeModelUsed = toOptionalString(session.model_used);
	const safeSessionArchetype =
		toOptionalString(session.session_archetype) ?? undefined;
	const safeContent = toContentString(session.content);
	const metadataBadges: Array<{
		icon: typeof FolderGit2 | typeof GitBranch;
		label: string;
	}> = [];
	if (safeRepository) {
		metadataBadges.push({ icon: FolderGit2, label: safeRepository });
	}
	if (safeGitBranch) {
		metadataBadges.push({ icon: GitBranch, label: safeGitBranch });
	}

	return (
		<SessionDetailErrorBoundary>
			<div className="dashboardy-page flex h-full min-h-0 flex-col bg-[color:var(--dashboardy-surface)] text-[color:var(--dashboardy-heading)]">
				<div className="shrink-0 border-b border-[color:var(--dashboardy-divider)] px-6 py-5">
					<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
						<div className="grid min-w-0 gap-4">
							<div className="flex flex-wrap items-start justify-between gap-6">
								<div className="grid min-w-0 gap-4">
									<div className="flex flex-wrap items-center gap-3">
										<span className="dashboardy-route-badge inline-flex rounded-full border px-3 py-1">
											session
										</span>
										<h1 className="dashboardy-section-title text-[1.65rem] font-semibold tracking-tight text-balance text-[color:var(--dashboardy-heading)]">
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
									<div className="flex flex-wrap items-center gap-3 text-sm text-[color:var(--dashboardy-muted)]">
										<div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-3 py-1.5">
											<span className="font-mono text-[0.8125rem] font-semibold tabular-nums text-[color:var(--dashboardy-heading)]">
												{safeSessionId.slice(0, 8)}...
											</span>
											<button
												type="button"
												onClick={handleCopySessionId}
												className="rounded p-1 text-[color:var(--dashboardy-muted)] transition-colors hover:bg-[color:var(--dashboardy-subsurface-strong)] hover:text-[color:var(--dashboardy-heading)]"
												title="Copy session ID"
											>
												{copied ? (
													<CheckCircle2 className="h-4 w-4 text-status-success-icon" />
												) : (
													<Copy className="h-4 w-4" />
												)}
											</button>
										</div>
										<div className="flex items-center gap-1.5">
											<Clock className="h-4 w-4" />
											{formatRelativeTime(safeSessionDate)}
										</div>
										<div className="flex items-center gap-1.5">
											<User className="h-4 w-4" />
											{formatUsername(safeUserId, userMap)}
										</div>
									</div>
									<div className="flex flex-wrap items-center gap-2">
										{metadataBadges.map((item) => {
											const Icon = item.icon;

											return (
												<span
													key={item.label}
													className="dashboardy-inline-badge inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium"
												>
													<Icon className="h-3.5 w-3.5" />
													{item.label}
												</span>
											);
										})}
										{safeModelUsed ? (
											<div className="flex items-center gap-2">
												<DashboardModelBadges models={[safeModelUsed]} />
											</div>
										) : null}
										{safeGitSha ? (
											<div className="group relative">
												<div className="dashboardy-inline-badge inline-flex cursor-default items-center gap-2 rounded-full border px-3 py-1.5 text-[0.8125rem] font-medium">
													<GitCommitHorizontal className="h-3.5 w-3.5" />
													<span className="font-mono tabular-nums">
														{safeGitSha.slice(0, 8)}
													</span>
													<ChevronDown className="h-3.5 w-3.5 transition-transform group-hover:rotate-180" />
												</div>
												<div className="absolute top-full left-0 z-20 mt-2 hidden min-w-[18rem] rounded-[1rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] p-2 shadow-[0_18px_40px_rgba(15,23,42,0.08)] group-hover:block">
													<div className="flex items-center justify-between gap-3 rounded-[0.85rem] px-3 py-2">
														<span className="select-all font-mono text-[0.8125rem] tabular-nums text-[color:var(--dashboardy-heading)]">
															{safeGitSha}
														</span>
														<button
															type="button"
															onClick={() => void handleCopyGitSha(safeGitSha)}
															className="rounded p-1 text-[color:var(--dashboardy-muted)] transition-colors hover:bg-[color:var(--dashboardy-subsurface)] hover:text-[color:var(--dashboardy-heading)]"
															title="Copy commit SHA"
														>
															<Copy className="h-3.5 w-3.5" />
														</button>
													</div>
												</div>
											</div>
										) : null}
									</div>
								</div>

								<div className="grid min-w-0 w-full gap-3 border-t border-[color:var(--dashboardy-divider)] pt-4 sm:grid-cols-2 xl:max-w-[32rem] xl:grid-cols-3 xl:justify-items-end xl:border-t-0 xl:pt-0">
									<SessionDetailMetric
										label="Duration"
										value={
											safeDurationMin !== undefined
												? `${safeDurationMin} min`
												: "—"
										}
									/>
									<SessionDetailMetric
										label="Interactions"
										value={safeTotalInteractions ?? "—"}
									/>
									<SessionDetailMetric
										label="Tokens"
										value={`${safeInputTokens.toLocaleString()} / ${safeOutputTokens.toLocaleString()}`}
									/>
									<SessionDetailMetric
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

						<div className="grid gap-4 xl:grid-rows-2">
							<div className="rounded-[1.15rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] p-4">
								<p className="mb-3 text-sm font-semibold text-[color:var(--dashboardy-heading)]">
									Token usage
								</p>
								<TokenUsageChart data={tokenData} totalMessages={totalMessages} />
							</div>
							<div className="rounded-[1.15rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] p-4">
								<p className="mb-3 text-sm font-semibold text-[color:var(--dashboardy-heading)]">
									Tool activity
								</p>
								<div className="border-t border-[color:var(--dashboardy-divider)] pt-4">
									<ToolActivityChart
										data={toolActivityData}
										totalMessages={totalMessages}
									/>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div className="shrink-0 border-b border-[color:var(--dashboardy-divider)] px-6 py-3">
					<div className="flex items-center justify-between gap-4">
						<div className="grid gap-0.5">
							<p className="text-sm font-semibold text-[color:var(--dashboardy-heading)]">
								Conversation
							</p>
							<p className="text-sm text-[color:var(--dashboardy-muted)]">
								Full transcript, tool usage, and token flow for this session.
							</p>
						</div>
					</div>
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
					<div className="rounded-[1.35rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]">
						<ConversationView
							content={safeContent}
							onTokenDataReady={handleTokenDataReady}
							onToolActivityReady={handleToolActivityReady}
						/>
					</div>
				</div>
			</div>
		</SessionDetailErrorBoundary>
	);
}
