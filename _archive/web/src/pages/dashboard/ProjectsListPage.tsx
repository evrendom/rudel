import type { ProjectInvestment } from "@rudel/api-routes";
import type { ColumnDef } from "@tanstack/react-table";
import {
	Clock,
	DollarSign,
	FolderKanban,
	TrendingUp,
	Users,
	Zap,
} from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { ChartCard } from "@/components/analytics/ChartCard";
import { DatePicker } from "@/components/analytics/DatePicker";
import { PageHeader } from "@/components/analytics/PageHeader";
import { StatCard } from "@/components/analytics/StatCard";
import { ProjectTrendChart } from "@/components/charts/ProjectTrendChart";
import { DataTable } from "@/components/ui/data-table";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useAnalyticsQuery } from "@/hooks/useAnalyticsQuery";
import {
	type DashboardSection,
	useTrackDashboardView,
} from "@/hooks/useTrackDashboardView";
import { encodeProjectPath } from "@/lib/format";
import { orpc } from "@/lib/orpc";

function formatTokens(tokens: number) {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
	return tokens.toString();
}

const columns: ColumnDef<ProjectInvestment>[] = [
	{
		accessorKey: "project_path",
		header: "Project",
		cell: ({ row }) => {
			const remote = row.original.git_remote;
			const name = remote
				? remote.split("/").pop()
				: row.original.project_path.split("/").pop();
			return <span className="font-medium text-foreground">{name}</span>;
		},
	},
	{
		accessorKey: "sessions",
		header: "Sessions",
		cell: ({ row }) => (
			<span className="text-muted">{row.original.sessions}</span>
		),
	},
	{
		accessorFn: (row) => row.total_duration_min,
		id: "time",
		header: "Time",
		cell: ({ row }) => (
			<span className="text-muted">
				{(row.original.total_duration_min / 60).toFixed(1)}h
			</span>
		),
	},
	{
		accessorKey: "total_tokens",
		header: "Tokens",
		cell: ({ row }) => (
			<span className="text-muted">
				{formatTokens(row.original.total_tokens || 0)}
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
			const rate = row.original.success_rate || 0;
			const color =
				rate >= 70
					? "text-status-success-icon"
					: rate >= 50
						? "text-status-warning-icon"
						: "text-status-error-icon";
			return (
				<span className={`font-semibold ${color}`}>{rate.toFixed(0)}%</span>
			);
		},
	},
	{
		accessorKey: "cost",
		header: "Cost",
		cell: ({ row }) => (
			<span className="text-muted">${(row.original.cost || 0).toFixed(2)}</span>
		),
	},
	{
		accessorKey: "success_rate_trend",
		header: "Trend",
		cell: ({ row }) => {
			const trend = row.original.success_rate_trend || 0;
			const icon = trend > 0 ? "\u2191" : trend < 0 ? "\u2193" : "-";
			const color =
				trend > 0
					? "text-status-success-icon"
					: trend < 0
						? "text-status-error-icon"
						: "text-muted";
			return (
				<span className={`font-semibold ${color}`}>
					{icon} {Math.abs(trend).toFixed(1)}%
				</span>
			);
		},
	},
];

