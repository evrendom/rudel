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
import { Component, type ReactNode, useState } from "react";
import { useParams } from "react-router-dom";
import { ConversationView } from "@/components/conversation/ConversationView";
import { TokenUsageChart } from "@/components/conversation/TokenUsageChart";
import { ToolActivityChart } from "@/components/conversation/ToolActivityChart";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { buildConversationArtifacts } from "@/features/conversation-internal/lib/conversation-analysis";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { useTrackDashboardView } from "@/hooks/useTrackDashboardView";
import { useUserMap } from "@/hooks/useUserMap";
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

class SessionDetailErrorBoundary extends Component<
	{ children: ReactNode },
	{ hasError: boolean }
> {
	override state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	override componentDidCatch(error: unknown) {
		console.error("[SessionDetailPage] Failed to render session detail", error);
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

function SessionDetailPageContent() {
	const { sessionId } = useParams<{ sessionId: string }>();
	const { userMap } = useUserMap();
	const { trackUtility } = useAnalyticsTracking();
	const [copied, setCopied] = useState(false);

	const {
		data: session,
		isLoading,
		error,
	} = useQuery({
		...orpc.analytics.sessions.detail.queryOptions({
			input: { sessionId: sessionId as string },
		}),
		enabled: Boolean(sessionId),
	});

	useTrackDashboardView({
		isLoading,
		isError: Boolean(error),
		hasData: Boolean(session),
	});

	const copySessionId = () => {
		if (session) {
			trackUtility({
				utilityName: "copy_session_id",
				componentId: "session_detail_page",
			});
			navigator.clipboard.writeText(session.session_id);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="animate-pulse space-y-4 w-full max-w-md">
					<div className="h-8 bg-hover rounded w-1/3" />
					<div className="h-4 bg-hover rounded w-1/2" />
					<div className="h-4 bg-hover rounded w-2/3" />
				</div>
			</div>
		);
	}

	const isForbidden =
		error &&
		"code" in (error as unknown as Record<string, unknown>) &&
		(error as unknown as Record<string, unknown>).code === "FORBIDDEN";
	const safeContent = toContentString(session?.content);
	const { tokenData, toolActivityData, totalMessages } =
		buildConversationArtifacts(safeContent);

	if (isForbidden) {
		return (
			<div className="flex items-center justify-center h-full">
				<div className="text-center">
					<p className="text-status-error-icon text-lg font-semibold mb-2">
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
			<div className="flex items-center justify-center h-full">
				<div className="text-center">
					<p className="text-status-error-icon text-lg font-semibold mb-2">
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

	return (
		<div className="flex flex-col h-full">
			{/* Session Header — pinned, never scrolls */}
			<div className="shrink-0 bg-input px-8 py-4">
				<div className="flex items-start justify-between">
					<div>
						<div className="flex items-center gap-3 mb-2">
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
											className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${style.bg} ${style.text}`}
										>
											{style.label}
										</span>
									);
								})()}
						</div>
						<div className="flex items-center gap-4 text-sm text-muted">
							<div className="flex items-center gap-2">
								<span className="font-mono text-xs bg-surface px-2 py-1 rounded">
									{safeSessionId.slice(0, 8)}...
								</span>
								<button
									type="button"
									onClick={copySessionId}
									className="p-1 hover:bg-hover rounded"
									title="Copy session ID"
								>
									{copied ? (
										<CheckCircle2 className="w-4 h-4 text-status-success-icon" />
									) : (
										<Copy className="w-4 h-4 text-muted" />
									)}
								</button>
							</div>
							<div className="flex items-center gap-1">
								<Clock className="w-4 h-4" />
								{formatRelativeTime(safeSessionDate)}
							</div>
							<div className="flex items-center gap-1">
								<User className="w-4 h-4" />
								{formatUsername(safeUserId, userMap)}
							</div>
						</div>
					</div>

					{/* KPIs — right side of header */}
					<div className="flex items-center gap-6 text-xs">
						<div className="text-right">
							<p className="text-muted">Duration</p>
							<p className="text-foreground font-medium">
								{safeDurationMin !== undefined ? `${safeDurationMin} min` : "—"}
							</p>
						</div>
						<div className="text-right">
							<p className="text-muted">Interactions</p>
							<p className="text-foreground font-medium">
								{safeTotalInteractions ?? "—"}
							</p>
						</div>
						<div className="text-right">
							<p className="text-muted">Tokens</p>
							<p className="text-foreground font-medium">
								{safeInputTokens.toLocaleString()} /{" "}
								{safeOutputTokens.toLocaleString()}
							</p>
						</div>
						<div className="text-right">
							<p className="text-muted">Cost</p>
							<p className="text-foreground font-mono font-medium">
								$
								{calculateCost(
									safeInputTokens,
									safeOutputTokens,
									safeModelUsed,
								).toFixed(4)}
							</p>
						</div>
						{safeSuccessScore !== undefined && (
							<div className="text-right">
								<p className="text-muted flex items-center">
									Score
									<InfoTooltip text="Session quality score (0–100): earns points for a git commit (+20), high output ratio (+15), and skills used (+5 each, max 3); loses points for errors (−2 each) and abandoned sessions." />
								</p>
								<p
									className={`font-semibold ${
										safeSuccessScore >= 70
											? "text-status-success-icon"
											: safeSuccessScore >= 40
												? "text-status-warning-icon"
												: "text-status-error-icon"
									}`}
								>
									{safeSuccessScore.toFixed(0)}/100
								</p>
							</div>
						)}
						{Object.keys(safeSubagents).length > 0 && (
							<div className="text-right">
								<p className="text-muted">Subagents</p>
								<p className="text-foreground font-medium">
									{Object.keys(safeSubagents).length}
								</p>
							</div>
						)}
					</div>
				</div>

				<div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
					{safeRepository && (
						<div className="flex items-center gap-2 px-3 py-1 bg-status-info-bg rounded-lg">
							<GitBranch className="w-4 h-4 text-accent" />
							<span className="text-status-info-text font-medium">
								{safeRepository}
							</span>
						</div>
					)}
					{safeGitBranch && (
						<div className="flex items-center gap-2 px-3 py-1 bg-status-info-bg rounded-lg">
							<GitBranch className="w-4 h-4 text-accent" />
							<span className="text-status-info-text font-medium">
								{safeGitBranch}
							</span>
						</div>
					)}
					{safeGitSha && (
						<div className="group relative">
							<div className="flex items-center gap-2 px-3 py-1 bg-status-info-bg rounded-lg cursor-default">
								<GitCommitHorizontal className="w-4 h-4 text-accent" />
								<span className="text-status-info-text font-medium">
									{safeGitSha.slice(0, 8)}
								</span>
								<ChevronDown className="w-3 h-3 text-accent transition-transform group-hover:rotate-180" />
							</div>
							<div className="absolute top-full left-0 mt-1 bg-input border border-border rounded-lg shadow-lg z-20 p-2 min-w-[280px] hidden group-hover:block">
								<div className="flex items-center justify-between gap-2 px-2 py-1">
									<span className="text-xs font-mono text-foreground select-all">
										{safeGitSha}
									</span>
									<button
										type="button"
										onClick={() => navigator.clipboard.writeText(safeGitSha)}
										className="p-1 hover:bg-hover rounded"
										title="Copy commit SHA"
									>
										<Copy className="w-3 h-3 text-muted" />
									</button>
								</div>
							</div>
						</div>
					)}
					{safeModelUsed && (
						<div className="px-3 py-1 bg-surface rounded-lg">
							<span className="text-subheading text-xs font-mono">
								{safeModelUsed}
							</span>
						</div>
					)}

					<div className="flex flex-wrap gap-2 ml-auto">
						{[...new Set(safeSkills)].map((skill) => (
							<span
								key={skill}
								className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded"
							>
								skill:{skill}
							</span>
						))}
						{[...new Set(safeSlashCommands)].map((cmd) => (
							<span
								key={cmd}
								className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded"
							>
								/{cmd}
							</span>
						))}
						{Object.keys(safeSubagents).map((agent) => (
							<span
								key={agent}
								className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded"
							>
								agent:{agent}
							</span>
						))}
					</div>
				</div>
			</div>

			{/* Tab subheader */}
			<div className="shrink-0 bg-surface border-y border-border px-8 flex">
				<button
					type="button"
					className="px-4 py-2 text-sm font-medium text-foreground border-b-2 border-foreground"
				>
					Conversation
				</button>
			</div>

			{/* Scrollable content — two-column layout */}
			<div className="flex-1 overflow-y-auto">
				<div className="flex">
					{/* Conversation — left */}
					<div className="flex-1 min-w-0 py-6 px-8">
						<ConversationView content={safeContent} />
					</div>

					{/* Stats panel — right */}
					<div className="w-[36rem] shrink-0 border-l border-border">
						<div className="sticky top-0 px-6 py-4">
							<TokenUsageChart data={tokenData} totalMessages={totalMessages} />
							<div className="border-t border-border my-4 pt-4">
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
	);
}

export function SessionDetailPage() {
	return (
		<SessionDetailErrorBoundary>
			<SessionDetailPageContent />
		</SessionDetailErrorBoundary>
	);
}
