import type { SessionAnalytics } from "@rudel/api-routes";
import { ArrowUpRight, CheckCircle2, Clock3 } from "lucide-react";
import { Component, type ReactNode, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/app/ui/button";
import { Skeleton } from "@/app/ui/skeleton";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import {
	DashboardCellStack,
	DashboardGridTable,
	DashboardInlineOverflowList,
} from "@/features/dashboard/components/DashboardGridTable";
import { useCanViewSession } from "@/features/workspace/hooks/useCanViewSession";
import { useUserMap } from "@/hooks/useUserMap";
import {
	calculateCost,
	formatCompactNumber,
	formatMinutes,
	formatUsername,
} from "@/lib/format";
import { orpc } from "@/lib/orpc";
import { getSessionDetailPath } from "@/lib/session-paths";
import { formatRelativeTime } from "@/lib/time-utils";
import { cn } from "@/lib/utils";

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

function toOptionalString(value: unknown): string | null {
	return typeof value === "string" && value.length > 0 ? value : null;
}

function toStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

function toRecordKeys(value: unknown): string[] {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return [];
	}

	return Object.keys(value);
}

function formatSessionTimestamp(value: unknown) {
	if (typeof value !== "string" || value.length === 0) {
		return "Unknown";
	}

	const date = new Date(value.endsWith("Z") ? value : `${value}Z`);

	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}

function getLeafLabel(value: string | null | undefined) {
	if (!value) {
		return "Unknown";
	}

	const segments = value.split("/").filter(Boolean);
	return segments.at(-1) ?? value;
}

function getRepositoryTail(value: string | null | undefined) {
	if (!value) {
		return "Unknown repo";
	}

	const segments = value.split("/").filter(Boolean);

	if (segments.length >= 2) {
		return segments.slice(-2).join("/");
	}

	return segments[0] ?? value;
}

function formatArchetype(value: unknown) {
	if (typeof value !== "string" || value.length === 0) {
		return "Unknown";
	}

	return value
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function getFeatureItems(items: string[], limit = 4) {
	const uniqueItems = Array.from(new Set(items.filter(Boolean)));
	const visibleItems = uniqueItems.slice(0, limit);
	const hiddenCount = Math.max(uniqueItems.length - visibleItems.length, 0);

	return { hiddenCount, visibleItems };
}

function getSessionSkillItems(session: SessionAnalytics) {
	const skills = toStringArray(session.skills);

	return {
		hiddenItems: skills.slice(2),
		visibleItems: skills.slice(0, 2),
	};
}

const SESSION_PANEL_SKELETON_IDS = [
	"session-panel-skeleton-1",
	"session-panel-skeleton-2",
	"session-panel-skeleton-3",
	"session-panel-skeleton-4",
] as const;

class DashboardRecentSessionsPanelErrorBoundary extends Component<
	{ children: ReactNode },
	{ hasError: boolean }
> {
	override state = { hasError: false };

	static getDerivedStateFromError() {
		return { hasError: true };
	}

	override componentDidCatch(error: unknown) {
		console.error(
			"[DashboardRecentSessionsPanel] Failed to render recent sessions",
			error,
		);
	}

	override render() {
		if (this.state.hasError) {
			return (
				<div className="rounded-[1.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-6 py-8 text-center text-sm text-[color:var(--dashboardy-muted)] shadow-[var(--dashboardy-card-shadow)]">
					Unable to render recent session details for the current dataset.
				</div>
			);
		}

		return this.props.children;
	}
}

function SessionMetaStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-[1rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] px-3.5 py-3">
			<p className="text-sm/6 text-[color:var(--dashboardy-muted)]">{label}</p>
			<p className="mt-1 text-lg font-semibold tracking-tight text-[color:var(--dashboardy-heading)]">
				{value}
			</p>
		</div>
	);
}

function SessionContextRow({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="grid gap-1.5 border-t border-[color:var(--dashboardy-divider)] py-3 first:border-t-0 first:pt-0 last:pb-0">
			<p className="dashboardy-label">{label}</p>
			<p
				className={cn(
					"text-base/7 text-[color:var(--dashboardy-heading)] sm:text-sm/6",
					mono && "dashboardy-mono",
				)}
			>
				{value}
			</p>
		</div>
	);
}

