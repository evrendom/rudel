import {
	Activity,
	Bot,
	FolderKanban,
	Sparkles,
	Terminal,
	Users,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { CliSetupHint } from "@/components/analytics/CliSetupHint";
import { DatePicker } from "@/components/analytics/DatePicker";
import { InsightCard } from "@/components/analytics/InsightCard";
import { NoSessionsInRange } from "@/components/analytics/NoSessionsInRange";
import { PageHeader } from "@/components/analytics/PageHeader";
import { StatCard } from "@/components/analytics/StatCard";
import { ModelTokensChart } from "@/components/charts/ModelTokensChart";
import { UsageTrendChart } from "@/components/charts/UsageTrendChart";
import { Spinner } from "@/components/ui/spinner";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useAnalyticsQuery } from "@/hooks/useAnalyticsQuery";
import { useDashboardAnalytics } from "@/hooks/useDashboardAnalytics";
import {
	type DashboardSection,
	useTrackDashboardView,
} from "@/hooks/useTrackDashboardView";
import { orpc } from "@/lib/orpc";
import {
	captureDashboardLoadFailed,
	getHttpStatusFromError,
	normalizeWebErrorCode,
} from "@/lib/product-analytics";

function deriveInsightKey(insight: {
	type: "trend" | "performer" | "alert" | "info";
	message: string;
	link?: string | null;
}) {
	return `${insight.type}:${insight.message}:${insight.link ?? "/dashboard"}`
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 96);
}

