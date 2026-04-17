import type { SessionAnalytics } from "@rudel/api-routes";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import {
	DashboardCellStack,
	DashboardGridTable,
} from "@/features/dashboard/components/DashboardGridTable";
import { DashboardTokenCostCell } from "@/features/dashboard/components/DashboardTokenCostCell";
import {
	SessionsFilterMenu,
	type SessionsFilterOption,
} from "@/features/sessions/components/SessionsFilterMenu";
import {
	formatSessionTimestamp,
	getSessionRepositoryLabel,
	getSessionRepositoryValue,
} from "@/features/sessions/components/session-utils";
import { formatMinutes, formatUsername } from "@/lib/format";
import { formatRelativeTime } from "@/lib/time-utils";
import { cn } from "@/lib/utils";

function getSuccessTone(successScore: number) {
	if (successScore >= 70) {
		return "text-emerald-600";
	}

	if (successScore >= 40) {
		return "text-amber-600";
	}

	return "text-rose-600";
}

function buildEmptyStateCopy({
	isError,
	isLoading,
}: {
	isError: boolean;
	isLoading: boolean;
}) {
	if (isError) {
		return "We couldn't load recent sessions for this range.";
	}

	if (isLoading) {
		return "Loading recent sessions...";
	}

	return "No sessions matched the current filters.";
}

export function SessionsTableSection({
	sessions,
	repositoryOptions,
	developerOptions,
	selectedRepositories,
	selectedDevelopers,
	onRepositorySelectionChange,
	onDeveloperSelectionChange,
	onOpenSession,
	canOpenSession,
	isLoading,
	isError,
	userMap,
}: {
	sessions: SessionAnalytics[];
	repositoryOptions: SessionsFilterOption[];
	developerOptions: SessionsFilterOption[];
	selectedRepositories: string[];
	selectedDevelopers: string[];
	onRepositorySelectionChange: (nextValues: string[]) => void;
	onDeveloperSelectionChange: (nextValues: string[]) => void;
	onOpenSession: (session: SessionAnalytics) => void;
	canOpenSession: (session: SessionAnalytics) => boolean;
	isLoading: boolean;
	isError: boolean;
	userMap: Record<string, string>;
}) {
	const { trackFilterChange } = useAnalyticsTracking();

	return (
		<section className="flex flex-col gap-4">
			<div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 className="dashboardy-section-title text-xl/7">
						Recent sessions
					</h2>
					<p className="text-sm text-[color:var(--dashboardy-muted)]">
						Filter the latest sessions in the selected range and drill into any
						session you can access.
					</p>
				</div>
				<div className="flex flex-wrap items-center justify-end gap-2">
					<SessionsFilterMenu
						label="Repositories"
						options={repositoryOptions}
						selectedValues={selectedRepositories}
						onSelectionChange={(nextValues) => {
							trackFilterChange({
								filterName: "sessions_repository_filter",
								filterCategory: "multi_select",
								changeAction: "set",
								sourceComponent: "sessions_table",
								selectionCount:
									nextValues.length === 0
										? repositoryOptions.length
										: nextValues.length,
								affectedScope: "table",
							});
							onRepositorySelectionChange(nextValues);
						}}
					/>
					<SessionsFilterMenu
						label="Developers"
						options={developerOptions}
						selectedValues={selectedDevelopers}
						onSelectionChange={(nextValues) => {
							trackFilterChange({
								filterName: "sessions_developer_filter",
								filterCategory: "multi_select",
								changeAction: "set",
								sourceComponent: "sessions_table",
								selectionCount:
									nextValues.length === 0
										? developerOptions.length
										: nextValues.length,
								affectedScope: "table",
							});
							onDeveloperSelectionChange(nextValues);
						}}
					/>
				</div>
			</div>
			<div className="rounded-[1.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-3 py-3 sm:px-4">
				<DashboardGridTable
					columns={[
						{
							id: "time",
							header: "Time",
							renderCell: (session) => (
								<DashboardCellStack
									primary={formatRelativeTime(session.session_date)}
									secondary={formatSessionTimestamp(session.session_date)}
									primaryClassName="font-medium"
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
							renderCell: (session) => {
								const repositoryValue = getSessionRepositoryValue(session);

								return (
									<p
										className="truncate font-medium text-[color:var(--dashboardy-heading)]"
										title={repositoryValue}
									>
										{getSessionRepositoryLabel(session)}
									</p>
								);
							},
						},
						{
							id: "duration",
							header: "Duration",
							renderCell: (session) => (
								<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
									{formatMinutes(session.duration_min)}
								</p>
							),
						},
						{
							id: "success",
							header: "Success",
							renderCell: (session) => (
								<DashboardCellStack
									primary={
										<span
											className={cn(
												"tabular-nums",
												getSuccessTone(session.success_score),
											)}
										>
											{Math.round(session.success_score)}
										</span>
									}
									secondary="out of 100"
									primaryClassName="font-semibold"
									secondaryClassName="font-medium"
								/>
							),
						},
						{
							id: "cost",
							header: "Cost",
							renderCell: (session) => (
								<DashboardTokenCostCell
									inputTokens={session.input_tokens}
									outputTokens={session.output_tokens}
									model={session.model_used}
								/>
							),
						},
					]}
					rows={sessions}
					rowKey={(session) => session.session_id}
					gridTemplateColumns="minmax(132px,1.1fr) minmax(170px,1.25fr) minmax(170px,1.25fr) minmax(110px,0.8fr) minmax(120px,0.8fr) minmax(130px,0.9fr)"
					minWidthClassName="min-w-[60rem]"
					onRowClick={onOpenSession}
					isRowClickable={canOpenSession}
					rowClassName={(session) =>
						canOpenSession(session)
							? "hover:bg-[color:var(--dashboardy-subsurface-strong)]"
							: "opacity-75"
					}
					emptyState={
						<div className="flex min-h-48 items-center justify-center rounded-[1.1rem] border border-dashed border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] px-6 text-center text-sm text-[color:var(--dashboardy-muted)]">
							{buildEmptyStateCopy({ isError, isLoading })}
						</div>
					}
				/>
			</div>
		</section>
	);
}
