import type {
	ErrorTrendDataPoint,
	ModelTokensTrendData,
	ProjectInvestment,
	RepositoryDailyTrendData,
	UserDailyTrendData,
} from "@rudel/api-routes";
import { useMemo, useState } from "react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/ui/select";
import { Skeleton } from "@/app/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/app/ui/toggle-group";
import {
	DashboardCostHistoryChart,
	type DashboardCostHistoryDatum,
} from "@/features/dashboard/components/DashboardCostHistoryChart";
import { DashboardDateControls } from "@/features/dashboard/components/DashboardDateControls";
import {
	DashboardTokenDeveloperChart,
	type DashboardTokenDeveloperDatum,
} from "@/features/dashboard/components/DashboardTokenDeveloperChart";
import { useDashboardHighlightState } from "@/features/dashboard/components/dashboard-highlight-state";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";
import { buildDashboardTokenModelRows } from "@/features/dashboard/data/dashboard-token-model-adapter";
import {
	calculateCost,
	formatCompactCurrency,
	formatCompactWholeNumber,
	formatCurrency,
	formatNumber,
} from "@/lib/format";

type CostDimension = "members" | "models" | "repositories";
type CostMetric = "commits" | "cost" | "errors" | "sessions" | "tokens";
type CostChartType = "bar" | "line";

type CostControlRow = {
	commits: number;
	cost: number;
	errors: number;
	id: string;
	imageUrl?: string;
	label: string;
	sessions: number;
	tokens: number;
};

type CostControlPendingState = {
	base: Record<CostDimension, boolean>;
	errors: Record<CostDimension, boolean>;
};

type CostControlChartPresentation = {
	allowDecimals: boolean;
	derivedLabel: string;
	formatDerivedValue: (primaryValue: number, secondaryValue: number) => string;
	formatPrimaryValue: (value: number) => string;
	formatSecondaryValue: (value: number) => string;
	primaryLabel: string;
	secondaryLabel: string;
	yAxisTickFormatter: (value: number) => string;
	yAxisWidth: number;
};

type CostMetricOption = {
	label: string;
	value: CostMetric;
};

const MAX_VISIBLE_POINTS = 20;

const dimensionOptions: readonly {
	label: string;
	value: CostDimension;
}[] = [
	{ label: "Users", value: "members" },
	{ label: "Repositories", value: "repositories" },
	{ label: "Models", value: "models" },
];

const metricOptionsByDimension: Record<
	CostDimension,
	readonly CostMetricOption[]
> = {
	members: [
		{ label: "Cost", value: "cost" },
		{ label: "Tokens", value: "tokens" },
		{ label: "Commits", value: "commits" },
		{ label: "Errors", value: "errors" },
		{ label: "Sessions", value: "sessions" },
	],
	models: [
		{ label: "Cost", value: "cost" },
		{ label: "Tokens", value: "tokens" },
		{ label: "Errors", value: "errors" },
	],
	repositories: [
		{ label: "Cost", value: "cost" },
		{ label: "Tokens", value: "tokens" },
		{ label: "Commits", value: "commits" },
		{ label: "Errors", value: "errors" },
		{ label: "Sessions", value: "sessions" },
	],
};

const dimensionLabels: Record<CostDimension, string> = {
	members: "Users",
	models: "Models",
	repositories: "Repositories",
};

const metricLabels: Record<CostMetric, string> = {
	commits: "Commits",
	cost: "Cost",
	errors: "Errors",
	sessions: "Sessions",
	tokens: "Tokens",
};

const chartTypeOptions: readonly {
	label: string;
	value: CostChartType;
}[] = [
	{ label: "Bars", value: "bar" },
	{ label: "Line", value: "line" },
];

function isCostDimension(value: unknown): value is CostDimension {
	return value === "members" || value === "models" || value === "repositories";
}

function isCostMetric(value: unknown): value is CostMetric {
	return (
		value === "commits" ||
		value === "cost" ||
		value === "errors" ||
		value === "sessions" ||
		value === "tokens"
	);
}

function isCostChartType(value: unknown): value is CostChartType {
	return value === "bar" || value === "line";
}

function isMetricAvailable(metric: CostMetric, dimension: CostDimension) {
	return metricOptionsByDimension[dimension].some(
		(option) => option.value === metric,
	);
}

