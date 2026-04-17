import type {
	DimensionAnalysisInput,
	SessionAnalytics,
} from "@rudel/api-routes";
import { useDeferredValue, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDateRange } from "@/features/analytics/date-range/useDateRange";
import { useAnalyticsQuery } from "@/features/analytics/queries/useAnalyticsQuery";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { DashboardDateControls } from "@/features/dashboard/components/DashboardDateControls";
import { DashboardSessionsSnapshotSection } from "@/features/dashboard/components/DashboardSessionsSnapshotSection";
import { buildDashboardSessionTabMetrics } from "@/features/dashboard/data/dashboard-tab-adapters";
import { SessionsDimensionAnalysisSection } from "@/features/sessions/components/SessionsDimensionAnalysisSection";
import type { SessionsFilterOption } from "@/features/sessions/components/SessionsFilterMenu";
import { SessionsTableSection } from "@/features/sessions/components/SessionsTableSection";
import {
	getSessionRepositoryLabelFromValue,
	getSessionRepositoryValue,
} from "@/features/sessions/components/session-utils";
import { useCanViewSession } from "@/features/workspace/hooks/useCanViewSession";
import { useUserMap } from "@/features/workspace/hooks/useUserMap";
import { useTrackDashboardView } from "@/hooks/useTrackDashboardView";
import { orpc } from "@/lib/orpc";
import { getSessionDetailPath } from "@/lib/session-paths";

const SNAPSHOT_SESSION_LIMIT = 10;
const TABLE_SESSION_LIMIT = 100;

function buildDeveloperOptions(
	sessions: SessionAnalytics[],
	userMap: Record<string, string>,
): SessionsFilterOption[] {
	return Array.from(new Set(sessions.map((session) => session.user_id)))
		.sort((leftUserId, rightUserId) => {
			const leftLabel = userMap[leftUserId] ?? leftUserId;
			const rightLabel = userMap[rightUserId] ?? rightUserId;
			return leftLabel.localeCompare(rightLabel);
		})
		.map((userId) => ({
			label: userMap[userId] ?? userId,
			value: userId,
		}));
}

function buildRepositoryOptions(
	sessions: SessionAnalytics[],
): SessionsFilterOption[] {
	return Array.from(
		new Set(sessions.map((session) => getSessionRepositoryValue(session))),
	)
		.sort((leftValue, rightValue) =>
			getSessionRepositoryLabelFromValue(leftValue).localeCompare(
				getSessionRepositoryLabelFromValue(rightValue),
			),
		)
		.map((value) => ({
			label: getSessionRepositoryLabelFromValue(value),
			value,
		}));
}

function filterSessions({
	sessions,
	selectedDevelopers,
	selectedRepositories,
}: {
	sessions: SessionAnalytics[];
	selectedDevelopers: string[];
	selectedRepositories: string[];
}) {
	return sessions.filter((session) => {
		const repositoryValue = getSessionRepositoryValue(session);
		const matchesRepository =
			selectedRepositories.length === 0 ||
			selectedRepositories.includes(repositoryValue);
		const matchesDeveloper =
			selectedDevelopers.length === 0 ||
			selectedDevelopers.includes(session.user_id);

		return matchesRepository && matchesDeveloper;
	});
}

