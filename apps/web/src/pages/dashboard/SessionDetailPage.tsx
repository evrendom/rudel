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
import { useCallback, useState } from "react";
import { useParams } from "react-router-dom";
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

export function SessionDetailPage() {
	const { sessionId } = useParams<{ sessionId: string }>();
	const { userMap } = useUserMap();
	const { trackUtility } = useAnalyticsTracking();
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
	} = useQuery(
		orpc.analytics.sessions.detail.queryOptions({
			input: { sessionId: sessionId as string },
		}),
	);

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
							{session.session_archetype &&
								(() => {
									const style =
										archetypeStyles[session.session_archetype] ??
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
									{session.session_id.slice(0, 8)}...
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
								{formatRelativeTime(session.session_date)}
							</div>
							<div className="flex items-center gap-1">
								<User className="w-4 h-4" />
								{formatUsername(session.user_id, userMap)}
							</div>
						</div>
					</div>

					{/* KPIs — right side of header */}
					<div className="flex items-center gap-6 text-xs">
						<div className="text-right">
							<p className="text-muted">Duration</p>
							<p className="text-foreground font-medium">
								{session.duration_min !== undefined
									? `${session.duration_min} min`
									: "—"}
							</p>
						</div>
						<div className="text-right">
							<p className="text-muted">Interactions</p>
							<p className="text-foreground font-medium">
								{session.total_interactions ?? "—"}
							</p>
						</div>
						<div className="text-right">
							<p className="text-muted">Tokens</p>
							<p className="text-foreground font-medium">
								{session.input_tokens.toLocaleString()} /{" "}
								{session.output_tokens.toLocaleString()}
							</p>
						</div>
						<div className="text-right">
							<p className="text-muted">Cost</p>
							<p className="text-foreground font-mono font-medium">
								$
								{calculateCost(
									session.input_tokens,
									session.output_tokens,
								).toFixed(4)}
							</p>
						</div>
						{session.success_score !== undefined && (
							<div className="text-right">
								<p className="text-muted flex items-center">
									Score
									<InfoTooltip text="Session quality score (0–100): earns points for a git commit (+20), high output ratio (+15), and skills used (+5 each, max 3); loses points for errors (−2 each) and abandoned sessions." />
								</p>
								<p
									className={`font-semibold ${
										session.success_score >= 70
											? "text-status-success-icon"
											: session.success_score >= 40
												? "text-status-warning-icon"
												: "text-status-error-icon"
									}`}
								>
									{session.success_score.toFixed(0)}/100
								</p>
							</div>
						)}
						{Object.keys(session.subagents).length > 0 && (
							<div className="text-right">
								<p className="text-muted">Subagents</p>
								<p className="text-foreground font-medium">
									{Object.keys(session.subagents).length}
								</p>
							</div>
						)}
					</div>
				</div>

				<div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
					{session.repository && (
						<div className="flex items-center gap-2 px-3 py-1 bg-status-info-bg rounded-lg">
							<GitBranch className="w-4 h-4 text-accent" />
							<span className="text-status-info-text font-medium">
								{session.repository}
							</span>
						</div>
					)}
					{session.git_branch && (
						<div className="flex items-center gap-2 px-3 py-1 bg-status-info-bg rounded-lg">
							<GitBranch className="w-4 h-4 text-accent" />
							<span className="text-status-info-text font-medium">
								{session.git_branch}
							</span>
						</div>
					)}
					{session.git_sha && (
						<div className="group relative">
							<div className="flex items-center gap-2 px-3 py-1 bg-status-info-bg rounded-lg cursor-default">
								<GitCommitHorizontal className="w-4 h-4 text-accent" />
								<span className="text-status-info-text font-medium">
									{session.git_sha.slice(0, 8)}
								</span>
								<ChevronDown className="w-3 h-3 text-accent transition-transform group-hover:rotate-180" />
							</div>
							<div className="absolute top-full left-0 mt-1 bg-input border border-border rounded-lg shadow-lg z-20 p-2 min-w-[280px] hidden group-hover:block">
								<div className="flex items-center justify-between gap-2 px-2 py-1">
									<span className="text-xs font-mono text-foreground select-all">
										{session.git_sha}
									</span>
									<button
										type="button"
										onClick={() =>
											navigator.clipboard.writeText(session.git_sha as string)
										}
										className="p-1 hover:bg-hover rounded"
										title="Copy commit SHA"
									>
										<Copy className="w-3 h-3 text-muted" />
									</button>
								</div>
							</div>
						</div>
					)}
					{session.model_used && (
						<div className="px-3 py-1 bg-surface rounded-lg">
							<span className="text-subheading text-xs font-mono">
								{session.model_used}
							</span>
						</div>
					)}

					<div className="flex flex-wrap gap-2 ml-auto">
						{[...new Set(session.skills)].map((skill) => (
							<span
								key={skill}
								className="px-2 py-1 text-xs bg-purple-100 text-purple-800 rounded"
							>
								skill:{skill}
							</span>
						))}
						{[...new Set(session.slash_commands)].map((cmd) => (
							<span
								key={cmd}
								className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded"
							>
								/{cmd}
							</span>
						))}
						{Object.keys(session.subagents).map((agent) => (
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
						<ConversationView
							content={session.content}
							onTokenDataReady={handleTokenDataReady}
							onToolActivityReady={handleToolActivityReady}
						/>
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
