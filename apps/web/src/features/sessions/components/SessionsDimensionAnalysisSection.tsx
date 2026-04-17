import type {
	DimensionAnalysisDataPoint,
	DimensionAnalysisInput,
} from "@rudel/api-routes";
import { BarChart3Icon } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/ui/select";
import { DimensionAnalysisChart } from "@/components/charts/DimensionAnalysisChart";
import { Switch } from "@/components/ui/switch";
import { useAnalyticsTracking } from "@/features/analytics/tracking/useAnalyticsTracking";
import { DashboardAnalysisPanel } from "@/features/dashboard/components/DashboardAnalysisPanel";

type SessionDimension = DimensionAnalysisInput["dimension"];
type SessionMetric = DimensionAnalysisInput["metric"];
type SessionSplitBy = DimensionAnalysisInput["dimension"] | "none";

type SessionsDimensionOption<TValue extends string> = {
	label: string;
	value: TValue;
};

const SESSION_METRIC_OPTIONS: readonly SessionsDimensionOption<SessionMetric>[] =
	[
		{ label: "Session Count", value: "session_count" },
		{ label: "Avg Duration (min)", value: "avg_duration" },
		{ label: "Total Duration (hours)", value: "total_duration" },
		{ label: "Avg Tokens", value: "avg_tokens" },
		{ label: "Total Tokens", value: "total_tokens" },
		{ label: "Avg Success Score", value: "avg_success_score" },
		{ label: "Total Errors", value: "total_errors" },
	] as const;

const SESSION_DIMENSION_OPTIONS: readonly SessionsDimensionOption<SessionDimension>[] =
	[
		{ label: "Session Type", value: "session_archetype" },
		{ label: "Model Used", value: "model_used" },
		{ label: "Developer", value: "user_id" },
		{ label: "Project", value: "project_path" },
		{ label: "Repository", value: "repository" },
		{ label: "Has Commit", value: "has_commit" },
	] as const;

const SESSION_SPLIT_OPTIONS: readonly SessionsDimensionOption<SessionSplitBy>[] =
	[
		{ label: "No Split", value: "none" },
		{ label: "Session Type", value: "session_archetype" },
		{ label: "Model Used", value: "model_used" },
		{ label: "Developer", value: "user_id" },
		{ label: "Repository", value: "repository" },
	] as const;

function buildSessionSelectTriggerClassName() {
	return "dashboardy-action-button h-8 min-w-[10rem] justify-between rounded-full border-[color:var(--dashboardy-border)] bg-transparent px-3 text-[13px] font-medium text-[color:var(--dashboardy-heading)] shadow-none";
}

function resolveMetric(value: string | null) {
	if (!value) {
		return undefined;
	}

	return SESSION_METRIC_OPTIONS.find((option) => option.value === value);
}

function resolveDimension(value: string | null) {
	if (!value) {
		return undefined;
	}

	return SESSION_DIMENSION_OPTIONS.find((option) => option.value === value);
}

function resolveSplitBy(value: string | null) {
	if (!value) {
		return undefined;
	}

	return SESSION_SPLIT_OPTIONS.find((option) => option.value === value);
}

