import { AlertCircle, AlertTriangle, Clock, Users } from "lucide-react";
import { useState } from "react";
import { AnalyticsCard } from "@/components/analytics/AnalyticsCard";
import { ChartCard } from "@/components/analytics/ChartCard";
import { DatePicker } from "@/components/analytics/DatePicker";
import { PageHeader } from "@/components/analytics/PageHeader";
import { StatCard } from "@/components/analytics/StatCard";
import { ErrorTrendChart } from "@/components/charts/ErrorTrendChart";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useAnalyticsQuery } from "@/hooks/useAnalyticsQuery";
import {
	type DashboardSection,
	useTrackDashboardView,
} from "@/hooks/useTrackDashboardView";
import { useUserMap } from "@/hooks/useUserMap";
import { orpc } from "@/lib/orpc";

const severityColors = {
	high: "bg-status-error-bg text-status-error-text border-status-error-border",
	medium:
		"bg-status-warning-bg text-status-warning-text border-status-warning-border",
	low: "bg-status-info-bg text-status-info-text border-status-info-border",
};

const severityIcons = {
	high: "\u{1F534}",
	medium: "\u{1F7E1}",
	low: "\u{1F535}",
};

export function ErrorsPage() {
	const { startDate, endDate, setStartDate, setEndDate, calculateDays } =
		useDateRange();
	const days = calculateDays();

	const [trendMetric, setTrendMetric] = useState<
		"avg_errors_per_interaction" | "avg_errors_per_session" | "total_errors"
	>("total_errors");
	const [trendSplitBy, setTrendSplitBy] = useState<
		"project_path" | "user_id" | "model"
	>("project_path");

	const {
		data: errors,
		isLoading: errorsLoading,
		isError: errorsError,
	} = useAnalyticsQuery(
		orpc.analytics.errors.topRecurring.queryOptions({
			input: { days, minOccurrences: 2, limit: 15 },
		}),
	);

	const {
		data: trendData,
		isLoading: trendLoading,
		isError: trendError,
	} = useAnalyticsQuery(
		orpc.analytics.errors.trends.queryOptions({
			input: { startDate, endDate, splitBy: trendSplitBy },
		}),
	);

	const { userMap } = useUserMap();

	const totalErrors = errors?.reduce((sum, e) => sum + e.occurrences, 0) ?? 0;
	const highSeverityCount =
		errors?.filter((e) => e.severity === "high").length ?? 0;
	const affectedUsersTotal =
		errors && errors.length > 0
			? Math.max(...errors.map((e) => e.affected_users))
			: 0;
	const mostCommonError =
		errors && errors.length > 0 ? errors[0].error_pattern : "None";
	const errorsIsLoading = errorsLoading || trendLoading;
	const errorsSections: DashboardSection[] = [
		{
			id: "summary_cards",
			state: errorsError ? "error" : "populated",
			itemCount: errorsError ? 0 : 4,
		},
		{
			id: "error_trends",
			state: trendError
				? "error"
				: (trendData?.length ?? 0) > 0
					? "populated"
					: "empty",
			itemCount: trendData?.length ?? 0,
		},
		{
			id: "top_recurring_errors",
			state: errorsError
				? "error"
				: (errors?.length ?? 0) > 0
					? "populated"
					: "empty",
			itemCount: errors?.length ?? 0,
		},
		{
			id: "error_insights",
			state: errorsError
				? "error"
				: (errors?.length ?? 0) > 0
					? "populated"
					: "empty",
			itemCount: (errors?.length ?? 0) > 0 ? 2 : 0,
		},
	];
	const errorsMetrics = [
		{ id: "total_errors", value: totalErrors },
		{ id: "high_severity_count", value: highSeverityCount },
		{ id: "affected_users_total", value: affectedUsersTotal },
	];

	useTrackDashboardView({
		isLoading: errorsIsLoading,
		isError: errorsError,
		hasData: (errors?.length ?? 0) > 0,
		sections: errorsSections,
		metrics: errorsMetrics,
	});

	if (errorsIsLoading) {
		return (
			<div className="px-8 py-6">
				<PageHeader
					title="Error Intelligence"
					description="Track and analyze recurring errors across your team"
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
					<p className="text-center text-muted">Loading error data...</p>
				</AnalyticsCard>
			</div>
		);
	}

	return (
		<div className="px-8 py-6">
			<PageHeader
				title="Error Intelligence"
				description="Track and analyze recurring errors across your team"
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
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
				<StatCard
					title="Total Errors"
					value={totalErrors.toLocaleString()}
					subtitle="error occurrences"
					icon={AlertCircle}
					iconColor="text-red-600"
				/>
				<StatCard
					title="High Severity"
					value={highSeverityCount}
					subtitle="critical issues"
					icon={AlertTriangle}
					iconColor="text-orange-600"
				/>
				<StatCard
					title="Most Common"
					value={mostCommonError}
					subtitle="top error type"
					icon={Clock}
					iconColor="text-purple-600"
				/>
				<StatCard
					title="Max Affected Users"
					value={affectedUsersTotal}
					subtitle="developers impacted"
					icon={Users}
					iconColor="text-blue-600"
				/>
			</div>

			{/* Error Trends Chart */}
			<ChartCard
				title="Error Trends Over Time"
				description="Track error metrics across different dimensions to identify patterns and trends"
				className="mb-8"
			>
				{trendLoading ? (
					<div className="text-center py-12 text-muted">
						Loading error trends...
					</div>
				) : (
					<ErrorTrendChart
						data={trendData || []}
						metric={trendMetric}
						splitBy={trendSplitBy}
						onMetricChange={setTrendMetric}
						onSplitByChange={setTrendSplitBy}
						userMap={userMap}
					/>
				)}
			</ChartCard>

			{/* Top Recurring Errors */}
			<AnalyticsCard className="mb-8">
				<h2 className="text-xl font-bold text-heading mb-4">
					Top Recurring Errors
				</h2>
				<p className="text-sm text-muted mb-6">
					Most frequently occurring errors that may need attention
				</p>
				{errors && errors.length > 0 ? (
					<div className="space-y-4">
						{errors.map((err, index) => (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: static list of errors
								key={index}
								className="border border-border rounded-lg p-4 hover:shadow-md transition-shadow"
							>
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<div className="flex items-center gap-3 mb-2">
											<span className="text-2xl">
												{
													severityIcons[
														err.severity as keyof typeof severityIcons
													]
												}
											</span>
											<h3 className="text-lg font-semibold text-heading">
												{err.error_pattern}
											</h3>
											<span
												className={`px-3 py-1 rounded-full text-xs font-medium border ${
													severityColors[
														err.severity as keyof typeof severityColors
													]
												}`}
											>
												{err.severity.toUpperCase()}
											</span>
										</div>
										<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
											<div>
												<p className="text-xs text-muted uppercase">
													Occurrences
												</p>
												<p className="text-lg font-semibold text-foreground">
													{err.occurrences}
												</p>
											</div>
											<div>
												<p className="text-xs text-muted uppercase">
													Affected Users
												</p>
												<p className="text-lg font-semibold text-foreground">
													{err.affected_users}
												</p>
											</div>
											<div>
												<p className="text-xs text-muted uppercase">
													Last Seen
												</p>
												<p className="text-sm text-subheading">
													{new Date(err.last_seen).toLocaleDateString()}
												</p>
											</div>
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				) : (
					<div className="text-center py-12">
						<div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-status-success-bg mb-4">
							<svg
								className="w-8 h-8 text-status-success-icon"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								role="img"
								aria-label="No errors"
							>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M5 13l4 4L19 7"
								/>
							</svg>
						</div>
						<p className="text-lg font-medium text-foreground mb-1">
							No recurring errors found!
						</p>
						<p className="text-sm text-muted">
							Great job! Your team hasn't encountered any recurring errors in
							the selected time period.
						</p>
					</div>
				)}
			</AnalyticsCard>

			{/* Error Insights */}
			{errors && errors.length > 0 && (
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<AnalyticsCard className="bg-status-error-bg border-status-error-border">
						<div className="flex items-start gap-4">
							<div className="p-3 rounded-lg bg-status-error-bg">
								<AlertTriangle className="h-6 w-6 text-status-error-icon" />
							</div>
							<div className="flex-1">
								<h3 className="text-lg font-semibold text-heading mb-2">
									Action Recommended
								</h3>
								<p className="text-sm text-subheading mb-3">
									You have {highSeverityCount} high-severity error
									{highSeverityCount !== 1 ? "s" : ""} that may require
									immediate attention.
								</p>
								{highSeverityCount > 0 && (
									<p className="text-xs text-muted">
										Consider scheduling a team discussion to address these
										issues.
									</p>
								)}
							</div>
						</div>
					</AnalyticsCard>

					<AnalyticsCard className="bg-status-info-bg border-status-info-border">
						<div className="flex items-start gap-4">
							<div className="p-3 rounded-lg bg-status-info-bg">
								<Users className="h-6 w-6 text-accent" />
							</div>
							<div className="flex-1">
								<h3 className="text-lg font-semibold text-heading mb-2">
									Knowledge Sharing
								</h3>
								<p className="text-sm text-subheading mb-3">
									{errors.filter((e) => e.affected_users > 1).length} error type
									{errors.filter((e) => e.affected_users > 1).length !== 1
										? "s"
										: ""}{" "}
									affecting multiple developers.
								</p>
								<p className="text-xs text-muted">
									Share solutions in team channels to help everyone learn.
								</p>
							</div>
						</div>
					</AnalyticsCard>
				</div>
			)}
		</div>
	);
}
