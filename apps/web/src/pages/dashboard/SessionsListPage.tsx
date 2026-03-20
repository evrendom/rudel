import type {
	DimensionAnalysisInput,
	SessionAnalytics,
} from "@rudel/api-routes";
import type { ColumnDef } from "@tanstack/react-table";
import { Activity, Clock, Timer } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { ChartCard } from "@/components/analytics/ChartCard";
import { DatePicker } from "@/components/analytics/DatePicker";
import { MultiSelect } from "@/components/analytics/MultiSelect";
import { PageHeader } from "@/components/analytics/PageHeader";
import { StatCard } from "@/components/analytics/StatCard";
import { DimensionAnalysisChart } from "@/components/charts/DimensionAnalysisChart";
import { DataTable } from "@/components/ui/data-table";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useAnalyticsQuery } from "@/hooks/useAnalyticsQuery";
import { useCanViewSession } from "@/hooks/useCanViewSession";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import {
	type DashboardSection,
	useTrackDashboardView,
} from "@/hooks/useTrackDashboardView";
import { useUserMap } from "@/hooks/useUserMap";
import { calculateCost, formatUsername } from "@/lib/format";
import { orpc } from "@/lib/orpc";

export function SessionsListPage() {
	const navigate = useNavigate();
	const { startDate, endDate, setStartDate, setEndDate, calculateDays } =
		useDateRange();
	const days = calculateDays();
	const { trackFilterChange } = useAnalyticsTracking();

	const [selectedRepositories, setSelectedRepositories] = useState<string[]>(
		[],
	);
	const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

	const [selectedDimension, setSelectedDimension] =
		useState<DimensionAnalysisInput["dimension"]>("project_path");
	const [selectedMetric, setSelectedMetric] =
		useState<DimensionAnalysisInput["metric"]>("session_count");
	const [selectedSplitBy, setSelectedSplitBy] = useState<
		DimensionAnalysisInput["dimension"] | ""
	>("");
	const [showPercentage, setShowPercentage] = useState(false);

	const [debouncedDimension, setDebouncedDimension] =
		useState<DimensionAnalysisInput["dimension"]>("project_path");
	const [debouncedMetric, setDebouncedMetric] =
		useState<DimensionAnalysisInput["metric"]>("session_count");
	const [debouncedSplitBy, setDebouncedSplitBy] = useState<
		DimensionAnalysisInput["dimension"] | ""
	>("");

	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedDimension(selectedDimension);
			setDebouncedMetric(selectedMetric);
			setDebouncedSplitBy(selectedSplitBy);
		}, 300);
		return () => clearTimeout(timer);
	}, [selectedDimension, selectedMetric, selectedSplitBy]);

	const {
		data: summary,
		isLoading: summaryLoading,
		isError: summaryError,
	} = useAnalyticsQuery(
		orpc.analytics.sessions.summary.queryOptions({ input: { days } }),
	);

	const {
		data: comparison,
		isLoading: comparisonLoading,
		isError: comparisonError,
	} = useAnalyticsQuery(
		orpc.analytics.sessions.summaryComparison.queryOptions({
			input: { days },
		}),
	);

	const {
		data: sessions,
		isLoading: sessionsLoading,
		isError: sessionsError,
	} = useAnalyticsQuery(
		orpc.analytics.sessions.list.queryOptions({
			input: { days, limit: 100, sortBy: "session_date", sortOrder: "desc" },
		}),
	);

	const { userMap } = useUserMap();
	const canViewSession = useCanViewSession();

	const {
		data: dimensionData,
		isLoading: dimensionLoading,
		isError: dimensionError,
	} = useAnalyticsQuery(
		orpc.analytics.sessions.dimensionAnalysis.queryOptions({
			input: {
				days,
				dimension: debouncedDimension,
				metric: debouncedMetric,
				splitBy: debouncedSplitBy || undefined,
				limit: 10,
			},
		}),
	);

	const columns = useMemo<ColumnDef<SessionAnalytics>[]>(
		() => [
			{
				accessorKey: "session_id",
				header: "Session ID",
				cell: ({ row }) => (
					<span className="text-accent font-mono text-xs">
						{row.original.session_id.slice(0, 8)}...
					</span>
				),
			},
			{
				accessorFn: (row) => new Date(row.session_date).getTime(),
				id: "date",
				header: "Date",
				cell: ({ row }) => (
					<div>
						<span className="text-foreground">
							{new Date(row.original.session_date).toLocaleDateString()}
						</span>
						<br />
						<span className="text-xs text-muted">
							{new Date(row.original.session_date).toLocaleTimeString()}
						</span>
					</div>
				),
			},
			{
				accessorFn: (row) => formatUsername(row.user_id, userMap),
				id: "user",
				header: "User",
				cell: ({ row }) => (
					<span className="text-subheading">
						{formatUsername(row.original.user_id, userMap)}
					</span>
				),
			},
			{
				accessorKey: "project_path",
				header: "Project",
				cell: ({ row }) => (
					<div
						className="max-w-xs truncate"
						title={row.original.git_remote || row.original.project_path}
					>
						{row.original.git_remote
							? row.original.git_remote.split("/").pop()
							: row.original.project_path.split("/").pop() ||
								row.original.project_path}
					</div>
				),
			},
			{
				accessorKey: "duration_min",
				header: "Duration",
				cell: ({ row }) => (
					<span className="text-foreground">
						{row.original.duration_min.toFixed(0)} min
					</span>
				),
			},
			{
				accessorKey: "success_score",
				header: () => (
					<span className="flex items-center">
						Success Score
						<InfoTooltip text="Session quality score (0–100): earns points for a git commit (+20), high output ratio (+15), and skills used (+5 each, max 3); loses points for errors (−2 each) and abandoned sessions." />
					</span>
				),
				cell: ({ row }) => {
					const score = row.original.success_score;
					const color =
						score >= 70
							? "text-status-success-icon"
							: score >= 40
								? "text-status-warning-icon"
								: "text-status-error-icon";
					return (
						<>
							<span className={`font-semibold ${color}`}>
								{score.toFixed(0)}
							</span>
							<span className="text-xs text-muted"> / 100</span>
						</>
					);
				},
			},
			{
				accessorFn: (row) => calculateCost(row.input_tokens, row.output_tokens),
				id: "cost",
				header: "Cost",
				cell: ({ row }) => (
					<span className="text-foreground font-mono">
						$
						{calculateCost(
							row.original.input_tokens,
							row.original.output_tokens,
						).toFixed(4)}
					</span>
				),
			},
		],
		[userMap],
	);

	const filteredSessions = useMemo(() => {
		if (!sessions) return [];
		return sessions.filter((session) => {
			const repoMatch =
				selectedRepositories.length === 0 ||
				(session.repository &&
					selectedRepositories.includes(session.repository));
			const userMatch =
				selectedUsers.length === 0 || selectedUsers.includes(session.user_id);
			return repoMatch && userMatch;
		});
	}, [sessions, selectedRepositories, selectedUsers]);

	const repositories = useMemo(() => {
		if (!sessions) return [];
		return Array.from(
			new Set(sessions.map((s) => s.repository).filter(Boolean)),
		).sort() as string[];
	}, [sessions]);

	const userOptions = useMemo(() => {
		return Object.entries(userMap).map(([userId, name]) => ({
			id: userId,
			label: name,
		}));
	}, [userMap]);

	const sessionsIsLoading =
		summaryLoading || comparisonLoading || sessionsLoading || dimensionLoading;
	const sessionsSections: DashboardSection[] = [
		{
			id: "summary_cards",
			state:
				summaryError || comparisonError
					? "error"
					: summary && comparison
						? "populated"
						: "empty",
			itemCount: summary && comparison ? 3 : 0,
		},
		{
			id: "dimension_analysis",
			state: dimensionError
				? "error"
				: (dimensionData?.length ?? 0) > 0
					? "populated"
					: "empty",
			itemCount: dimensionData?.length ?? 0,
		},
		{
			id: "sessions_table",
			state: sessionsError
				? "error"
				: filteredSessions.length > 0
					? "populated"
					: "empty",
			itemCount: filteredSessions.length,
		},
	];
	const sessionsMetrics = [
		{ id: "total_sessions", value: summary?.total_sessions },
		{
			id: "avg_session_duration_min",
			value: summary?.avg_session_duration_min,
		},
		{
			id: "avg_response_time_sec",
			value: summary?.avg_response_time_sec,
		},
	];

	useTrackDashboardView({
		isLoading: sessionsIsLoading,
		isError: sessionsError,
		hasData: (sessions?.length ?? 0) > 0,
		sections: sessionsSections,
		metrics: sessionsMetrics,
	});

	if (sessionsIsLoading) {
		return (
			<div className="px-8 py-6">
				<PageHeader
					title="Sessions"
					description="Analyze session interaction timing and patterns"
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
					<p className="text-center text-muted">Loading session analytics...</p>
				</AnalyticsCard>
			</div>
		);
	}

	return (
		<div className="px-8 py-6">
			<PageHeader
				title="Sessions"
				description="Analyze session interaction timing and patterns"
				actions={
					<DatePicker
						startDate={startDate}
						endDate={endDate}
						onStartDateChange={setStartDate}
						onEndDateChange={setEndDate}
					/>
				}
			/>

			{summary && comparison && (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
					<StatCard
						title="Total Sessions"
						value={summary.total_sessions.toLocaleString()}
						icon={Activity}
						iconColor="text-blue-600"
						trend={{ value: comparison.changes.total_sessions }}
					/>
					<StatCard
						title="Avg Session Duration"
						value={`${summary.avg_session_duration_min.toFixed(1)} min`}
						icon={Clock}
						iconColor="text-purple-600"
						trend={{ value: comparison.changes.avg_session_duration_min }}
					/>
					<StatCard
						title="Avg Response Time"
						value={`${summary.avg_response_time_sec.toFixed(1)}s`}
						icon={Timer}
						iconColor="text-green-600"
						trend={{ value: comparison.changes.avg_response_time_sec }}
					/>
				</div>
			)}

			{/* Dimension Analysis */}
			<ChartCard
				title="Multi-Dimensional Analysis"
				description="Analyze sessions across different dimensions and metrics."
				className="mb-8"
			>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
					<div>
						<label
							htmlFor="sessions-metric-select"
							className="block text-sm font-medium text-subheading mb-2"
						>
							Measure (Y-Axis)
						</label>
						<Select
							value={selectedMetric}
							onValueChange={(v) => {
								trackFilterChange({
									filterName: "sessions_metric",
									filterCategory: "metric",
									changeAction: "set",
									sourceComponent: "sessions_list_page",
									valueKey: v,
									affectedScope: "chart",
								});
								setSelectedMetric(v as DimensionAnalysisInput["metric"]);
							}}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="session_count">Session Count</SelectItem>
								<SelectItem value="avg_duration">Avg Duration (min)</SelectItem>
								<SelectItem value="total_duration">
									Total Duration (hours)
								</SelectItem>
								<SelectItem value="avg_tokens">Avg Tokens</SelectItem>
								<SelectItem value="total_tokens">Total Tokens</SelectItem>
								<SelectItem value="avg_success_score">
									Avg Success Score
								</SelectItem>
								<SelectItem value="total_errors">Total Errors</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div>
						<label
							htmlFor="sessions-dimension-select"
							className="block text-sm font-medium text-subheading mb-2"
						>
							Group By (X-Axis)
						</label>
						<Select
							value={selectedDimension}
							onValueChange={(v) => {
								trackFilterChange({
									filterName: "sessions_dimension",
									filterCategory: "dimension",
									changeAction: "set",
									sourceComponent: "sessions_list_page",
									valueKey: v,
									affectedScope: "chart",
								});
								setSelectedDimension(v as DimensionAnalysisInput["dimension"]);
							}}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="session_archetype">Session Type</SelectItem>
								<SelectItem value="model_used">Model Used</SelectItem>
								<SelectItem value="user_id">User/Developer</SelectItem>
								<SelectItem value="project_path">Project</SelectItem>
								<SelectItem value="repository">Repository</SelectItem>
								<SelectItem value="has_commit">Has Commit</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div>
						<label
							htmlFor="sessions-splitby-select"
							className="block text-sm font-medium text-subheading mb-2"
						>
							Split By (Optional)
						</label>
						<Select
							value={selectedSplitBy || "none"}
							onValueChange={(v) => {
								trackFilterChange({
									filterName: "sessions_split_by",
									filterCategory: "dimension",
									changeAction: "set",
									sourceComponent: "sessions_list_page",
									valueKey: v,
									affectedScope: "chart",
								});
								const value = v === "none" ? "" : v;
								setSelectedSplitBy(
									value as DimensionAnalysisInput["dimension"] | "",
								);
								if (!value) setShowPercentage(false);
							}}
						>
							<SelectTrigger className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">None</SelectItem>
								<SelectItem value="session_archetype">Session Type</SelectItem>
								<SelectItem value="model_used">Model Used</SelectItem>
								<SelectItem value="user_id">User/Developer</SelectItem>
								<SelectItem value="repository">Repository</SelectItem>
							</SelectContent>
						</Select>
					</div>
				</div>

				{selectedSplitBy && (
					<div className="mb-4 flex justify-end items-center gap-3">
						<span className="text-sm text-muted">Scale to 100%</span>
						<Switch
							checked={showPercentage}
							onCheckedChange={(checked) => {
								trackFilterChange({
									filterName: "sessions_scale_to_100",
									filterCategory: "toggle",
									changeAction: checked ? "enable" : "disable",
									sourceComponent: "sessions_list_page",
									valueKey: checked ? "on" : "off",
									affectedScope: "chart",
								});
								setShowPercentage(checked);
							}}
						/>
					</div>
				)}

				{dimensionLoading ? (
					<div className="flex items-center justify-center h-64">
						<div className="text-center">
							<Spinner className="mb-2" />
							<p className="text-muted">Loading chart...</p>
						</div>
					</div>
				) : (
					<DimensionAnalysisChart
						data={dimensionData || []}
						dimension={selectedDimension}
						metric={selectedMetric}
						split_by={selectedSplitBy || undefined}
						showPercentage={showPercentage}
						userMap={userMap}
					/>
				)}
			</ChartCard>

			{/* Sessions Table */}
			<AnalyticsCard>
				<div className="flex items-center justify-between mb-4">
					<div>
						<h3 className="text-lg font-semibold">
							Recent Sessions ({filteredSessions.length})
						</h3>
					</div>
					<div className="flex gap-3">
						<MultiSelect
							options={repositories}
							selected={selectedRepositories}
							onChange={setSelectedRepositories}
							placeholder="All Repositories"
							className="w-48"
						/>
						<MultiSelect
							options={userOptions.map((u) => u.label)}
							selected={selectedUsers.map((id) => userMap[id] || id)}
							onChange={(selectedNames) => {
								const ids = selectedNames.map((name) => {
									const match = userOptions.find((u) => u.label === name);
									return match ? match.id : name;
								});
								setSelectedUsers(ids);
							}}
							placeholder="All Developers"
							className="w-48"
						/>
					</div>
				</div>

				<DataTable
					columns={columns}
					data={filteredSessions}
					analyticsId="sessions_list"
					defaultSorting={[{ id: "date", desc: true }]}
					getRowAnalyticsValue={(row) => row.session_id}
					onRowClick={(row) =>
						navigate(`/dashboard/sessions/${row.session_id}`)
					}
					isRowClickable={(row) => canViewSession(row.user_id)}
				/>
			</AnalyticsCard>
		</div>
	);
}