function SessionFeatureGroup({
	chipClassName,
	emptyLabel,
	items,
	label,
	prefix,
}: {
	chipClassName: string;
	emptyLabel: string;
	items: string[];
	label: string;
	prefix?: string;
}) {
	const { hiddenCount, visibleItems } = getFeatureItems(items);

	return (
		<div className="grid gap-2">
			<p className="dashboardy-label">{label}</p>
			{visibleItems.length > 0 ? (
				<div className="flex flex-wrap gap-2">
					{visibleItems.map((item) => (
						<span
							key={`${label}:${item}`}
							className={cn(
								"inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold",
								chipClassName,
							)}
						>
							{prefix ? `${prefix}${item}` : item}
						</span>
					))}
					{hiddenCount > 0 ? (
						<span className="inline-flex items-center rounded-full border border-[color:var(--dashboardy-border)] px-2.5 py-1 text-sm font-semibold text-[color:var(--dashboardy-muted)]">
							+{hiddenCount} more
						</span>
					) : null}
				</div>
			) : (
				<p className="text-base/7 text-[color:var(--dashboardy-muted)] sm:text-sm/6">
					{emptyLabel}
				</p>
			)}
		</div>
	);
}

function DashboardRecentSessionsPanelFallback() {
	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
			<div className="overflow-x-auto">
				<div className="min-w-[68rem]">
					<div className="grid grid-cols-[minmax(180px,1.15fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(220px,1.1fr)_120px_120px] gap-6 px-3.5 text-[13px] font-semibold text-[color:var(--dashboardy-muted)]">
						<p>Time</p>
						<p>Developer</p>
						<p>Repository</p>
						<p>Skills used</p>
						<p>Tokens</p>
						<p>Duration</p>
					</div>
					<div className="grid gap-0">
						{SESSION_PANEL_SKELETON_IDS.map((skeletonId) => (
							<div
								key={skeletonId}
								className="grid min-h-12 grid-cols-[minmax(180px,1.15fr)_minmax(180px,1fr)_minmax(180px,1fr)_minmax(220px,1.1fr)_120px_120px] items-center gap-6 rounded-lg px-3.5 py-2 odd:bg-[color:var(--dashboardy-subsurface-strong)]"
							>
								<div className="grid gap-1.5">
									<Skeleton className="h-4 w-20 rounded-full" />
									<Skeleton className="h-3.5 w-24 rounded-full" />
								</div>
								<Skeleton className="h-4 w-28 rounded-full" />
								<Skeleton className="h-4 w-24 rounded-full" />
								<Skeleton className="h-4 w-40 rounded-full" />
								<Skeleton className="h-4 w-16 rounded-full" />
								<Skeleton className="h-4 w-16 rounded-full" />
							</div>
						))}
					</div>
				</div>
			</div>
			<Skeleton className="h-[25rem] w-full rounded-[1.4rem]" />
		</div>
	);
}