export function SessionsDimensionAnalysisSection({
	data,
	dimension,
	metric,
	splitBy,
	showPercentage,
	userMap,
	isPending,
	isError,
	onDimensionChange,
	onMetricChange,
	onSplitByChange,
	onShowPercentageChange,
}: {
	data: DimensionAnalysisDataPoint[] | undefined;
	dimension: SessionDimension;
	metric: SessionMetric;
	splitBy: SessionSplitBy;
	showPercentage: boolean;
	userMap: Record<string, string>;
	isPending: boolean;
	isError: boolean;
	onDimensionChange: (nextValue: SessionDimension) => void;
	onMetricChange: (nextValue: SessionMetric) => void;
	onSplitByChange: (nextValue: SessionSplitBy) => void;
	onShowPercentageChange: (nextValue: boolean) => void;
}) {
	const { trackFilterChange } = useAnalyticsTracking();

	return (
		<DashboardAnalysisPanel
			title="Multi-dimensional analysis"
			icon={
				<BarChart3Icon className="size-4 text-[color:var(--dashboardy-muted)]" />
			}
			controls={
				<div className="flex flex-wrap items-center justify-end gap-2">
					<Select
						value={metric}
						onValueChange={(value) => {
							const nextMetric = resolveMetric(value);

							if (!nextMetric) {
								return;
							}

							trackFilterChange({
								filterName: "sessions_metric",
								filterCategory: "metric",
								changeAction: "set",
								sourceComponent: "sessions_dimension_analysis",
								valueKey: nextMetric.value,
								affectedScope: "chart",
							});
							onMetricChange(nextMetric.value);
						}}
					>
						<SelectTrigger className={buildSessionSelectTriggerClassName()}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent align="end">
							{SESSION_METRIC_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Select
						value={dimension}
						onValueChange={(value) => {
							const nextDimension = resolveDimension(value);

							if (!nextDimension) {
								return;
							}

							trackFilterChange({
								filterName: "sessions_dimension",
								filterCategory: "dimension",
								changeAction: "set",
								sourceComponent: "sessions_dimension_analysis",
								valueKey: nextDimension.value,
								affectedScope: "chart",
							});
							onDimensionChange(nextDimension.value);
						}}
					>
						<SelectTrigger className={buildSessionSelectTriggerClassName()}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent align="end">
							{SESSION_DIMENSION_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Select
						value={splitBy}
						onValueChange={(value) => {
							const nextSplitBy = resolveSplitBy(value);

							if (!nextSplitBy) {
								return;
							}

							trackFilterChange({
								filterName: "sessions_split_by",
								filterCategory: "dimension",
								changeAction: "set",
								sourceComponent: "sessions_dimension_analysis",
								valueKey: nextSplitBy.value,
								affectedScope: "chart",
							});

							if (nextSplitBy.value === "none" && showPercentage) {
								onShowPercentageChange(false);
							}

							onSplitByChange(nextSplitBy.value);
						}}
					>
						<SelectTrigger className={buildSessionSelectTriggerClassName()}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent align="end">
							{SESSION_SPLIT_OPTIONS.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<div className="flex h-8 items-center gap-2 rounded-full border border-[color:var(--dashboardy-border)] bg-transparent px-3 text-[13px] font-medium text-[color:var(--dashboardy-heading)]">
						<span className="text-[color:var(--dashboardy-muted)]">
							Scale to 100%
						</span>
						<Switch
							size="sm"
							checked={showPercentage}
							disabled={splitBy === "none"}
							onCheckedChange={(checked) => {
								trackFilterChange({
									filterName: "sessions_scale_to_100",
									filterCategory: "toggle",
									changeAction: checked ? "enable" : "disable",
									sourceComponent: "sessions_dimension_analysis",
									valueKey: checked ? "on" : "off",
									affectedScope: "chart",
								});
								onShowPercentageChange(checked);
							}}
						/>
					</div>
				</div>
			}
			chartContent={
				isError ? (
					<div className="flex h-full items-center justify-center px-6 text-center text-sm text-[color:var(--dashboardy-muted)]">
						We couldn&apos;t load the dimension analysis for this range.
					</div>
				) : isPending ? (
					<div className="flex h-full items-center justify-center px-6 text-center text-sm text-[color:var(--dashboardy-muted)]">
						Loading analysis...
					</div>
				) : (
					<DimensionAnalysisChart
						data={data ?? []}
						dimension={dimension}
						metric={metric}
						split_by={splitBy === "none" ? undefined : splitBy}
						showPercentage={showPercentage}
						userMap={userMap}
					/>
				)
			}
			tableContent={
				<div className="rounded-[1.25rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-5 py-4">
					<p className="text-[13px] font-semibold text-[color:var(--dashboardy-heading)]">
						Read the distribution
					</p>
					<p className="mt-1 text-sm text-[color:var(--dashboardy-muted)]">
						Group the same session data by repository, developer, model, or
						session type, then optionally split each bar to compare composition
						inside the selected dimension.
					</p>
				</div>
			}
		/>
	);
}