export function OverviewPage() {
	const { startDate, endDate, setStartDate, setEndDate } = useDateRange();
	const failedRangeKeyRef = useRef<string | null>(null);
	const { organizationId, userId, pageName, dateRangeDays } =
		useDashboardAnalytics();

	const {
		data: kpis,
		isPending: kpisLoading,
		isError: kpisError,
		error: kpisQueryError,
	} = useAnalyticsQuery(
		orpc.analytics.overview.kpis.queryOptions({
			input: { startDate, endDate },
		}),
	);

	const {
		data: usageTrendData,
		isPending: usageTrendLoading,
		isError: usageTrendError,
	} = useAnalyticsQuery(
		orpc.analytics.overview.usageTrend.queryOptions({
			input: { startDate, endDate },
		}),
	);

	const {
		data: modelTokensData,
		isPending: modelTokensLoading,
		isError: modelTokensError,
	} = useAnalyticsQuery(
		orpc.analytics.overview.modelTokensTrend.queryOptions({
			input: { startDate, endDate },
		}),
	);

	const {
		data: insights,
		isPending: insightsLoading,
		isError: insightsError,
	} = useAnalyticsQuery(
		orpc.analytics.overview.insights.queryOptions({
			input: { startDate, endDate },
		}),
	);

	const hasData = !kpisLoading && kpis && kpis.distinct_sessions > 0;
	const hasAnySessions = kpis && kpis.total_sessions > 0;
	const showDatePicker = hasData || (!kpisLoading && hasAnySessions);
	const overviewIsLoading =
		kpisLoading || usageTrendLoading || modelTokensLoading || insightsLoading;
	const overviewSections: DashboardSection[] = [
		{
			id: "kpi_cards",
			state: kpisError ? "error" : hasData ? "populated" : "empty",
			itemCount: hasData ? 6 : 0,
		},
		{
			id: "quick_insights",
			state: insightsError
				? "error"
				: (insights?.length ?? 0) > 0
					? "populated"
					: "empty",
			itemCount: insights?.length ?? 0,
		},
		{
			id: "usage_trend",
			state: usageTrendError
				? "error"
				: (usageTrendData?.length ?? 0) > 0
					? "populated"
					: "empty",
			itemCount: usageTrendData?.length ?? 0,
		},
		{
			id: "model_tokens",
			state: modelTokensError
				? "error"
				: (modelTokensData?.length ?? 0) > 0
					? "populated"
					: "empty",
			itemCount: modelTokensData?.length ?? 0,
		},
	];
	const overviewMetrics = [
		{ id: "distinct_users", value: kpis?.distinct_users },
		{ id: "distinct_sessions", value: kpis?.distinct_sessions },
		{ id: "distinct_projects", value: kpis?.distinct_projects },
		{ id: "distinct_subagents", value: kpis?.distinct_subagents },
		{ id: "distinct_slash_commands", value: kpis?.distinct_slash_commands },
		{ id: "distinct_skills", value: kpis?.distinct_skills },
	];

	useTrackDashboardView({
		isLoading: overviewIsLoading,
		isError: kpisError,
		hasData: Boolean(hasData),
		insightCount: insightsError ? 0 : (insights?.length ?? 0),
		sections: overviewSections,
		metrics: overviewMetrics,
	});

	useEffect(() => {
		if (
			!organizationId ||
			!userId ||
			pageName !== "overview" ||
			dateRangeDays == null
		) {
			return;
		}

		if (!kpisLoading && kpisError) {
			const failedRangeKey = `${organizationId}:${pageName}:${startDate}:${endDate}`;
			if (failedRangeKeyRef.current === failedRangeKey) {
				return;
			}

			failedRangeKeyRef.current = failedRangeKey;
			captureDashboardLoadFailed({
				organization_id: organizationId,
				user_id: userId,
				page_name: pageName,
				query_name: "overview_kpis",
				error_code: normalizeWebErrorCode(kpisQueryError),
				date_range_days: dateRangeDays,
				is_blocking: true,
				http_status: getHttpStatusFromError(kpisQueryError),
			});
		}
	}, [
		dateRangeDays,
		endDate,
		kpisError,
		kpisLoading,
		kpisQueryError,
		organizationId,
		pageName,
		startDate,
		userId,
	]);

	return (
		<div className="px-8 py-6">
			<PageHeader
				title="Dashboard Overview"
				description="Track your team's Claude Code usage and metrics"
				actions={
					showDatePicker ? (
						<DatePicker
							startDate={startDate}
							endDate={endDate}
							onStartDateChange={setStartDate}
							onEndDateChange={setEndDate}
						/>
					) : undefined
				}
			/>

			{kpisLoading && (
				<div className="flex items-center justify-center py-12">
					<div className="text-center">
						<Spinner size="lg" className="mb-4" />
						<p className="text-muted">Loading dashboard data...</p>
					</div>
				</div>
			)}

			{!kpisLoading && !hasData && hasAnySessions && <NoSessionsInRange />}

			{!kpisLoading && (kpisError || (kpis && kpis.total_sessions === 0)) && (
				<CliSetupHint />
			)}

			{hasData && (
				<>
					<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
						<StatCard
							title="Distinct Users"
							value={kpis.distinct_users.toLocaleString()}
							icon={Users}
							iconColor="text-green-600"
							href="/dashboard/developers"
							linkLabel="Go to users"
						/>
						<StatCard
							title="Distinct Sessions"
							value={kpis.distinct_sessions.toLocaleString()}
							icon={Activity}
							iconColor="text-blue-600"
							href="/dashboard/sessions"
							linkLabel="Go to sessions"
						/>
						<StatCard
							title="Distinct Projects"
							value={kpis.distinct_projects.toLocaleString()}
							icon={FolderKanban}
							iconColor="text-purple-600"
							href="/dashboard/projects"
							linkLabel="Go to projects"
						/>
						<StatCard
							title="Distinct Subagents"
							value={kpis.distinct_subagents.toLocaleString()}
							icon={Bot}
							iconColor="text-orange-600"
							href="/dashboard/sessions"
							linkLabel="Go to sessions"
						/>
						<StatCard
							title="Slash Commands"
							value={kpis.distinct_slash_commands.toLocaleString()}
							icon={Terminal}
							iconColor="text-cyan-600"
							href="/dashboard/sessions"
							linkLabel="Go to sessions"
						/>
						<StatCard
							title="Distinct Skills"
							value={kpis.distinct_skills.toLocaleString()}
							icon={Sparkles}
							iconColor="text-pink-600"
							href="/dashboard/sessions"
							linkLabel="Go to sessions"
						/>
					</div>

					{organizationId && userId && insights && insights.length > 0 && (
						<div className="mb-8">
							<h2 className="text-xl font-bold text-heading mb-4">
								Quick Insights
							</h2>
							<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
								{insights.map((insight, index) => (
									<InsightCard
										// biome-ignore lint/suspicious/noArrayIndexKey: static insights list
										key={index}
										insight={{
											insight_key: deriveInsightKey({
												type: insight.type as
													| "trend"
													| "performer"
													| "alert"
													| "info",
												message: insight.message,
												link: insight.link,
											}),
											type: insight.type as
												| "trend"
												| "performer"
												| "alert"
												| "info",
											severity: insight.severity,
											message: insight.message,
											link: insight.link || "/dashboard",
										}}
										positionIndex={index}
									/>
								))}
							</div>
						</div>
					)}

					{usageTrendData && usageTrendData.length > 0 && (
						<AnalyticsCard className="mb-8">
							<h2 className="text-xl font-bold text-heading mb-4">
								Usage Trends
							</h2>
							<p className="text-sm text-muted mb-6">
								Track key metrics over time - switch between metric pairs to see
								different views
							</p>
							<UsageTrendChart
								data={usageTrendData}
								showRollingAverage={false}
							/>
						</AnalyticsCard>
					)}

					{modelTokensData && modelTokensData.length > 0 && (
						<AnalyticsCard className="mb-8">
							<h2 className="text-xl font-bold text-heading mb-4">
								Tokens by Model
							</h2>
							<p className="text-sm text-muted mb-6">
								Token consumption broken down by model type over time
							</p>
							<ModelTokensChart data={modelTokensData} />
						</AnalyticsCard>
					)}
				</>
			)}
		</div>
	);
}
