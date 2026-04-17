import { useQuery } from "@tanstack/react-query";
import {
	CheckCircle2,
	ChevronDown,
	Clock,
	Copy,
	GitBranch,
	GitCommitHorizontal,
	User,
} from "lucide-react";
import { Component, type ReactNode, useCallback, useState } from "react";
import { toast } from "sonner";
import { ConversationView } from "@/components/conversation/ConversationView";
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
	quick_win: { bg: "bg-green-100", text: "text-green-800", label: "Quick Win" },
	deep_work: { bg: "bg-blue-100", text: "text-blue-800", label: "Deep Work" },
	struggle: { bg: "bg-red-100", text: "text-red-800", label: "Struggle" },
	exploration: {
		bg: "bg-purple-100",
		text: "text-purple-800",
		label: "Exploration",
	},
	abandoned: { bg: "bg-gray-100", text: "text-gray-600", label: "Abandoned" },
	standard: { bg: "bg-surface", text: "text-subheading", label: "Standard" },
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
					<div className="max-w-md rounded-2xl border border-border bg-card px-6 py-5 text-center shadow-sm">
						<p className="text-lg font-semibold text-foreground">
							Unable to render this session
						</p>
						<p className="mt-2 text-sm text-muted-foreground">
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
			<div className="flex h-full items-center justify-center">
				<div className="w-full max-w-md animate-pulse space-y-4">
					<div className="h-8 w-1/3 rounded bg-hover" />
					<div className="h-4 w-1/2 rounded bg-hover" />
					<div className="h-4 w-2/3 rounded bg-hover" />
				</div>
			</div>
		);
	}

	if (isForbiddenError(error)) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center">
					<p className="mb-2 text-lg font-semibold text-status-error-icon">
						Access Denied
					</p>
					<p className="text-muted">
						You can only view your own session transcripts.
					</p>
				</div>
			</div>
		);
	}

	if (!session) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center">
					<p className="mb-2 text-lg font-semibold text-status-error-icon">
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

	return (
		<SessionDetailErrorBoundary>
			<div className="flex h-full flex-col">
				<div className="shrink-0 bg-input px-8 py-4">
					<div className="flex items-start justify-between gap-8">
						<div className="min-w-0">
							<div className="mb-2 flex items-center gap-3">
								<h1 className="text-2xl font-bold text-heading">
									Session Details
								</h1>
								{safeSessionArchetype &&
									(() => {
										const style =
											archetypeStyles[safeSessionArchetype] ??
											archetypeStyles.standard;
										return (
											<span
												className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
											>
												{style.label}
											</span>
										);
									})()}
							</div>
							<div className="flex flex-wrap items-center gap-4 text-sm text-muted">
								<div className="flex items-center gap-2">
									<span className="rounded bg-surface px-2 py-1 font-mono text-xs">
										{safeSessionId.slice(0, 8)}...
									</span>
									<button
										type="button"
										onClick={handleCopySessionId}
										className="rounded p-1 hover:bg-hover"
										title="Copy session ID"
									>
										{copied ? (
											<CheckCircle2 className="h-4 w-4 text-status-success-icon" />
										) : (
											<Copy className="h-4 w-4 text-muted" />
										)}
									</button>
								</div>
								<div className="flex items-center gap-1">
									<Clock className="h-4 w-4" />
									{formatRelativeTime(safeSessionDate)}
								</div>
								<div className="flex items-center gap-1">
									<User className="h-4 w-4" />
									{formatUsername(safeUserId, userMap)}
								</div>
							</div>
						</div>

						<div className="flex flex-wrap items-center justify-end gap-6 text-xs">
							<div className="text-right">
								<p className="text-muted">Duration</p>
								<p className="font-medium text-foreground">
									{safeDurationMin !== undefined ? `${safeDurationMin} min` : "—"}
								</p>
							</div>
							<div className="text-right">
								<p className="text-muted">Interactions</p>
								<p className="font-medium text-foreground">
									{safeTotalInteractions ?? "—"}
								</p>
							</div>
							<div className="text-right">
								<p className="text-muted">Tokens</p>
								<p className="font-medium text-foreground">
									{safeInputTokens.toLocaleString()} /{" "}
									{safeOutputTokens.toLocaleString()}
								</p>
							</div>
							<div className="text-right">
								<p className="text-muted">Cost</p>
								<p className="font-mono font-medium text-foreground">
									$
									{calculateCost(
										safeInputTokens,
										safeOutputTokens,
										safeModelUsed,
									).toFixed(4)}
								</p>
							</div>
							{safeSuccessScore !== undefined ? (
								<div className="text-right">
									<p className="flex items-center justify-end text-muted">
										Score
										<InfoTooltip text="Session quality score (0–100): earns points for a git commit (+20), high output ratio (+15), and skills used (+5 each, max 3); loses points for errors (−2 each) and abandoned sessions." />
									</p>
									<p
										className={
											safeSuccessScore >= 70
												? "font-semibold text-status-success-icon"
												: safeSuccessScore >= 40
													? "font-semibold text-status-warning-icon"
													: "font-semibold text-status-error-icon"
										}
									>
										{safeSuccessScore.toFixed(0)}/100
									</p>
								</div>
							) : null}
							{Object.keys(safeSubagents).length > 0 ? (
								<div className="text-right">
									<p className="text-muted">Subagents</p>
									<p className="font-medium text-foreground">
										{Object.keys(safeSubagents).length}
									</p>
								</div>
							) : null}
						</div>
					</div>

					<div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
						{safeRepository ? (
							<div className="flex items-center gap-2 rounded-lg bg-status-info-bg px-3 py-1">
								<GitBranch className="h-4 w-4 text-accent" />
								<span className="font-medium text-status-info-text">
									{safeRepository}
								</span>
							</div>
						) : null}
						{safeGitBranch ? (
							<div className="flex items-center gap-2 rounded-lg bg-status-info-bg px-3 py-1">
								<GitBranch className="h-4 w-4 text-accent" />
								<span className="font-medium text-status-info-text">
									{safeGitBranch}
								</span>
							</div>
						) : null}
						{safeGitSha ? (
							<div className="group relative">
								<div className="cursor-default rounded-lg bg-status-info-bg px-3 py-1">
									<div className="flex items-center gap-2">
										<GitCommitHorizontal className="h-4 w-4 text-accent" />
										<span className="font-medium text-status-info-text">
											{safeGitSha.slice(0, 8)}
										</span>
										<ChevronDown className="h-3 w-3 text-accent transition-transform group-hover:rotate-180" />
									</div>
								</div>
								<div className="absolute top-full left-0 z-20 mt-1 hidden min-w-[280px] rounded-lg border border-border bg-input p-2 shadow-lg group-hover:block">
									<div className="flex items-center justify-between gap-2 px-2 py-1">
										<span className="select-all font-mono text-xs text-foreground">
											{safeGitSha}
										</span>
										<button
											type="button"
											onClick={() => void handleCopyGitSha(safeGitSha)}
											className="rounded p-1 hover:bg-hover"
											title="Copy commit SHA"
										>
											<Copy className="h-3 w-3 text-muted" />
										</button>
									</div>
								</div>
							</div>
						) : null}
						{safeModelUsed ? (
							<div className="rounded-lg bg-surface px-3 py-1">
								<span className="font-mono text-xs text-subheading">
									{safeModelUsed}
								</span>
							</div>
						) : null}

						<div className="ml-auto flex flex-wrap gap-2">
							{[...new Set(safeSkills)].map((skill) => (
								<span
									key={skill}
									className="rounded bg-purple-100 px-2 py-1 text-xs text-purple-800"
								>
									skill:{skill}
								</span>
							))}
							{[...new Set(safeSlashCommands)].map((command) => (
								<span
									key={command}
									className="rounded bg-green-100 px-2 py-1 text-xs text-green-800"
								>
									/{command}
								</span>
							))}
							{Object.keys(safeSubagents).map((agent) => (
								<span
									key={agent}
									className="rounded bg-orange-100 px-2 py-1 text-xs text-orange-800"
								>
									agent:{agent}
								</span>
							))}
						</div>
					</div>
				</div>

				<div className="shrink-0 border-y border-border bg-surface px-8">
					<button
						type="button"
						className="border-b-2 border-foreground px-4 py-2 text-sm font-medium text-foreground"
					>
						Conversation
					</button>
				</div>

				<div className="flex-1 overflow-y-auto">
					<div className="flex min-h-full">
						<div className="min-w-0 flex-1 px-8 py-6">
							<ConversationView
								content={safeContent}
								onTokenDataReady={handleTokenDataReady}
								onToolActivityReady={handleToolActivityReady}
							/>
						</div>

						<div className="w-[36rem] shrink-0 border-l border-border">
							<div className="sticky top-0 px-6 py-4">
								<TokenUsageChart data={tokenData} totalMessages={totalMessages} />
								<div className="my-4 border-t border-border pt-4">
									<ToolActivityChart
										data={toolActivityData}
										totalMessages={totalMessages}
									/>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</SessionDetailErrorBoundary>
	);
}