function normalizeRepositoryKey(value: string) {
	const normalizedValue = value
		.trim()
		.replace(/\\/gu, "/")
		.replace(/\/+$/u, "")
		.replace(/\.git$/u, "");

	return (normalizedValue.split("/").at(-1) ?? normalizedValue).toLowerCase();
}

function getRepositoryLabel(project: ProjectInvestment) {
	return project.repository?.trim() || project.project_path.trim() || "Unknown";
}

function buildErrorTotals(
	rows: readonly ErrorTrendDataPoint[] | undefined,
	normalizeKey: (value: string) => string,
) {
	const totals = new Map<string, number>();

	for (const row of rows ?? []) {
		const key = normalizeKey(row.dimension);
		if (!key) {
			continue;
		}

		totals.set(key, (totals.get(key) ?? 0) + row.total_errors);
	}

	return totals;
}

function buildDailyErrorTotals(
	rows: readonly ErrorTrendDataPoint[] | undefined,
	normalizeKey: (value: string) => string,
) {
	const totals = new Map<string, number>();

	for (const row of rows ?? []) {
		const dimensionKey = normalizeKey(row.dimension);
		const key = `${row.date}\u0000${dimensionKey}`;
		totals.set(key, (totals.get(key) ?? 0) + row.total_errors);
	}

	return totals;
}

function buildCostRows(input: {
	dimension: CostDimension;
	errorDeveloperTrend: readonly ErrorTrendDataPoint[] | undefined;
	errorModelTrend: readonly ErrorTrendDataPoint[] | undefined;
	errorProjectTrend: readonly ErrorTrendDataPoint[] | undefined;
	modelTokensTrend: readonly ModelTokensTrendData[] | undefined;
	performanceUsers: readonly DashboardPerformanceUserComparison[];
	projects: readonly ProjectInvestment[];
	repositoryDailyTrend: readonly RepositoryDailyTrendData[] | undefined;
}): CostControlRow[] {
	if (input.dimension === "members") {
		const errorTotals = buildErrorTotals(
			input.errorDeveloperTrend,
			(value) => value,
		);

		return input.performanceUsers.map((user) => ({
			commits: user.commits,
			cost: user.cost,
			errors: errorTotals.get(user.userId) ?? 0,
			id: user.userId,
			imageUrl: user.imageUrl ?? undefined,
			label: user.label,
			sessions: user.sessions,
			tokens: user.totalTokens,
		}));
	}

	if (input.dimension === "models") {
		const errorTotals = buildErrorTotals(
			input.errorModelTrend,
			(value) => value,
		);

		return buildDashboardTokenModelRows(input.modelTokensTrend).map(
			(model) => ({
				commits: 0,
				cost: model.estimatedCost,
				errors: errorTotals.get(model.id) ?? 0,
				id: model.id,
				label: model.label,
				sessions: 0,
				tokens: model.totalTokens,
			}),
		);
	}

	const errorTotals = buildErrorTotals(
		input.errorProjectTrend,
		normalizeRepositoryKey,
	);
	const labelByRepositoryKey = new Map(
		input.projects.map((project) => [
			normalizeRepositoryKey(project.repository ?? project.project_path),
			getRepositoryLabel(project),
		]),
	);
	const totalsByRepositoryKey = new Map<
		string,
		{
			commits: number;
			cost: number;
			sessions: number;
			tokens: number;
		}
	>();

	for (const row of input.repositoryDailyTrend ?? []) {
		const repositoryKey = normalizeRepositoryKey(row.repository);
		const currentTotals = totalsByRepositoryKey.get(repositoryKey) ?? {
			commits: 0,
			cost: 0,
			sessions: 0,
			tokens: 0,
		};
		totalsByRepositoryKey.set(repositoryKey, {
			commits: currentTotals.commits + row.total_commits,
			cost:
				currentTotals.cost +
				(row.cost ??
					calculateCost(row.input_tokens ?? 0, row.output_tokens ?? 0)),
			sessions: currentTotals.sessions + row.sessions,
			tokens: currentTotals.tokens + (row.total_tokens ?? 0),
		});
	}

	return Array.from(totalsByRepositoryKey.entries()).map(
		([repositoryKey, totals]) => ({
			...totals,
			errors: errorTotals.get(repositoryKey) ?? 0,
			id: repositoryKey,
			label: labelByRepositoryKey.get(repositoryKey) ?? repositoryKey,
		}),
	);
}

