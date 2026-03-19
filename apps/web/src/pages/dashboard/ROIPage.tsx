import type {
	DeveloperCostBreakdown,
	ProjectCostBreakdown,
} from "@rudel/api-routes";
import type { ColumnDef } from "@tanstack/react-table";
import {
	Activity,
	DollarSign,
	HelpCircle,
	Target,
	TrendingDown,
	TrendingUp,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
	CartesianGrid,
	Line,
	LineChart,
	Tooltip as RechartsTooltip,
	ResponsiveContainer,
	XAxis,
	YAxis,
} from "recharts";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { ChartCard } from "@/components/analytics/ChartCard";
import { DatePicker } from "@/components/analytics/DatePicker";
import { PageHeader } from "@/components/analytics/PageHeader";
import { StatCard } from "@/components/analytics/StatCard";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useAnalyticsQuery } from "@/hooks/useAnalyticsQuery";
import { useChartTheme } from "@/hooks/useChartTheme";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import {
	type DashboardSection,
	useTrackDashboardView,
} from "@/hooks/useTrackDashboardView";
import { useUserMap } from "@/hooks/useUserMap";
import { formatUsername } from "@/lib/format";
import { orpc } from "@/lib/orpc";

export function ROIPage() {
	const { startDate, endDate, setStartDate, setEndDate, calculateDays } =
		useDateRange();
	const chartTheme = useChartTheme();
	const days = calculateDays();
	const { trackFilterChange } = useAnalyticsTracking();

	const [roiInputs, setRoiInputs] = useState({
		codePercentage: 10,
		tokensPerLOC: 15,
		locPerHour: 30,
		devHourlyRate: 100,
	});

	const {
		data: metrics,
		isLoading: metricsLoading,
		isError: metricsError,
	} = useAnalyticsQuery(
		orpc.analytics.roi.metrics.queryOptions({ input: { days } }),
	);

	const {
		data: trends,
		isLoading: trendsLoading,
		isError: trendsError,
	} = useAnalyticsQuery(
		orpc.analytics.roi.trends.queryOptions({ input: { days: 56 } }),
	);

	const {
		data: developerCosts,
		isLoading: developerCostsLoading,
		isError: developerCostsError,
	} = useAnalyticsQuery(
		orpc.analytics.roi.breakdownDevelopers.queryOptions({ input: { days } }),
	);

	const {
		data: projectCosts,
		isLoading: projectCostsLoading,
		isError: projectCostsError,
	} = useAnalyticsQuery(
		orpc.analytics.roi.breakdownProjects.queryOptions({ input: { days } }),
	);

	const { userMap } = useUserMap();

	const devCostColumns = useMemo<ColumnDef<DeveloperCostBreakdown>[]>(
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
				accessorKey: "cost",
				header: "Cost",
				cell: ({ row }) => (
					<span className="text-right text-subheading">
						${row.original.cost.toFixed(2)}
					</span>
				),
			},
			{
				accessorKey: "sessions",
				header: "Sessions",
				cell: ({ row }) => (
					<span className="text-right text-subheading">
						{row.original.sessions}
					</span>
				),
			},
		],
		[userMap],
	);

	const projectCostColumns = useMemo<ColumnDef<ProjectCostBreakdown>[]>(
		() => [
			{
				accessorKey: "project_path",
				header: "Project",
				cell: ({ row }) => (
					<span className="font-medium text-foreground truncate max-w-xs">
						{row.original.project_path.split("/").pop() ||
							row.original.project_path}
					</span>
				),
			},
			{
				accessorKey: "cost",
				header: "Cost",
				cell: ({ row }) => (
					<span className="text-right text-subheading">
						${row.original.cost.toFixed(2)}
					</span>
				),
			},
			{
				accessorKey: "sessions",
				header: "Sessions",
				cell: ({ row }) => (
					<span className="text-right text-subheading">
						{row.original.sessions}
					</span>
				),
			},
		],
		[],
	);

	const formatCurrency = (value: number) => `$${value.toFixed(2)}`;
	const formatPercent = (value: number) =>
		`${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

	const formatCompact = (value: number): string => {
		if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
		if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
		return value.toString();
	};

	const calculatedROI = useMemo(() => {
		if (!metrics) return null;
		const loc =
			(metrics.output_tokens * (roiInputs.codePercentage / 100)) /
			roiInputs.tokensPerLOC;
		const hoursSaved = loc / roiInputs.locPerHour;
		const valueCreated = hoursSaved * roiInputs.devHourlyRate;
		const dollarValueSaved = valueCreated - metrics.total_cost;
		const roiPercentage =
			metrics.total_cost > 0
				? (dollarValueSaved / metrics.total_cost) * 100
				: 0;

		return {
			loc: Math.round(loc),
			hoursSaved: parseFloat(hoursSaved.toFixed(2)),
			valueCreated: parseFloat(valueCreated.toFixed(2)),
			dollarValueSaved: parseFloat(dollarValueSaved.toFixed(2)),
			roiPercentage: parseFloat(roiPercentage.toFixed(2)),
		};
	}, [metrics, roiInputs]);
	const roiIsLoading =
		metricsLoading ||
		trendsLoading ||
		developerCostsLoading ||
		projectCostsLoading;
	const roiSections: DashboardSection[] = [
		{
			id: "roi_parameters",
			state: metricsError ? "error" : metrics ? "populated" : "empty",
			itemCount: metrics ? 4 : 0,
		},
		{
			id: "summary_cards",
			state: metricsError
				? "error"
				: metrics && calculatedROI
					? "populated"
					: "empty",
			itemCount: metrics && calculatedROI ? 4 : 0,
		},
		{
			id: "roi_breakdown",
			state: metricsError
				? "error"
				: metrics && calculatedROI
					? "populated"
					: "empty",
			itemCount: metrics && calculatedROI ? 5 : 0,
		},
		{
			id: "weekly_cost_trend",
			state: trendsError
				? "error"
				: (trends?.length ?? 0) > 0
					? "populated"
					: "empty",
			itemCount: trends?.length ?? 0,
		},
		{
			id: "weekly_productivity_trend",
			state: trendsError
				? "error"
				: (trends?.length ?? 0) > 0
					? "populated"
					: "empty",
			itemCount: trends?.length ?? 0,
		},
		{
			id: "developer_cost_breakdown",
			state: developerCostsError
				? "error"
				: (developerCosts?.length ?? 0) > 0
					? "populated"
					: "empty",
			itemCount: developerCosts?.length ?? 0,
		},
		{
			id: "project_cost_breakdown",
			state: projectCostsError
				? "error"
				: (projectCosts?.length ?? 0) > 0
					? "populated"
					: "empty",
			itemCount: projectCosts?.length ?? 0,
		},
	];
	const roiMetrics = [
		{ id: "total_spend", value: metrics?.total_cost },
		{ id: "cost_per_commit", value: metrics?.cost_per_commit },
		{ id: "dev_hours_saved", value: calculatedROI?.hoursSaved },
		{ id: "dollar_value_saved", value: calculatedROI?.dollarValueSaved },
		{ id: "roi_percentage", value: calculatedROI?.roiPercentage },
	];

	useTrackDashboardView({
		isLoading: roiIsLoading,
		isError: metricsError,
		hasData: Boolean(metrics),
		sections: roiSections,
		metrics: roiMetrics,
	});

	const resetToDefaults = () => {
		trackFilterChange({
			filterName: "roi_defaults",
			filterCategory: "calculator",
			changeAction: "reset",
			sourceComponent: "roi_page",
			affectedScope: "page",
		});
		setRoiInputs({
			codePercentage: 10,
			tokensPerLOC: 15,
			locPerHour: 30,
			devHourlyRate: 100,
		});
	};

	const pricingTooltip = (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<HelpCircle className="h-4 w-4 text-muted cursor-help shrink-0" />
				</TooltipTrigger>
				<TooltipContent className="max-w-xs">
					<p className="font-medium mb-1">Token pricing (approximation)</p>
					<p className="text-xs text-muted mb-2">
						Based on Claude Sonnet 4 rates. Per-model pricing coming soon.
					</p>
					<div className="font-mono text-xs space-y-0.5">
						<p>Input: $3 / MTok</p>
						<p>Output: $15 / MTok</p>
					</div>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);

	return (
		<div className="px-8 py-6">
			<PageHeader
				title="ROI Calculator"
				titleSuffix={pricingTooltip}
				description="Track return on investment and measure business impact of Claude Code"
				actions={
					<DatePicker
						startDate={startDate}
						endDate={endDate}
						onStartDateChange={setStartDate}
						onEndDateChange={setEndDate}
					/>
				}
			/>

			{roiIsLoading && (
				<div className="flex items-center justify-center py-12">
					<div className="text-center">
						<Spinner size="lg" className="mb-4" />
						<p className="text-muted">Loading ROI data...</p>
					</div>
				</div>
			)}

			{!roiIsLoading && metrics && calculatedROI && (
				<>
					{/* Input Configuration */}
					<AnalyticsCard className="mb-6">
						<div className="mb-4">
							<h3 className="text-lg font-semibold text-heading">
								ROI Calculation Parameters
							</h3>
							<p className="text-sm text-muted mt-1">
								Adjust inputs to explore different ROI scenarios
							</p>
						</div>
						<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
							<div>
								<label
									htmlFor="codePercentage"
									className="block text-sm font-medium text-subheading mb-1"
								>
									Code Percentage (%)
								</label>
								<Input
									id="codePercentage"
									type="number"
									value={roiInputs.codePercentage}
									onChange={(e) =>
										setRoiInputs({
											...roiInputs,
											codePercentage: parseFloat(e.target.value) || 0,
										})
									}
									min={0}
									max={100}
								/>
								<p className="text-xs text-muted mt-1">
									% of output that is actual code
								</p>
							</div>
							<div>
								<label
									htmlFor="tokensPerLOC"
									className="block text-sm font-medium text-subheading mb-1"
								>
									Tokens per LOC
								</label>
								<Input
									id="tokensPerLOC"
									type="number"
									value={roiInputs.tokensPerLOC}
									onChange={(e) =>
										setRoiInputs({
											...roiInputs,
											tokensPerLOC: parseFloat(e.target.value) || 1,
										})
									}
									min={1}
								/>
								<p className="text-xs text-muted mt-1">
									Average tokens per line of code
								</p>
							</div>
							<div>
								<label
									htmlFor="locPerHour"
									className="block text-sm font-medium text-subheading mb-1"
								>
									LOC per Hour (baseline)
								</label>
								<Input
									id="locPerHour"
									type="number"
									value={roiInputs.locPerHour}
									onChange={(e) =>
										setRoiInputs({
											...roiInputs,
											locPerHour: parseFloat(e.target.value) || 1,
										})
									}
									min={1}
								/>
								<p className="text-xs text-muted mt-1">
									Manual coding speed without Claude
								</p>
							</div>
							<div>
								<label
									htmlFor="devHourlyRate"
									className="block text-sm font-medium text-subheading mb-1"
								>
									Developer Rate ($/hr)
								</label>
								<Input
									id="devHourlyRate"
									type="number"
									value={roiInputs.devHourlyRate}
									onChange={(e) =>
										setRoiInputs({
											...roiInputs,
											devHourlyRate: parseFloat(e.target.value) || 1,
										})
									}
									min={1}
								/>
								<p className="text-xs text-muted mt-1">Hourly developer cost</p>
							</div>
						</div>
						<div className="mt-4">
							<Button variant="outline" size="sm" onClick={resetToDefaults}>
								Reset to Defaults
							</Button>
						</div>
					</AnalyticsCard>

					{/* KPI Cards */}
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
						<StatCard
							title="Total Spend"
							value={formatCurrency(metrics.total_cost)}
							icon={DollarSign}
							iconColor="text-red-600"
							trend={{ value: metrics.total_cost_change_pct }}
						/>
						<StatCard
							title="Cost per Commit"
							value={
								metrics.cost_per_commit > 0
									? formatCurrency(metrics.cost_per_commit)
									: "N/A"
							}
							icon={Target}
							iconColor="text-blue-600"
							trend={{ value: metrics.cost_per_commit_change_pct }}
						/>
						<StatCard
							title="Dev Hours Saved"
							value={`${formatCompact(calculatedROI.hoursSaved)}h`}
							icon={Activity}
							iconColor="text-green-600"
							trend={{ value: metrics.dev_hours_saved_change_pct }}
						/>
						<StatCard
							title="Dollar Value Saved"
							value={`$${formatCompact(calculatedROI.dollarValueSaved)}`}
							icon={
								calculatedROI.roiPercentage >= 0 ? TrendingUp : TrendingDown
							}
							iconColor={
								calculatedROI.roiPercentage >= 0
									? "text-green-600"
									: "text-red-600"
							}
						/>
					</div>

					{/* ROI Breakdown */}
					<AnalyticsCard className="mb-8">
						<div className="mb-4">
							<h3 className="text-lg font-semibold text-heading">
								ROI Calculation Breakdown
							</h3>
						</div>
						<div className="bg-surface rounded-lg p-6 font-mono text-sm">
							<div className="space-y-2">
								<div className="flex justify-between">
									<span className="text-muted">Output Tokens:</span>
									<span className="font-semibold text-foreground">
										{formatCompact(metrics.output_tokens)}
									</span>
								</div>
								<div className="flex justify-between">
									<span className="text-muted">
										Code % ({roiInputs.codePercentage}%):
									</span>
									<span className="font-semibold text-foreground">
										{formatCompact(calculatedROI.loc)} LOC
									</span>
								</div>
								<div className="flex justify-between border-b border-border pb-2">
									<span className="text-muted">
										Hours Saved (LOC / {roiInputs.locPerHour}):
									</span>
									<span className="font-semibold text-foreground">
										{formatCompact(calculatedROI.hoursSaved)} hours
									</span>
								</div>
								<div className="pt-2 space-y-2">
									<div className="flex justify-between">
										<span className="text-muted">Value Created:</span>
										<span className="font-semibold text-status-success-icon">
											${formatCompact(calculatedROI.valueCreated)}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-muted">Token Cost:</span>
										<span className="font-semibold text-status-error-icon">
											-{formatCurrency(metrics.total_cost)}
										</span>
									</div>
									<div className="flex justify-between border-t-2 border-border pt-2 mt-2">
										<span className="text-foreground font-bold">
											Net Value:
										</span>
										<span className="font-bold text-accent text-lg">
											${formatCompact(calculatedROI.dollarValueSaved)}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-foreground font-bold">ROI:</span>
										<span
											className={`font-bold text-lg ${
												calculatedROI.roiPercentage >= 0
													? "text-status-success-icon"
													: "text-status-error-icon"
											}`}
										>
											{formatPercent(calculatedROI.roiPercentage)}
										</span>
									</div>
								</div>
							</div>
						</div>
					</AnalyticsCard>

					{/* Trends Charts */}
					{trends && trends.length > 0 && (
						<div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
							<ChartCard
								title="Weekly Cost Trend"
								description="Total spend over time"
							>
								<div className="flex items-center gap-1.5 mb-4">
									{pricingTooltip}
								</div>
								<ResponsiveContainer width="100%" height={300}>
									<LineChart data={trends}>
										<CartesianGrid
											strokeDasharray="3 3"
											stroke={chartTheme.gridStroke}
										/>
										<XAxis
											dataKey="week_start"
											stroke={chartTheme.axisStroke}
											fontSize={12}
											tickFormatter={(value) =>
												new Date(value).toLocaleDateString("en-US", {
													month: "short",
													day: "numeric",
												})
											}
										/>
										<YAxis
											stroke={chartTheme.axisStroke}
											fontSize={12}
											tickFormatter={(value) => `$${value}`}
										/>
										<RechartsTooltip
											contentStyle={{
												backgroundColor: chartTheme.tooltipBg,
												borderColor: chartTheme.tooltipBorder,
											}}
											formatter={(value) => [
												`$${((value as number) ?? 0).toFixed(2)}`,
												"Cost",
											]}
											labelFormatter={(label) =>
												`Week of ${new Date(label).toLocaleDateString()}`
											}
										/>
										<Line
											type="monotone"
											dataKey="total_cost"
											stroke="#3b82f6"
											strokeWidth={2}
											dot={{ r: 4 }}
										/>
									</LineChart>
								</ResponsiveContainer>
							</ChartCard>

							<ChartCard
								title="Weekly Productivity Score"
								description="Commits per dollar x 100"
							>
								<div className="flex items-center gap-1.5 mb-4">
									<TooltipProvider>
										<Tooltip>
											<TooltipTrigger asChild>
												<HelpCircle className="h-4 w-4 text-muted cursor-help shrink-0" />
											</TooltipTrigger>
											<TooltipContent className="max-w-xs">
												<p className="font-medium mb-1">
													Productivity Score formula:
												</p>
												<p className="font-mono text-xs">
													(commits ÷ total spend) × 100
												</p>
												<p className="text-xs text-muted mt-1">
													Higher is better — more commits delivered per dollar
													spent on Claude.
												</p>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
								</div>
								<ResponsiveContainer width="100%" height={300}>
									<LineChart data={trends}>
										<CartesianGrid
											strokeDasharray="3 3"
											stroke={chartTheme.gridStroke}
										/>
										<XAxis
											dataKey="week_start"
											stroke={chartTheme.axisStroke}
											fontSize={12}
											tickFormatter={(value) =>
												new Date(value).toLocaleDateString("en-US", {
													month: "short",
													day: "numeric",
												})
											}
										/>
										<YAxis stroke={chartTheme.axisStroke} fontSize={12} />
										<RechartsTooltip
											contentStyle={{
												backgroundColor: chartTheme.tooltipBg,
												borderColor: chartTheme.tooltipBorder,
											}}
											labelFormatter={(label) =>
												`Week of ${new Date(label).toLocaleDateString()}`
											}
										/>
										<Line
											type="monotone"
											dataKey="productivity_score"
											stroke="#10b981"
											strokeWidth={2}
											dot={{ r: 4 }}
											name="Productivity Score"
										/>
									</LineChart>
								</ResponsiveContainer>
							</ChartCard>
						</div>
					)}

					{/* Cost Breakdown Tables */}
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
						<AnalyticsCard>
							<h3 className="text-lg font-semibold text-heading mb-4">
								Developer Cost Breakdown
							</h3>
							<DataTable
								columns={devCostColumns}
								data={developerCosts ?? []}
								analyticsId="roi_developer_costs"
								defaultSorting={[{ id: "cost", desc: true }]}
								defaultPageSize={10}
							/>
						</AnalyticsCard>

						<AnalyticsCard>
							<h3 className="text-lg font-semibold text-heading mb-4">
								Project Cost Breakdown
							</h3>
							<DataTable
								columns={projectCostColumns}
								data={projectCosts ?? []}
								analyticsId="roi_project_costs"
								defaultSorting={[{ id: "cost", desc: true }]}
								defaultPageSize={10}
							/>
						</AnalyticsCard>
					</div>
				</>
			)}
		</div>
	);
}