export function ProjectsListPage() {
	const navigate = useNavigate();
	const { startDate, endDate, setStartDate, setEndDate, calculateDays } =
		useDateRange();
	const days = calculateDays();

	const {
		data: projects,
		isLoading: projectsLoading,
		isError: projectsError,
	} = useAnalyticsQuery(
		orpc.analytics.projects.investment.queryOptions({ input: { days } }),
	);

	const {
		data: trendData,
		isLoading: trendLoading,
		isError: trendError,
	} = useAnalyticsQuery(
		orpc.analytics.projects.trends.queryOptions({ input: { days } }),
	);

	const sortedProjects = useMemo(() => projects ?? [], [projects]);

	const totalProjects = projects?.length ?? 0;
	const totalSessions = projects?.reduce((sum, p) => sum + p.sessions, 0) ?? 0;
	const totalHours =
		(projects?.reduce((sum, p) => sum + p.total_duration_min, 0) ?? 0) / 60;
	const totalCost = projects?.reduce((sum, p) => sum + (p.cost || 0), 0) ?? 0;
	const totalTokens =
		projects?.reduce((sum, p) => sum + (p.total_tokens || 0), 0) ?? 0;
	const avgUsersPerProject =
		totalProjects > 0
			? (
					(projects?.reduce((sum, p) => sum + p.unique_users, 0) ?? 0) /
					totalProjects
				).toFixed(1)
			: "0";
	const projectsIsLoading = projectsLoading || trendLoading;
	const projectsSections: DashboardSection[] = [
		{
			id: "summary_cards",
			state: projectsError ? "error" : "populated",
			itemCount: projectsError ? 0 : 6,
		},
		{
			id: "project_trends",
			state: trendError
				? "error"
				: (trendData?.length ?? 0) > 0
					? "populated"
					: "empty",
			itemCount: trendData?.length ?? 0,
		},
		{
			id: "project_details",
			state: projectsError
				? "error"
				: sortedProjects.length > 0
					? "populated"
					: "empty",
			itemCount: sortedProjects.length,
		},
	];
	const projectsMetrics = [
		{ id: "active_projects", value: totalProjects },
		{ id: "total_sessions", value: totalSessions },
		{ id: "total_hours", value: totalHours },
		{ id: "total_tokens", value: totalTokens },
		{ id: "total_cost", value: totalCost },
		{ id: "avg_users_per_project", value: Number(avgUsersPerProject) },
	];

	useTrackDashboardView({
		isLoading: projectsIsLoading,
		isError: projectsError,
		hasData: (projects?.length ?? 0) > 0,
		sections: projectsSections,
		metrics: projectsMetrics,
	});

	const handleRowClick = (row: ProjectInvestment) => {
		const key = row.repository || row.git_remote || row.project_path;
		const encodedPath = encodeProjectPath(key);
		navigate(`/dashboard/projects/${encodedPath}`);
	};

	if (projectsIsLoading) {
		return (
			<div className="px-8 py-6">
				<PageHeader
					title="Projects"
					description="Analyze project activity and team investment"
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
					<p className="text-center text-muted">Loading project metrics...</p>
				</AnalyticsCard>
			</div>
		);
	}

	return (
		<div className="px-8 py-6">
			<PageHeader
				title="Projects"
				description="Analyze project activity and team investment"
				actions={
					<DatePicker
						startDate={startDate}
						endDate={endDate}
						onStartDateChange={setStartDate}
						onEndDateChange={setEndDate}
					/>
				}
			/>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6 mb-8">
				<StatCard
					title="Active Projects"
					value={totalProjects}
					icon={FolderKanban}
					iconColor="text-blue-600"
				/>
				<StatCard
					title="Total Sessions"
					value={totalSessions.toLocaleString()}
					icon={TrendingUp}
					iconColor="text-green-600"
				/>
				<StatCard
					title="Total Time"
					value={totalHours.toFixed(0)}
					icon={Clock}
					iconColor="text-purple-600"
				/>
				<StatCard
					title="Total Tokens"
					value={formatTokens(totalTokens)}
					icon={Zap}
					iconColor="text-amber-600"
				/>
				<StatCard
					title="Total Cost"
					value={`$${totalCost.toFixed(2)}`}
					icon={DollarSign}
					iconColor="text-emerald-600"
				/>
				<StatCard
					title="Avg Users"
					value={avgUsersPerProject}
					icon={Users}
					iconColor="text-indigo-600"
				/>
			</div>

			{trendData && trendData.length > 0 && (
				<ChartCard
					title="Project Trends"
					description="Activity metrics over time split by project (top 10)"
					className="mb-8"
				>
					<ProjectTrendChart data={trendData} />
				</ChartCard>
			)}

			<AnalyticsCard>
				<h2 className="text-xl font-bold text-heading mb-4">Project Details</h2>
				<DataTable
					columns={columns}
					data={sortedProjects}
					analyticsId="projects_list"
					defaultSorting={[{ id: "sessions", desc: true }]}
					getRowAnalyticsValue={(row) => row.project_path}
					onRowClick={handleRowClick}
				/>
			</AnalyticsCard>
		</div>
	);
}
