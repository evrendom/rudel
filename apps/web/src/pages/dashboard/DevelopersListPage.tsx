import type { DeveloperSummary } from "@rudel/api-routes";
import type { ColumnDef } from "@tanstack/react-table";
import {
	Activity,
	ArrowDown,
	ArrowUp,
	Clock,
	Code,
	Minus,
	UserCheck,
	Users,
} from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { ChartCard } from "@/components/analytics/ChartCard";
import { DatePicker } from "@/components/analytics/DatePicker";
import { PageHeader } from "@/components/analytics/PageHeader";
import { StatCard } from "@/components/analytics/StatCard";
import { DeveloperTrendChart } from "@/components/charts/DeveloperTrendChart";
import { DataTable } from "@/components/ui/data-table";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAnalyticsQuery } from "@/hooks/useAnalyticsQuery";
import { useFullOrganization } from "@/hooks/useFullOrganization";
import {
	type DashboardSection,
	useTrackDashboardView,
} from "@/hooks/useTrackDashboardView";
import { useUserMap } from "@/hooks/useUserMap";
import { formatUsername } from "@/lib/format";
import { orpc } from "@/lib/orpc";

export function DevelopersListPage() {
	const navigate = useNavigate();
	const { startDate, endDate, setStartDate, setEndDate, calculateDays } =
		useDateRange();
	const days = calculateDays();

	const { activeOrg } = useOrganization();
	const { data: fullOrg } = useFullOrganization(activeOrg?.id);
	const memberCount = fullOrg?.members.length ?? null;

	const {
		data: developers,
		isLoading: developersLoading,
		isError: developersError,
	} = useAnalyticsQuery(
		orpc.analytics.developers.list.queryOptions({ input: { days } }),
	);

	const {
		data: trendsData,
		isLoading: trendsLoading,
		isError: trendsError,
	} = useAnalyticsQuery(
		orpc.analytics.developers.trends.queryOptions({ input: { days } }),
	);

	const { userMap } = useUserMap();

	const columns = useMemo<ColumnDef<DeveloperSummary>[]>(
		() => [
			{
				accessorFn: (row) => formatUsername(row.user_id, userMap),
				id: "developer",
				header: "Developer",
				cell: ({ row }) => (
					<div className="flex items-center">
						<div className="flex-shrink-0 h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
							<span className="text-blue-600 font-semibold text-sm">
								{formatUsername(row.original.user_id, userMap)
									.substring(0, 2)
									.toUpperCase()}
							</span>
						</div>
						<div className="ml-4">
							<div className="text-sm font-medium text-foreground">
								{formatUsername(row.original.user_id, userMap)}
							</div>
						</div>
					</div>
				),
			},
			{
				accessorKey: "total_sessions",
				header: "Sessions",
				cell: ({ row }) => (
					<span className="text-muted">{row.original.total_sessions}</span>
				),
			},
			{
				accessorKey: "active_days",
				header: "Active Days",
				cell: ({ row }) => (
					<span className="text-muted">{row.original.active_days}</span>
				),
			},
			{
				accessorKey: "total_tokens",
				header: "Total Tokens",
				cell: ({ row }) => (
					<span className="text-muted">
						{(row.original.total_tokens / 1000).toFixed(0)}K
					</span>
				),
			},
			{
				accessorKey: "success_rate",
				header: () => (
					<span className="flex items-center">
						Success Rate
						<InfoTooltip text="Average session quality score (0–100): rewards git commits, high output ratio, and skill usage; deducts for errors and abandoned sessions." />
					</span>
				),
				cell: ({ row }) => {
					const rate = row.original.success_rate;
					const color =
						rate >= 70
							? "text-status-success-icon"
							: rate >= 50
								? "text-status-warning-icon"
								: "text-status-error-icon";
					return (
						<span className={`font-medium ${color}`}>{rate.toFixed(0)}%</span>
					);
				},
			},
			{
				accessorKey: "cost",
				header: "Cost",
				cell: ({ row }) => (
					<span className="text-muted">${row.original.cost.toFixed(2)}</span>
				),
			},
			{
				accessorKey: "success_rate_trend",
				header: "Trend",
				cell: ({ row }) => {
					const trend = row.original.success_rate_trend;
					return (
						<div className="flex items-center">
							{trend > 0 && (
								<>
									<ArrowUp className="w-4 h-4 text-status-success-icon mr-1" />
									<span className="text-status-success-icon font-medium">
										+{trend.toFixed(0)}%
									</span>
								</>
							)}
							{trend < 0 && (
								<>
									<ArrowDown className="w-4 h-4 text-status-error-icon mr-1" />
									<span className="text-status-error-icon font-medium">
										{trend.toFixed(0)}%
									</span>
								</>
							)}
							{trend === 0 && (
								<>
									<Minus className="w-4 h-4 text-muted mr-1" />
									<span className="text-muted">0%</span>
								</>
							)}
						</div>
					);
				},
			},
			{
				accessorKey: "avg_session_duration_min",
				header: "Avg Session",
				cell: ({ row }) => (
					<span className="text-muted">
						{row.original.avg_session_duration_min.toFixed(0)}m
					</span>
				),
			},
			{
				accessorFn: (row) => new Date(row.last_active_date).getTime(),
				id: "last_active",
				header: "Last Active",
				cell: ({ row }) => (
					<span className="text-muted">
						{new Date(row.original.last_active_date).toLocaleDateString()}
					</span>
				),
			},
		],
		[userMap],
	);

	const totalSessions =
		developers?.reduce((sum, d) => sum + d.total_sessions, 0) ?? 0;
	const totalTokens =
		developers?.reduce((sum, d) => sum + d.total_tokens, 0) ?? 0;
	const totalHours =
		(developers?.reduce((sum, d) => sum + d.total_duration_min, 0) ?? 0) / 60;
	const developersIsLoading = developersLoading || trendsLoading;
	const developersSections: DashboardSection[] = [
		{
			id: "summary_cards",
			state: developersError ? "error" : "populated",
			itemCount: developersError ? 0 : 5,
		},
		{
			id: "developer_list",
			state: developersError
				? "error"
				: (developers?.length ?? 0) > 0
					? "populated"
					: "empty",
			itemCount: developers?.length ?? 0,
		},
		{
			id: "developer_trends",
			state: trendsError
				? "error"
				: (trendsData?.length ?? 0) > 0
					? "populated"
					: "empty",
			itemCount: trendsData?.length ?? 0,
		},
	];
	const developersMetrics = [
		{ id: "team_members", value: memberCount },
		{ id: "active_developers", value: developers?.length ?? 0 },
		{ id: "total_sessions", value: totalSessions },
		{ id: "total_tokens", value: totalTokens },
		{ id: "total_hours", value: totalHours },
	];

	useTrackDashboardView({
		isLoading: developersIsLoading,
		isError: developersError,
		hasData: (developers?.length ?? 0) > 0,
		sections: developersSections,
		metrics: developersMetrics,
	});

	if (developersIsLoading) {
		return (
			<div className="px-8 py-6">
				<PageHeader
					title="Developers"
					description="Individual developer activity and metrics"
					actions={
						<DatePicker
							startDate={startDate}
							endDate={endDate}
							onStartDateChange={setStartDate}
							onEndDateChange={setEndDate}
						/>
					}
				/>
				<AnalyticsCard>
					<p className="text-center text-muted">Loading developers...</p>
				</AnalyticsCard>
			</div>
		);
	}

	return (
		<div className="px-8 py-6">
			<PageHeader
				title="Developers"
				description="Individual developer activity and metrics"
				actions={
					<DatePicker
						startDate={startDate}
						endDate={endDate}
						onStartDateChange={setStartDate}
						onEndDateChange={setEndDate}
					/>
				}
			/>

			{/* Summary Stats */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
				<StatCard
					title="Team Members"
					value={memberCount ?? "..."}
					icon={Users}
					iconColor="text-blue-600"
				/>
				<StatCard
					title="Active Developers"
					value={developers?.length ?? 0}
					icon={UserCheck}
					iconColor="text-cyan-600"
				/>
				<StatCard
					title="Total Sessions"
					value={totalSessions.toLocaleString()}
					icon={Activity}
					iconColor="text-green-600"
				/>
				<StatCard
					title="Total Tokens"
					value={`${(totalTokens / 1000000).toFixed(1)}M`}
					icon={Code}
					iconColor="text-purple-600"
				/>
				<StatCard
					title="Total Hours"
					value={totalHours.toFixed(0)}
					icon={Clock}
					iconColor="text-orange-600"
				/>
			</div>

			{/* Developers Table */}
			<AnalyticsCard>
				<h2 className="text-xl font-bold text-heading mb-4">Developer List</h2>
				<DataTable
					columns={columns}
					data={developers ?? []}
					analyticsId="developers_list"
					defaultSorting={[{ id: "total_sessions", desc: true }]}
					getRowAnalyticsValue={(row) => row.user_id}
					onRowClick={(row) => navigate(`/dashboard/developers/${row.user_id}`)}
				/>
			</AnalyticsCard>

			{/* Developer Trend Chart */}
			{trendsData && trendsData.length > 0 && (
				<ChartCard
					title="Developer Activity Trends"
					description="Activity metrics over time split by developer"
					className="mt-8"
				>
					<DeveloperTrendChart data={trendsData} userMap={userMap} />
				</ChartCard>
			)}
		</div>
	);
}