function DashboardRecentSessionsPanelContent({
	isLoading = false,
	sessions,
}: {
	isLoading?: boolean;
	sessions: SessionAnalytics[] | undefined;
}) {
	const navigate = useNavigate();
	const { userMap } = useUserMap();
	const canViewSession = useCanViewSession();
	const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
		null,
	);
	const recentSessions = sessions ?? [];
	const selectedSession = useMemo(() => {
		if (recentSessions.length === 0) {
			return null;
		}

		return (
			recentSessions.find(
				(session) => session.session_id === selectedSessionId,
			) ??
			recentSessions[0] ??
			null
		);
	}, [recentSessions, selectedSessionId]);
	const canViewSelectedSession = selectedSession
		? canViewSession(selectedSession.user_id)
		: false;
	const {
		data: selectedSessionDetail,
		isPending: isSelectedSessionDetailPending,
	} = useAnalyticsQuery({
		...orpc.analytics.sessions.detail.queryOptions({
			input: {
				sessionId:
					selectedSession?.session_id ?? "__dashboard-session-preview__",
			},
		}),
		enabled: selectedSession != null && canViewSelectedSession,
	});
	const resolvedSessionDetail = canViewSelectedSession
		? selectedSessionDetail
		: undefined;

	if (isLoading && recentSessions.length === 0) {
		return <DashboardRecentSessionsPanelFallback />;
	}

	if (recentSessions.length === 0) {
		return (
			<div className="grid gap-2 border-t border-[color:var(--dashboardy-divider)] pt-6">
				<p className="dashboardy-label">Last 10 sessions</p>
				<div className="rounded-[1.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-6 py-8 text-center text-sm text-[color:var(--dashboardy-muted)]">
					No sessions in the selected range.
				</div>
			</div>
		);
	}

	const repositoryLabel =
		toOptionalString(resolvedSessionDetail?.repository) ??
		toOptionalString(selectedSession?.repository) ??
		getLeafLabel(toOptionalString(selectedSession?.project_path));
	const gitBranch = toOptionalString(resolvedSessionDetail?.git_branch);
	const gitSha = toOptionalString(resolvedSessionDetail?.git_sha);
	const sessionArchetype =
		toOptionalString(resolvedSessionDetail?.session_archetype) ??
		toOptionalString(selectedSession?.session_archetype);
	const modelUsed =
		toOptionalString(resolvedSessionDetail?.model_used) ??
		toOptionalString(selectedSession?.model_used);
	const subagentLabels = resolvedSessionDetail
		? toRecordKeys(resolvedSessionDetail.subagents)
		: toStringArray(selectedSession?.subagent_types);
	const skillLabels = resolvedSessionDetail
		? toStringArray(resolvedSessionDetail.skills)
		: toStringArray(selectedSession?.skills);
	const slashCommandLabels = resolvedSessionDetail
		? toStringArray(resolvedSessionDetail.slash_commands)
		: toStringArray(selectedSession?.slash_commands);
	const durationLabel = selectedSession
		? formatMinutes(toNumber(selectedSession.duration_min))
		: "—";
	const tokensLabel = selectedSession
		? `${formatCompactNumber(toNumber(selectedSession.total_tokens))} tokens`
		: "—";
	const costLabel = selectedSession
		? `${calculateCost(
				toNumber(selectedSession.input_tokens),
				toNumber(selectedSession.output_tokens),
			).toFixed(4)} USD`
		: "—";
	const avgResponseLabel = selectedSession
		? `${toNumber(selectedSession.avg_period_sec).toFixed(1)}s`
		: "—";
	const lastInteractionLabel = resolvedSessionDetail?.last_interaction_date
		? formatSessionTimestamp(resolvedSessionDetail.last_interaction_date)
		: null;

	return (
		<div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)]">
			<div className="min-w-0">
				<div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between">
					<div className="grid gap-1.5">
						<p className="dashboardy-label">Last 10 sessions</p>
						<h2 className="dashboardy-section-title text-xl/7">
							Recent sessions
						</h2>
					</div>
					<p className="max-w-[34ch] text-sm/6 text-[color:var(--dashboardy-muted)] sm:text-right">
						Select a session to inspect its metadata without leaving the
						dashboard.
					</p>
				</div>
				<div className="mt-4 overflow-x-auto border-y border-[color:var(--dashboardy-divider)]">
					<div className="hidden md:block">
						<DashboardGridTable
							columns={[
								{
									id: "time",
									header: "Time",
									renderCell: (session) => (
										<DashboardCellStack
											primary={formatRelativeTime(
												toOptionalString(session.session_date) ??
													new Date().toISOString(),
											)}
											secondary={formatSessionTimestamp(session.session_date)}
											secondaryClassName="font-mono"
										/>
									),
								},
								{
									id: "developer",
									header: "Developer",
									renderCell: (session) => (
										<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
											{formatUsername(session.user_id, userMap)}
										</p>
									),
								},
								{
									id: "repository",
									header: "Repository",
									renderCell: (session) => (
										<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
											{getRepositoryTail(
												toOptionalString(session.repository) ??
													toOptionalString(session.project_path),
											)}
										</p>
									),
								},
								{
									id: "skills",
									header: "Skills used",
									renderCell: (session) => {
										const { hiddenItems, visibleItems } =
											getSessionSkillItems(session);

										return visibleItems.length > 0 ? (
											<p className="truncate text-[13px] font-medium text-[color:var(--dashboardy-heading)]">
												<DashboardInlineOverflowList
													visibleItems={visibleItems}
													hiddenItems={hiddenItems}
													overflowLabel={`${hiddenItems.length} more`}
												/>
											</p>
										) : (
											<span className="text-[12px] text-[color:var(--dashboardy-muted)]">
												—
											</span>
										);
									},
								},
								{
									id: "tokens",
									header: "Tokens",
									renderCell: (session) => (
										<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
											{formatCompactNumber(toNumber(session.total_tokens))}
										</p>
									),
								},
								{
									id: "duration",
									header: "Duration",
									renderCell: (session) => (
										<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
											{formatMinutes(toNumber(session.duration_min))}
										</p>
									),
								},
							]}
							rows={recentSessions}
							rowKey={(session) => session.session_id}
							className="overflow-visible"
							gridTemplateColumns="minmax(180px,1.15fr) minmax(180px,1fr) minmax(180px,1fr) minmax(220px,1.1fr) 120px 120px"
							minWidthClassName="min-w-[68rem]"
							bodyClassName="gap-0"
							onRowClick={(session) => setSelectedSessionId(session.session_id)}
							isRowSelected={(session) =>
								session.session_id === selectedSession?.session_id
							}
							rowClassName={(session, index) =>
								cn(
									"hover:bg-[color:var(--dashboardy-subsurface)]/80",
									index > 0 &&
										"border-t border-[color:var(--dashboardy-divider)]",
									session.session_id === selectedSession?.session_id &&
										"bg-[color:var(--dashboardy-row-hover)]",
								)
							}
						/>
					</div>
					<div className="grid md:hidden">
						{recentSessions.map((session, index) => {
							const isSelected =
								session.session_id === selectedSession?.session_id;

							return (
								<button
									key={session.session_id}
									type="button"
									aria-pressed={isSelected}
									className={cn(
										"grid gap-3 px-3.5 py-3 text-left transition-colors duration-200",
										index > 0 &&
											"border-t border-[color:var(--dashboardy-divider)]",
										isSelected
											? "bg-[color:var(--dashboardy-row-hover)]"
											: "hover:bg-[color:var(--dashboardy-subsurface)]/80",
									)}
									onClick={() => setSelectedSessionId(session.session_id)}
								>
									<div className="min-w-0">
										<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
											{formatRelativeTime(
												toOptionalString(session.session_date) ??
													new Date().toISOString(),
											)}
										</p>
										<p className="mt-0.5 font-mono text-[12px] text-[color:var(--dashboardy-muted)]">
											{formatSessionTimestamp(session.session_date)}
										</p>
									</div>
									<div className="min-w-0">
										<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
											{formatUsername(session.user_id, userMap)}
										</p>
									</div>
									<div className="min-w-0">
										<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
											{getRepositoryTail(
												toOptionalString(session.repository) ??
													toOptionalString(session.project_path),
											)}
										</p>
									</div>
									<div className="flex min-w-0 flex-wrap items-center gap-1.5">
										{(() => {
											const { hiddenItems, visibleItems } =
												getSessionSkillItems(session);

											return visibleItems.length > 0 ? (
												<p className="truncate text-[13px] font-medium text-[color:var(--dashboardy-heading)]">
													<DashboardInlineOverflowList
														visibleItems={visibleItems}
														hiddenItems={hiddenItems}
														overflowLabel={`${hiddenItems.length} more`}
													/>
												</p>
											) : (
												<span className="text-[12px] text-[color:var(--dashboardy-muted)]">
													—
												</span>
											);
										})()}
									</div>
									<div className="min-w-0">
										<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
											{formatCompactNumber(toNumber(session.total_tokens))}
										</p>
									</div>
									<div className="min-w-0">
										<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
											{formatMinutes(toNumber(session.duration_min))}
										</p>
									</div>
								</button>
							);
						})}
					</div>
				</div>
			</div>

			<div className="rounded-[1.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] shadow-[var(--dashboardy-card-shadow)]">
				<div className="flex flex-col gap-6 px-5 py-5 sm:px-6 sm:py-6">
					<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
						<div className="grid gap-1.5">
							<p className="dashboardy-label">Session detail</p>
							<h3 className="dashboardy-section-title text-[1.55rem]/[1.05] tracking-tight">
								{repositoryLabel}
							</h3>
							<p className="text-base/7 text-[color:var(--dashboardy-muted)] sm:text-sm/6">
								{selectedSession
									? `${formatUsername(toOptionalString(selectedSession.user_id) ?? "unknown-user", userMap)} • ${formatSessionTimestamp(selectedSession.session_date)}`
									: "Select a session"}
							</p>
						</div>
						{selectedSession && canViewSelectedSession ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() =>
									navigate(getSessionDetailPath(selectedSession.session_id))
								}
							>
								<ArrowUpRight />
								Open transcript
							</Button>
						) : null}
					</div>

					{selectedSession ? (
						<>
							<div className="flex flex-wrap gap-2">
								{modelUsed ? (
									<span className="inline-flex items-center rounded-full border border-[color:var(--dashboardy-chip-border)] bg-[color:var(--dashboardy-chip-surface)] px-2.5 py-1 text-sm font-semibold text-[color:var(--dashboardy-chip-foreground)]">
										{modelUsed}
									</span>
								) : null}
								{sessionArchetype ? (
									<span className="inline-flex items-center rounded-full border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] px-2.5 py-1 text-sm font-semibold text-[color:var(--dashboardy-heading)]">
										{formatArchetype(sessionArchetype)}
									</span>
								) : null}
								{selectedSession.has_commit ? (
									<span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--dashboardy-success-surface)] px-2.5 py-1 text-sm font-semibold text-[color:var(--dashboardy-success-foreground)]">
										<CheckCircle2 className="size-3.5" />
										Commit captured
									</span>
								) : null}
								{selectedSession.used_plan_mode ? (
									<span className="inline-flex items-center rounded-full bg-[color:var(--dashboardy-warning-surface)] px-2.5 py-1 text-sm font-semibold text-[color:var(--dashboardy-warning-foreground)]">
										Plan mode
									</span>
								) : null}
							</div>

							<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
								<SessionMetaStat label="Duration" value={durationLabel} />
								<SessionMetaStat label="Tokens" value={tokensLabel} />
								<SessionMetaStat label="Cost" value={costLabel} />
								<SessionMetaStat
									label="Avg response"
									value={avgResponseLabel}
								/>
								<SessionMetaStat
									label="Interactions"
									value={String(toNumber(selectedSession.total_interactions))}
								/>
							</div>

							<div className="grid gap-3 border-t border-[color:var(--dashboardy-divider)] pt-4">
								<SessionContextRow
									label="Project path"
									value={
										toOptionalString(selectedSession.project_path) ??
										"Unknown path"
									}
								/>
								{lastInteractionLabel ? (
									<SessionContextRow
										label="Last interaction"
										value={lastInteractionLabel}
									/>
								) : null}
								{gitBranch ? (
									<SessionContextRow label="Branch" value={gitBranch} />
								) : null}
								{gitSha ? (
									<SessionContextRow label="Commit SHA" value={gitSha} mono />
								) : null}
							</div>

							<div className="grid gap-4 border-t border-[color:var(--dashboardy-divider)] pt-4">
								<SessionFeatureGroup
									label="Skills"
									items={skillLabels}
									emptyLabel="No skills captured in this session."
									chipClassName="bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-100"
									prefix="skill:"
								/>
								<SessionFeatureGroup
									label="Slash commands"
									items={slashCommandLabels}
									emptyLabel="No slash commands captured in this session."
									chipClassName="bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-100"
									prefix="/"
								/>
								<SessionFeatureGroup
									label="Subagents"
									items={subagentLabels}
									emptyLabel="No subagents captured in this session."
									chipClassName="bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-100"
									prefix="agent:"
								/>
							</div>

							{!canViewSelectedSession ? (
								<div className="rounded-[1rem] bg-[color:var(--dashboardy-surface)] px-4 py-3 text-base/7 text-[color:var(--dashboardy-muted)] sm:text-sm/6">
									Transcript detail is limited to admins and to your own
									sessions. This preview stays at analytics-level metadata.
								</div>
							) : isSelectedSessionDetailPending ? (
								<div className="inline-flex items-center gap-2 text-base/7 text-[color:var(--dashboardy-muted)] sm:text-sm/6">
									<Clock3 className="size-4" />
									Loading full session detail…
								</div>
							) : null}
						</>
					) : (
						<div className="rounded-[1rem] border border-dashed border-[color:var(--dashboardy-border)] px-4 py-8 text-center text-sm text-[color:var(--dashboardy-muted)]">
							Choose a session from the list to inspect it.
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export function DashboardRecentSessionsPanel(props: {
	isLoading?: boolean;
	sessions: SessionAnalytics[] | undefined;
}) {
	return (
		<DashboardRecentSessionsPanelErrorBoundary>
			<DashboardRecentSessionsPanelContent {...props} />
		</DashboardRecentSessionsPanelErrorBoundary>
	);
}