export function SessionsPage() {
	const navigate = useNavigate();
	const { meta } = useDateRange();
	const { userMap } = useUserMap();
	const canViewSession = useCanViewSession();
	const { trackDrilldown } = useAnalyticsTracking();

	const [selectedRepositories, setSelectedRepositories] = useState<string[]>(
		[],
	);
	const [selectedDevelopers, setSelectedDevelopers] = useState<string[]>([]);
	const [dimension, setDimension] =
		useState<DimensionAnalysisInput["dimension"]>("project_path");
	const [metric, setMetric] =
		useState<DimensionAnalysisInput["metric"]>("session_count");
	const [splitBy, setSplitBy] = useState<
		DimensionAnalysisInput["dimension"] | "none"
	>("none");
	const [showPercentage, setShowPercentage] = useState(false);

	const deferredDimension = useDeferredValue(dimension);
	const deferredMetric = useDeferredValue(metric);
	const deferredSplitBy = useDeferredValue(splitBy);

	const {
		data: summaryComparison,
		isPending: isSummaryPending,
		isError: isSummaryError,
	} = useAnalyticsQuery(
		orpc.analytics.sessions.summaryComparison.queryOptions({
			input: { days: meta.dayCount },
		}),
	);

	const {
		data: sessionsData,
		isPending: isSessionsPending,
		isError: isSessionsError,
	} = useAnalyticsQuery(
		orpc.analytics.sessions.list.queryOptions({
			input: {
				days: meta.dayCount,
				limit: TABLE_SESSION_LIMIT,
				sortBy: "session_date",
				sortOrder: "desc",
			},
		}),
	);

	const {
		data: dimensionData,
		isPending: isDimensionPending,
		isError: isDimensionError,
	} = useAnalyticsQuery(
		orpc.analytics.sessions.dimensionAnalysis.queryOptions({
			input: {
				days: meta.dayCount,
				dimension: deferredDimension,
				metric: deferredMetric,
				splitBy: deferredSplitBy === "none" ? undefined : deferredSplitBy,
				limit: 10,
			},
		}),
	);

	const sortedSessions = useMemo(
		() =>
			[...(sessionsData ?? [])].sort(
				(leftSession, rightSession) =>
					new Date(rightSession.session_date).getTime() -
					new Date(leftSession.session_date).getTime(),
			),
		[sessionsData],
	);

	const recentSessions = useMemo(
		() => sortedSessions.slice(0, SNAPSHOT_SESSION_LIMIT),
		[sortedSessions],
	);

	const repositoryOptions = useMemo(
		() => buildRepositoryOptions(sortedSessions),
		[sortedSessions],
	);

	const developerOptions = useMemo(
		() => buildDeveloperOptions(sortedSessions, userMap),
		[sortedSessions, userMap],
	);

	const filteredSessions = useMemo(
		() =>
			filterSessions({
				sessions: sortedSessions,
				selectedDevelopers,
				selectedRepositories,
			}),
		[selectedDevelopers, selectedRepositories, sortedSessions],
	);

	const headlineMetrics = useMemo(
		() => buildDashboardSessionTabMetrics(summaryComparison),
		[summaryComparison],
	);

	const sessionsSections = useMemo(
		() =>
			[
				{
					id: "summary_cards",
					state: isSummaryError
						? "error"
						: headlineMetrics.length > 0 && recentSessions.length > 0
							? "populated"
							: "empty",
					itemCount: headlineMetrics.length,
				},
				{
					id: "dimension_analysis",
					state: isDimensionError
						? "error"
						: (dimensionData?.length ?? 0) > 0
							? "populated"
							: "empty",
					itemCount: dimensionData?.length ?? 0,
				},
				{
					id: "sessions_table",
					state: isSessionsError
						? "error"
						: filteredSessions.length > 0
							? "populated"
							: "empty",
					itemCount: filteredSessions.length,
				},
			] as const,
		[
			dimensionData,
			filteredSessions.length,
			headlineMetrics.length,
			isDimensionError,
			isSessionsError,
			isSummaryError,
			recentSessions.length,
		],
	);

	useTrackDashboardView({
		isLoading: isSummaryPending || isSessionsPending || isDimensionPending,
		isError: isSummaryError || isSessionsError || isDimensionError,
		hasData: sortedSessions.length > 0,
		sections: [...sessionsSections],
		metrics: [
			{
				id: "total_sessions",
				value: summaryComparison?.current.total_sessions,
			},
			{
				id: "avg_session_duration_min",
				value: summaryComparison?.current.avg_session_duration_min,
			},
			{
				id: "avg_response_time_sec",
				value: summaryComparison?.current.avg_response_time_sec,
			},
		],
	});

	function handleOpenSession(session: SessionAnalytics) {
		if (!canViewSession(session.user_id)) {
			return;
		}

		const targetPath = getSessionDetailPath(session.session_id);
		trackDrilldown({
			drilldownMethod: "table_row",
			sourceComponent: "sessions_table",
			targetType: "session",
			targetId: session.session_id,
			targetPath,
		});
		navigate(targetPath);
	}

	return (
		<div className="dashboardy-page px-4 pb-6 pt-2 sm:px-6 lg:px-[76px] lg:pb-8">
			<div className="@container/dashboard-page mx-auto flex w-full flex-col gap-8">
				<header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex flex-col gap-1">
						<h1 className="dashboardy-section-title text-[1.65rem] leading-8 text-[color:var(--dashboardy-heading)]">
							Sessions
						</h1>
						<p className="max-w-2xl text-sm text-[color:var(--dashboardy-muted)] sm:text-[15px]">
							Track recent sessions, compare session mixes, and drill into the
							underlying work without changing the existing analytics model.
						</p>
					</div>
					<DashboardDateControls className="shrink-0" />
				</header>

				{isSummaryError || isSessionsError ? (
					<div className="rounded-[1.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-6 py-8 text-center text-sm text-[color:var(--dashboardy-muted)]">
						We couldn&apos;t load the session overview for this range.
					</div>
				) : (
					<DashboardSessionsSnapshotSection
						isMetricsPending={isSummaryPending}
						isSessionsPending={isSessionsPending}
						metrics={headlineMetrics}
						recentSessions={recentSessions}
						showDelta
						totalSessionCount={
							summaryComparison?.current.total_sessions ?? sortedSessions.length
						}
					/>
				)}

				<SessionsDimensionAnalysisSection
					data={dimensionData}
					dimension={dimension}
					metric={metric}
					splitBy={splitBy}
					showPercentage={showPercentage}
					userMap={userMap}
					isPending={isDimensionPending}
					isError={isDimensionError}
					onDimensionChange={setDimension}
					onMetricChange={setMetric}
					onSplitByChange={setSplitBy}
					onShowPercentageChange={setShowPercentage}
				/>

				<SessionsTableSection
					sessions={filteredSessions}
					repositoryOptions={repositoryOptions}
					developerOptions={developerOptions}
					selectedRepositories={selectedRepositories}
					selectedDevelopers={selectedDevelopers}
					onRepositorySelectionChange={setSelectedRepositories}
					onDeveloperSelectionChange={setSelectedDevelopers}
					onOpenSession={handleOpenSession}
					canOpenSession={(session) => canViewSession(session.user_id)}
					isLoading={isSessionsPending}
					isError={isSessionsError}
					userMap={userMap}
				/>
			</div>
		</div>
	);
}