function buildCostHistoryData(input: {
	dimension: CostDimension;
	errorDeveloperTrend: readonly ErrorTrendDataPoint[] | undefined;
	errorModelTrend: readonly ErrorTrendDataPoint[] | undefined;
	errorProjectTrend: readonly ErrorTrendDataPoint[] | undefined;
	metric: CostMetric;
	modelTokensTrend: readonly ModelTokensTrendData[] | undefined;
	performanceUsers: readonly DashboardPerformanceUserComparison[];
	projects: readonly ProjectInvestment[];
	repositoryDailyTrend: readonly RepositoryDailyTrendData[] | undefined;
	userDailyTrend: readonly UserDailyTrendData[] | undefined;
}): DashboardCostHistoryDatum[] {
	if (input.dimension === "members") {
		const labelByUserId = new Map(
			input.performanceUsers.map((user) => [user.userId, user.label]),
		);
		const errorTotals = buildDailyErrorTotals(
			input.errorDeveloperTrend,
			(value) => value,
		);

		return (input.userDailyTrend ?? []).map((row) => {
			let value = 0;
			switch (input.metric) {
				case "commits":
					value = row.total_commits;
					break;
				case "cost":
					value =
						row.cost ?? calculateCost(row.input_tokens, row.output_tokens);
					break;
				case "errors":
					value = errorTotals.get(`${row.date}\u0000${row.user_id}`) ?? 0;
					break;
				case "sessions":
					value = row.sessions;
					break;
				case "tokens":
					value = row.total_tokens;
					break;
			}

			return {
				date: row.date,
				id: row.user_id,
				label: labelByUserId.get(row.user_id) ?? row.user_id,
				value,
			};
		});
	}

	if (input.dimension === "models") {
		const errorTotals = buildDailyErrorTotals(
			input.errorModelTrend,
			(value) => value,
		);

		return (input.modelTokensTrend ?? []).map((row) => ({
			date: row.date,
			id: row.model,
			label: row.model,
			value:
				input.metric === "cost"
					? calculateCost(row.input_tokens, row.output_tokens, row.model)
					: input.metric === "errors"
						? (errorTotals.get(`${row.date}\u0000${row.model}`) ?? 0)
						: row.total_tokens,
		}));
	}

	const labelByRepositoryKey = new Map(
		input.projects.map((project) => [
			normalizeRepositoryKey(project.repository ?? project.project_path),
			getRepositoryLabel(project),
		]),
	);
	const errorTotals = buildDailyErrorTotals(
		input.errorProjectTrend,
		normalizeRepositoryKey,
	);

	return (input.repositoryDailyTrend ?? []).map((row) => {
		const repositoryKey = normalizeRepositoryKey(row.repository);
		let value = 0;
		switch (input.metric) {
			case "commits":
				value = row.total_commits;
				break;
			case "cost":
				value =
					row.cost ??
					calculateCost(row.input_tokens ?? 0, row.output_tokens ?? 0);
				break;
			case "errors":
				value = errorTotals.get(`${row.date}\u0000${repositoryKey}`) ?? 0;
				break;
			case "sessions":
				value = row.sessions;
				break;
			case "tokens":
				value = row.total_tokens ?? 0;
				break;
		}

		return {
			date: row.date,
			id: repositoryKey,
			label: labelByRepositoryKey.get(repositoryKey) ?? row.repository,
			value,
		};
	});
}

function getMetricValue(row: CostControlRow, metric: CostMetric) {
	switch (metric) {
		case "commits":
			return row.commits;
		case "cost":
			return row.cost;
		case "errors":
			return row.errors;
		case "sessions":
			return row.sessions;
		case "tokens":
			return row.tokens;
	}
}

function getSecondaryValue(
	row: CostControlRow,
	metric: CostMetric,
	dimension: CostDimension,
) {
	switch (metric) {
		case "cost":
			return dimension === "models" ? row.tokens : row.sessions;
		case "tokens":
			return dimension === "models" ? row.cost : row.sessions;
		case "commits":
			return row.sessions;
		case "errors":
			return dimension === "models" ? row.tokens : row.sessions;
		case "sessions":
			return row.tokens;
	}
}

