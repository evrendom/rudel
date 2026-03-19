import type { ProjectContributor, ProjectError } from "@rudel/api-routes";
import type { ColumnDef } from "@tanstack/react-table";
import { Activity, ArrowLeft, Clock, Code, Users, Zap } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import {
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { ChartCard } from "@/components/analytics/ChartCard";
import { DatePicker } from "@/components/analytics/DatePicker";
import { PageHeader } from "@/components/analytics/PageHeader";
import { StatCard } from "@/components/analytics/StatCard";
import { ChartLegend } from "@/components/charts/ChartLegend";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useAnalyticsQuery } from "@/hooks/useAnalyticsQuery";
import { useChartTheme } from "@/hooks/useChartTheme";
import { useTrackDashboardView } from "@/hooks/useTrackDashboardView";
import { useUserMap } from "@/hooks/useUserMap";
import { decodeProjectPath, formatUsername } from "@/lib/format";
import { orpc } from "@/lib/orpc";

export function ProjectDetailPage() {
	const { projectPath: encodedProjectPath } = useParams<{
		projectPath: string;
	}>();
	const projectPath = decodeProjectPath(encodedProjectPath || "");
	const { startDate, endDate, setStartDate, setEndDate, calculateDays } =
		useDateRange();
	const chartTheme = useChartTheme();
	const days = calculateDays();

	const { data: details, isLoading } = useAnalyticsQuery(
		orpc.analytics.projects.details.queryOptions({
			input: { projectPath, days },
		}),
	);

	const { data: contributors } = useAnalyticsQuery(
		orpc.analytics.projects.contributors.queryOptions({
			input: { projectPath, days },
		}),
	);

	const { data: features } = useAnalyticsQuery(
		orpc.analytics.projects.features.queryOptions({
			input: { projectPath, days },
		}),
	);

	const { data: errors } = useAnalyticsQuery(
		orpc.analytics.projects.errors.queryOptions({
			input: { projectPath, days },
		}),
	);

	useTrackDashboardView({
		isLoading,
		hasData: Boolean(details),
	});

	const { userMap } = useUserMap();

	const contributorChartData = useMemo(() => {
		if (!contributors) return [];
		return contributors.slice(0, 10).map((c) => ({
			name: formatUsername(c.user_id, userMap),
			sessions: c.sessions,
			hours: parseFloat((c.total_duration_min / 60).toFixed(1)),
		}));
	}, [contributors, userMap]);

	const contributorColumns = useMemo<ColumnDef<ProjectContributor>[]>(
		() => [
			{
				accessorFn: (row) => formatUsername(row.user_id, userMap),
				id: "developer",
				header: "Developer",
				cell: ({ row }) => (
					<span className="font-medium text-foreground">
						{formatUsername(row.original.user_id, userMap)}
					</span>
				),
			},
			{
				accessorKey: "sessions",
				header: "Sessions",
				cell: ({ row }) => (
					<span className="text-muted">{row.original.sessions}</span>
				),
			},
			{
				accessorKey: "contribution_percentage",
				header: "Contribution",
				cell: ({ row }) => (
					<span className="text-muted">
						{row.original.contribution_percentage.toFixed(0)}%
					</span>
				),
			},
			{
				accessorFn: (row) => row.total_duration_min,
				id: "total_time",
				header: "Total Time",
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
						{(row.original.total_tokens / 1000).toFixed(0)}K
					</span>
				),
			},
		],
		[userMap],
	);

	const projectErrorColumns = useMemo<ColumnDef<ProjectError>[]>(
		() => [
			{
				accessorKey: "error_pattern",
				header: "Error Type",
				cell: ({ row }) => (
					<span className="font-medium text-foreground">
						{row.original.error_pattern}
					</span>
				),
			},
			{
				accessorKey: "occurrences",
				header: "Occurrences",
				cell: ({ row }) => (
					<span className="text-muted">{row.original.occurrences}</span>
				),
			},
			{
				accessorKey: "affected_users",
				header: "Affected Users",
				cell: ({ row }) => (
					<span className="text-muted">{row.original.affected_users}</span>
				),
			},
			{
				accessorFn: (row) => new Date(row.last_seen).getTime(),
				id: "last_seen",
				header: "Last Seen",
				cell: ({ row }) => (
					<span className="text-muted">
						{new Date(row.original.last_seen).toLocaleDateString()}
					</span>
				),
			},
		],
		[],
	);

	if (isLoading || !details) {
		return (
			<div className="px-8 py-6">
				<PageHeader
					title="Project Details"
					description="Loading project information..."
					actions={
						<Button variant="outline" size="sm" asChild>
							<Link to="/dashboard/projects">
								<ArrowLeft className="h-4 w-4" />
								Back to Projects
							</Link>
						</Button>
					}
				/>
				<AnalyticsCard>
					<p className="text-center text-muted">Loading...</p>
				</AnalyticsCard>
			</div>
		);
	}

	const projectName = projectPath.split("/").pop() || "Unknown Project";

	return (
		<div className="px-8 py-6">
			<PageHeader
				title={projectName}
				description="Project analytics and contributor insights"
				actions={
					<div className="flex items-center gap-3">
						<DatePicker
							startDate={startDate}
							endDate={endDate}
							onStartDateChange={setStartDate}
							onEndDateChange={setEndDate}
						/>
						<Button variant="outline" size="sm" asChild>
							<Link to="/dashboard/projects">
								<ArrowLeft className="h-4 w-4" />
								Back
							</Link>
						</Button>
					</div>
				}
			/>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
				<StatCard
					title="Total Sessions"
					value={details.total_sessions}
					icon={Activity}
					iconColor="text-blue-600"
				/>
				<StatCard
					title="Contributors"
					value={details.contributors_count}
					icon={Users}
					iconColor="text-green-600"
				/>
				<StatCard
					title="Total Tokens"
					value={`${(details.total_tokens / 1000000).toFixed(1)}M`}
					icon={Code}
					iconColor="text-purple-600"
				/>
				<StatCard
					title="Total Time"
					value={`${(details.total_duration_min / 60).toFixed(0)}h`}
					icon={Clock}
					iconColor="text-orange-600"
				/>
			</div>

			{features && (
				<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
					<AnalyticsCard>
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm text-muted">Subagents</p>
								<p className="text-2xl font-bold text-heading">
									{features.subagents_adoption_rate.toFixed(0)}%
								</p>
							</div>
							<Zap className="h-8 w-8 text-blue-600" />
						</div>
					</AnalyticsCard>
					<AnalyticsCard>
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm text-muted">Skills</p>
								<p className="text-2xl font-bold text-heading">
									{features.skills_adoption_rate.toFixed(0)}%
								</p>
							</div>
							<Zap className="h-8 w-8 text-purple-600" />
						</div>
					</AnalyticsCard>
					<AnalyticsCard>
						<div className="flex items-center justify-between">
							<div>
								<p className="text-sm text-muted">Slash Commands</p>
								<p className="text-2xl font-bold text-heading">
									{features.slash_commands_adoption_rate.toFixed(0)}%
								</p>
							</div>
							<Zap className="h-8 w-8 text-green-600" />
						</div>
					</AnalyticsCard>
				</div>
			)}

			{contributorChartData.length > 0 && (
				<ChartCard title="Contributors" className="mb-8">
					<ResponsiveContainer width="100%" height={350}>
						<BarChart
							data={contributorChartData}
							margin={{ top: 5, right: 0, left: 20, bottom: 5 }}
						>
							<CartesianGrid
								strokeDasharray="3 3"
								stroke={chartTheme.gridStroke}
							/>
							<XAxis
								dataKey="name"
								interval={0}
								stroke={chartTheme.axisStroke}
								tick={{ fontSize: 12 }}
								tickFormatter={(v: string) =>
									v.length > 12 ? `${v.slice(0, 12)}…` : v
								}
							/>
							<YAxis yAxisId="left" stroke={chartTheme.axisStroke} />
							<YAxis
								yAxisId="right"
								orientation="right"
								stroke={chartTheme.axisStroke}
							/>
							<Tooltip
								contentStyle={{
									backgroundColor: chartTheme.tooltipBg,
									borderColor: chartTheme.tooltipBorder,
								}}
							/>
							<Legend
								layout="vertical"
								align="right"
								verticalAlign="top"
								width={140}
								content={({ payload }) => <ChartLegend payload={payload} />}
							/>
							<Bar
								yAxisId="left"
								dataKey="sessions"
								fill="#3b82f6"
								name="Sessions"
							/>
							<Bar
								yAxisId="right"
								dataKey="hours"
								fill="#10b981"
								name="Hours"
							/>
						</BarChart>
					</ResponsiveContainer>
					{contributors && (
						<div className="mt-6">
							<DataTable
								columns={contributorColumns}
								data={contributors}
								analyticsId="project_detail_contributors"
								defaultSorting={[{ id: "sessions", desc: true }]}
								defaultPageSize={50}
							/>
						</div>
					)}
				</ChartCard>
			)}

			{errors && errors.length > 0 && (
				<AnalyticsCard className="mb-8">
					<h2 className="text-xl font-bold text-heading mb-4">
						Errors Encountered
					</h2>
					<DataTable
						columns={projectErrorColumns}
						data={errors}
						analyticsId="project_detail_errors"
						defaultSorting={[{ id: "occurrences", desc: true }]}
						defaultPageSize={50}
					/>
				</AnalyticsCard>
			)}
		</div>
	);
}
