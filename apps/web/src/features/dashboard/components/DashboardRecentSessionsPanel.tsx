import type { SessionAnalytics } from "@rudel/api-routes";
import { Component, type ReactNode } from "react";
import { Skeleton } from "@/app/ui/skeleton";
import {
	DashboardCellStack,
	DashboardGridTable,
	DashboardInlineOverflowList,
} from "@/features/dashboard/components/DashboardGridTable";
import { useUserMap } from "@/hooks/useUserMap";
import {
	formatCompactNumber,
	formatMinutes,
	formatUsername,
} from "@/lib/format";
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
					Unable to render recent sessions for the current dataset.
				</div>
			);
		}

		return this.props.children;
	}
}

function DashboardRecentSessionsPanelFallback() {
	return (
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
	);
}

function DashboardRecentSessionsPanelContent({
	isLoading = false,
	sessions,
}: {
	isLoading?: boolean;
	sessions: SessionAnalytics[] | undefined;
}) {
	const { userMap } = useUserMap();
	const recentSessions = sessions ?? [];

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

	return (
		<div className="min-w-0">
			<div className="flex flex-col gap-2 px-1 sm:flex-row sm:items-end sm:justify-between">
				<div className="grid gap-1.5">
					<p className="dashboardy-label">Last 10 sessions</p>
					<h2 className="dashboardy-section-title text-xl/7">
						Recent sessions
					</h2>
				</div>
				<p className="max-w-[34ch] text-sm/6 text-[color:var(--dashboardy-muted)] sm:text-right">
					The latest sessions in the selected range.
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
						rowClassName={(_session, index) =>
							cn(
								"hover:bg-[color:var(--dashboardy-subsurface)]/80",
								index > 0 &&
									"border-t border-[color:var(--dashboardy-divider)]",
							)
						}
					/>
				</div>
				<div className="grid md:hidden">
					{recentSessions.map((session, index) => (
						<div
							key={session.session_id}
							className={cn(
								"grid gap-3 px-3.5 py-3 transition-colors duration-200 hover:bg-[color:var(--dashboardy-subsurface)]/80",
								index > 0 &&
									"border-t border-[color:var(--dashboardy-divider)]",
							)}
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
						</div>
					))}
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