function getAxisLabel(label: string, dimension: CostDimension) {
	if (dimension === "members") {
		const emailSafeLabel = label.includes("@")
			? (label.split("@")[0] ?? label)
			: label;
		return emailSafeLabel.split(/\s+/u)[0] || emailSafeLabel;
	}

	if (dimension === "repositories") {
		const normalizedLabel = label
			.replace(/\\/gu, "/")
			.replace(/\/+$/u, "")
			.replace(/\.git$/u, "");
		const repositoryName = normalizedLabel.split("/").at(-1) ?? normalizedLabel;

		return repositoryName.length > 16
			? `${repositoryName.slice(0, 14)}…`
			: repositoryName;
	}

	const normalizedLabel = label
		.replace(/^claude-/u, "")
		.replace(/-\d{8}$/u, "");

	return normalizedLabel.length > 14
		? `${normalizedLabel.slice(0, 12)}…`
		: normalizedLabel;
}

function formatDecimal(value: number) {
	return value.toLocaleString(undefined, {
		maximumFractionDigits: 2,
	});
}

function formatRatio(numerator: number, denominator: number, scale: number) {
	if (denominator <= 0) {
		return "—";
	}

	return formatDecimal((numerator / denominator) * scale);
}

function getChartPresentation(
	metric: CostMetric,
	dimension: CostDimension,
): CostControlChartPresentation {
	const numericPresentation = {
		allowDecimals: false,
		formatPrimaryValue: formatNumber,
		yAxisTickFormatter: formatCompactWholeNumber,
		yAxisWidth: 42,
	};

	if (metric === "cost") {
		const isModelDimension = dimension === "models";

		return {
			allowDecimals: true,
			derivedLabel: isModelDimension ? "Cost / 1M tokens" : "Cost / session",
			formatDerivedValue: (cost, secondaryValue) =>
				secondaryValue > 0
					? formatCurrency(
							isModelDimension
								? cost / (secondaryValue / 1_000_000)
								: cost / secondaryValue,
						)
					: "—",
			formatPrimaryValue: formatCurrency,
			formatSecondaryValue: formatNumber,
			primaryLabel: "Estimated cost",
			secondaryLabel: isModelDimension ? "Tokens" : "Sessions",
			yAxisTickFormatter: formatCompactCurrency,
			yAxisWidth: 48,
		};
	}

	if (metric === "tokens") {
		const isModelDimension = dimension === "models";

		return {
			...numericPresentation,
			derivedLabel: isModelDimension ? "Cost / 1M tokens" : "Tokens / session",
			formatDerivedValue: isModelDimension
				? (tokens, cost) =>
						tokens > 0 ? formatCurrency(cost / (tokens / 1_000_000)) : "—"
				: (tokens, sessions) => formatRatio(tokens, sessions, 1),
			formatSecondaryValue: isModelDimension ? formatCurrency : formatNumber,
			primaryLabel: "Tokens",
			secondaryLabel: isModelDimension ? "Estimated cost" : "Sessions",
		};
	}

	if (metric === "commits") {
		return {
			...numericPresentation,
			derivedLabel: "Commit rate",
			formatDerivedValue: (commits, sessions) =>
				sessions > 0 ? `${formatRatio(commits, sessions, 100)}%` : "—",
			formatSecondaryValue: formatNumber,
			primaryLabel: "Commits",
			secondaryLabel: "Sessions",
		};
	}

	if (metric === "errors") {
		const isModelDimension = dimension === "models";

		return {
			...numericPresentation,
			derivedLabel: isModelDimension
				? "Errors / 1M tokens"
				: "Errors / session",
			formatDerivedValue: (errors, secondaryValue) =>
				formatRatio(errors, secondaryValue, isModelDimension ? 1_000_000 : 1),
			formatSecondaryValue: formatNumber,
			primaryLabel: "Errors",
			secondaryLabel: isModelDimension ? "Tokens" : "Sessions",
		};
	}

	return {
		...numericPresentation,
		derivedLabel: "Tokens / session",
		formatDerivedValue: (sessions, tokens) => formatRatio(tokens, sessions, 1),
		formatSecondaryValue: formatNumber,
		primaryLabel: "Sessions",
		secondaryLabel: "Tokens",
	};
}

function DashboardCostChartFallback() {
	const skeletonHeights = [
		{ height: "h-[9rem]", id: "cost-chart-skeleton-a" },
		{ height: "h-[13rem]", id: "cost-chart-skeleton-b" },
		{ height: "h-[7rem]", id: "cost-chart-skeleton-c" },
		{ height: "h-[15rem]", id: "cost-chart-skeleton-d" },
		{ height: "h-[10rem]", id: "cost-chart-skeleton-e" },
		{ height: "h-[12rem]", id: "cost-chart-skeleton-f" },
	];

	return (
		<div className="flex h-full items-end gap-4 px-7 pb-12 pt-6">
			{skeletonHeights.map((skeleton) => (
				<div
					key={skeleton.id}
					className="flex min-w-0 flex-1 flex-col items-center gap-3"
				>
					<Skeleton
						className={`w-full max-w-12 rounded-xl ${skeleton.height}`}
					/>
					<Skeleton className="h-3 w-12 rounded-full" />
				</div>
			))}
		</div>
	);
}

export function DashboardCostControl({
	errorDeveloperTrend,
	errorModelTrend,
	errorProjectTrend,
	isPending,
	modelTokensTrend,
	performanceUsers,
	projects,
	repositoryDailyTrend,
	userDailyTrend,
}: {
	errorDeveloperTrend: readonly ErrorTrendDataPoint[] | undefined;
	errorModelTrend: readonly ErrorTrendDataPoint[] | undefined;
	errorProjectTrend: readonly ErrorTrendDataPoint[] | undefined;
	isPending: CostControlPendingState;
	modelTokensTrend: readonly ModelTokensTrendData[] | undefined;
	performanceUsers: readonly DashboardPerformanceUserComparison[];
	projects: readonly ProjectInvestment[];
	repositoryDailyTrend: readonly RepositoryDailyTrendData[] | undefined;
	userDailyTrend: readonly UserDailyTrendData[] | undefined;
}) {
	const [dimension, setDimension] = useState<CostDimension>("members");
	const [metric, setMetric] = useState<CostMetric>("cost");
	const [chartType, setChartType] = useState<CostChartType>("bar");
	const { highlightSource, highlightedItemId, setHighlight } =
		useDashboardHighlightState();
	const rows = useMemo(
		() =>
			buildCostRows({
				dimension,
				errorDeveloperTrend,
				errorModelTrend,
				errorProjectTrend,
				modelTokensTrend,
				performanceUsers,
				projects,
				repositoryDailyTrend,
			}),
		[
			dimension,
			errorDeveloperTrend,
			errorModelTrend,
			errorProjectTrend,
			modelTokensTrend,
			performanceUsers,
			projects,
			repositoryDailyTrend,
		],
	);
	const chartData = useMemo<DashboardTokenDeveloperDatum[]>(
		() =>
			[...rows]
				.sort(
					(left, right) =>
						getMetricValue(right, metric) - getMetricValue(left, metric) ||
						left.label.localeCompare(right.label),
				)
				.slice(0, MAX_VISIBLE_POINTS)
				.map((row) => ({
					axisLabel: getAxisLabel(row.label, dimension),
					fullLabel: row.label,
					id: row.id,
					imageUrl: row.imageUrl,
					sessions: getSecondaryValue(row, metric, dimension),
					totalTokens: getMetricValue(row, metric),
				})),
		[dimension, metric, rows],
	);
	const historyData = useMemo(
		() =>
			buildCostHistoryData({
				dimension,
				errorDeveloperTrend,
				errorModelTrend,
				errorProjectTrend,
				metric,
				modelTokensTrend,
				performanceUsers,
				projects,
				repositoryDailyTrend,
				userDailyTrend,
			}),
		[
			dimension,
			errorDeveloperTrend,
			errorModelTrend,
			errorProjectTrend,
			metric,
			modelTokensTrend,
			performanceUsers,
			projects,
			repositoryDailyTrend,
			userDailyTrend,
		],
	);
	const presentation = getChartPresentation(metric, dimension);
	const availableMetricOptions = metricOptionsByDimension[dimension];
	const isChartPending =
		isPending.base[dimension] ||
		(metric === "errors" && isPending.errors[dimension]);
	const hasMetricData = chartData.some((datum) => datum.totalTokens > 0);
	const hasHistoryData = historyData.some((datum) => datum.value > 0);
	const hasSelectedChartData =
		chartType === "bar" ? hasMetricData : hasHistoryData;

	return (
		<section className="@container/cost-control dashboardy-card flex min-h-[32rem] flex-col rounded-2xl border @5xl/dashboard-page:h-full @5xl/dashboard-page:min-h-0">
			<div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[color:var(--dashboardy-border)] px-5 py-3 sm:px-6">
				<div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
					<fieldset
						aria-label="Chart axes"
						className="flex min-w-0 items-center gap-1.5 border-0 p-0 text-sm text-[color:var(--dashboardy-muted)]"
					>
						<span>Show</span>
						<Select
							name="dashboard-y-axis"
							value={metric}
							onValueChange={(nextMetric) => {
								if (isCostMetric(nextMetric)) {
									setHighlight(null);
									setMetric(nextMetric);
								}
							}}
						>
							<SelectTrigger
								aria-label="Y axis metric"
								className="h-8 bg-transparent px-2 font-semibold text-[color:var(--dashboardy-heading)] ring-1 ring-[color:var(--dashboardy-border)]"
								size="sm"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent align="start">
								{availableMetricOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<span>{chartType === "line" ? "over time by" : "by"}</span>
						<Select
							name="dashboard-x-axis"
							value={dimension}
							onValueChange={(nextDimension) => {
								if (isCostDimension(nextDimension)) {
									setHighlight(null);
									setDimension(nextDimension);
									if (!isMetricAvailable(metric, nextDimension)) {
										setMetric("cost");
									}
								}
							}}
						>
							<SelectTrigger
								aria-label="X axis dimension"
								className="h-8 bg-transparent px-2 font-semibold text-[color:var(--dashboardy-heading)] ring-1 ring-[color:var(--dashboardy-border)]"
								size="sm"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent align="start">
								{dimensionOptions.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</fieldset>

					<ToggleGroup
						aria-label="Chart type"
						className="dashboardy-toggle-group"
						size="sm"
						spacing={0}
						value={[chartType]}
						variant="outline"
						onValueChange={(nextValue) => {
							const nextChartType = nextValue[0];
							if (isCostChartType(nextChartType)) {
								setHighlight(null);
								setChartType(nextChartType);
							}
						}}
					>
						{chartTypeOptions.map((option) => (
							<ToggleGroupItem
								key={option.value}
								value={option.value}
								className="dashboardy-toggle-item h-8 px-2.5 text-sm"
							>
								{option.label}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
				</div>

				<DashboardDateControls
					className="ml-auto shrink-0"
					sourceComponent="dashboard_cost_control_date_picker"
				/>
			</div>

			<div className="min-h-100 flex-1 px-2 pb-2 pt-4 sm:px-4 @5xl/dashboard-page:min-h-0">
				{isChartPending ? (
					<DashboardCostChartFallback />
				) : hasSelectedChartData ? (
					chartType === "line" ? (
						<DashboardCostHistoryChart
							allowDecimals={presentation.allowDecimals}
							className="h-full"
							data={historyData}
							formatValue={presentation.formatPrimaryValue}
							metricLabel={presentation.primaryLabel}
							yAxisTickFormatter={presentation.yAxisTickFormatter}
							yAxisWidth={presentation.yAxisWidth}
						/>
					) : (
						<DashboardTokenDeveloperChart
							activeId={highlightedItemId}
							allowDecimals={presentation.allowDecimals}
							className="h-full"
							data={chartData}
							derivedLabel={presentation.derivedLabel}
							formatDerivedValue={presentation.formatDerivedValue}
							formatPrimaryValue={presentation.formatPrimaryValue}
							formatSecondaryValue={presentation.formatSecondaryValue}
							highlightSource={highlightSource}
							labelVariant={dimension === "members" ? "avatar" : "plain"}
							onHighlightUserChange={setHighlight}
							primaryLabel={presentation.primaryLabel}
							secondaryLabel={presentation.secondaryLabel}
							yAxisTickFormatter={presentation.yAxisTickFormatter}
							yAxisWidth={presentation.yAxisWidth}
						/>
					)
				) : (
					<div className="flex h-full min-h-80 items-center justify-center px-6 text-center">
						<p className="max-w-xs text-sm text-[color:var(--dashboardy-muted)]">
							No {metricLabels[metric].toLowerCase()} data by{" "}
							{dimensionLabels[dimension].toLowerCase()} in this period.
						</p>
					</div>
				)}
			</div>
		</section>
	);
}
