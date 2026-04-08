import type { ErrorsDashboard, ErrorTrendDataPoint } from "@rudel/api-routes";
import { eachDayOfInterval, format, parseISO } from "date-fns";
import type { DashboardHeadlineMetric } from "@/features/dashboard/data/dashboard-static-data";

export type DashboardErrorMetric =
	| "total_errors"
	| "avg_errors_per_session"
	| "avg_errors_per_interaction";

export type DashboardErrorDailyPoint = {
	activeDimensions: number;
	avgErrorsPerInteraction: number | null;
	avgErrorsPerSession: number | null;
	axisLabel: string;
	date: string;
	errorTypes: string[];
	fullLabel: string;
	totalErrors: number | null;
};

export type DashboardErrorDimensionRow = {
	activeDays: number;
	avgErrorsPerInteraction: number;
	avgErrorsPerSession: number;
	id: string;
	label: string;
	totalErrors: number;
};

export type DashboardErrorDimensionSeries = {
	color: string;
	id: string;
	label: string;
};

export type DashboardErrorTrendChartRow = {
	date: string;
	fullLabel: string;
} & Record<string, number | string>;

export type DashboardErrorDimensionBarDatum = {
	activeDays: number;
	id: string;
	label: string;
	shortLabel: string;
	value: number;
};

export function buildErrorHeadlineMetrics(
	errorDashboard: ErrorsDashboard | undefined,
): DashboardHeadlineMetric[] {
	const summary = errorDashboard?.summary;

	return [
		{
			description: "All error occurrences in the selected range.",
			deltaLabel: "0",
			deltaTone: "neutral",
			id: "sessions",
			label: "Total errors",
			valueLabel: String(summary?.total_errors ?? 0),
		},
		{
			description: "Unique recurring error signatures.",
			deltaLabel: "0",
			deltaTone: "neutral",
			id: "uncommitted",
			label: "Distinct patterns",
			valueLabel: String(summary?.distinct_patterns ?? 0),
		},
		{
			description: "Patterns crossing the high-severity threshold.",
			deltaLabel: "0",
			deltaTone: "neutral",
			id: "commitRate",
			label: "High severity",
			valueLabel: String(summary?.high_severity_patterns ?? 0),
		},
	];
}

export function getErrorMetricLabel(metric: DashboardErrorMetric) {
	switch (metric) {
		case "avg_errors_per_session":
			return "Avg / session";
		case "avg_errors_per_interaction":
			return "Avg / interaction";
		default:
			return "Errors";
	}
}

export function getErrorMetricValue(
	row: DashboardErrorDimensionRow,
	metric: DashboardErrorMetric,
) {
	switch (metric) {
		case "avg_errors_per_session":
			return row.avgErrorsPerSession;
		case "avg_errors_per_interaction":
			return row.avgErrorsPerInteraction;
		default:
			return row.totalErrors;
	}
}

export function formatErrorMetricValue(
	metric: DashboardErrorMetric,
	value: number,
) {
	if (metric === "total_errors") {
		return value.toLocaleString();
	}

	return value.toFixed(2);
}

export function buildErrorDailyPoints(
	startDate: string,
	endDate: string,
	rows: ErrorTrendDataPoint[] | undefined,
): DashboardErrorDailyPoint[] {
	const aggregateByDate = new Map<
		string,
		{
			activeDimensions: number;
			errorTypeCounts: Map<string, number>;
			interactionEstimate: number;
			sessionEstimate: number;
			totalErrors: number;
		}
	>();

	for (const row of rows ?? []) {
		const current = aggregateByDate.get(row.date) ?? {
			activeDimensions: 0,
			errorTypeCounts: new Map<string, number>(),
			interactionEstimate: 0,
			sessionEstimate: 0,
			totalErrors: 0,
		};

		current.activeDimensions += 1;
		current.totalErrors += row.total_errors;
		current.sessionEstimate += estimateDenominator(
			row.total_errors,
			row.avg_errors_per_session,
		);
		current.interactionEstimate += estimateDenominator(
			row.total_errors,
			row.avg_errors_per_interaction,
		);

		for (const [index, errorType] of row.error_types.entries()) {
			const occurrences = row.error_type_occurrences[index] ?? 0;
			current.errorTypeCounts.set(
				errorType,
				(current.errorTypeCounts.get(errorType) ?? 0) + occurrences,
			);
		}

		aggregateByDate.set(row.date, current);
	}

	return buildDateRange(startDate, endDate).map((date) => {
		const isoDate = format(date, "yyyy-MM-dd");
		const aggregate = aggregateByDate.get(isoDate);

		if (!aggregate) {
			return {
				activeDimensions: 0,
				avgErrorsPerInteraction: null,
				avgErrorsPerSession: null,
				axisLabel: format(date, "EEE"),
				date: isoDate,
				errorTypes: [],
				fullLabel: format(date, "EEEE, MMM d"),
				totalErrors: null,
			};
		}

		const errorTypes = Array.from(aggregate.errorTypeCounts.entries())
			.sort(
				(left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
			)
			.map(([errorPattern]) => errorPattern);

		return {
			activeDimensions: aggregate.activeDimensions,
			avgErrorsPerInteraction:
				aggregate.interactionEstimate > 0
					? Number(
							(aggregate.totalErrors / aggregate.interactionEstimate).toFixed(
								2,
							),
						)
					: null,
			avgErrorsPerSession:
				aggregate.sessionEstimate > 0
					? Number(
							(aggregate.totalErrors / aggregate.sessionEstimate).toFixed(2),
						)
					: null,
			axisLabel: format(date, "EEE"),
			date: isoDate,
			errorTypes,
			fullLabel: format(date, "EEEE, MMM d"),
			totalErrors: aggregate.totalErrors,
		};
	});
}

export function buildErrorDimensionRows(
	rows: ErrorTrendDataPoint[] | undefined,
	splitBy: "project_path" | "user_id",
	userLabelById: Map<string, string>,
): DashboardErrorDimensionRow[] {
	const rowMap = new Map<
		string,
		{
			activeDays: Set<string>;
			interactionEstimate: number;
			label: string;
			sessionEstimate: number;
			totalErrors: number;
		}
	>();

	for (const row of rows ?? []) {
		const current = rowMap.get(row.dimension) ?? {
			activeDays: new Set<string>(),
			interactionEstimate: 0,
			label: formatDimensionLabel(row.dimension, splitBy, userLabelById),
			sessionEstimate: 0,
			totalErrors: 0,
		};

		current.activeDays.add(row.date);
		current.interactionEstimate += estimateDenominator(
			row.total_errors,
			row.avg_errors_per_interaction,
		);
		current.sessionEstimate += estimateDenominator(
			row.total_errors,
			row.avg_errors_per_session,
		);
		current.totalErrors += row.total_errors;
		rowMap.set(row.dimension, current);
	}

	return Array.from(rowMap.entries())
		.map(([id, row]) => ({
			activeDays: row.activeDays.size,
			avgErrorsPerInteraction:
				row.interactionEstimate > 0
					? Number((row.totalErrors / row.interactionEstimate).toFixed(2))
					: 0,
			avgErrorsPerSession:
				row.sessionEstimate > 0
					? Number((row.totalErrors / row.sessionEstimate).toFixed(2))
					: 0,
			id,
			label: row.label,
			totalErrors: row.totalErrors,
		}))
		.sort(
			(left, right) =>
				right.totalErrors - left.totalErrors ||
				right.activeDays - left.activeDays ||
				left.label.localeCompare(right.label),
		);
}

export function buildErrorTrendRows(
	startDate: string,
	endDate: string,
	rows: ErrorTrendDataPoint[] | undefined,
	series: DashboardErrorDimensionSeries[],
	metric: DashboardErrorMetric,
): DashboardErrorTrendChartRow[] {
	const valueMap = new Map(
		(rows ?? []).map((row) => [`${row.dimension}:${row.date}`, row] as const),
	);

	return buildDateRange(startDate, endDate).map((date) => {
		const isoDate = format(date, "yyyy-MM-dd");
		const nextRow: DashboardErrorTrendChartRow = {
			date: isoDate,
			fullLabel: format(date, "EEEE, MMM d"),
		};

		for (const entry of series) {
			nextRow[entry.id] = valueMap.get(`${entry.id}:${isoDate}`)?.[metric] ?? 0;
		}

		return nextRow;
	});
}

export function buildErrorDimensionBarRows(
	rows: DashboardErrorDimensionRow[],
	metric: DashboardErrorMetric,
): DashboardErrorDimensionBarDatum[] {
	return rows.slice(0, 10).map((row) => ({
		activeDays: row.activeDays,
		id: row.id,
		label: row.label,
		shortLabel:
			row.label.length > 14 ? `${row.label.slice(0, 12)}…` : row.label,
		value: getErrorMetricValue(row, metric),
	}));
}

function buildDateRange(startDate: string, endDate: string) {
	const parsedStartDate = parseISO(startDate);
	const parsedEndDate = parseISO(endDate);

	if (
		Number.isNaN(parsedStartDate.getTime()) ||
		Number.isNaN(parsedEndDate.getTime())
	) {
		return [];
	}

	return eachDayOfInterval({
		start:
			parsedStartDate.getTime() <= parsedEndDate.getTime()
				? parsedStartDate
				: parsedEndDate,
		end:
			parsedStartDate.getTime() <= parsedEndDate.getTime()
				? parsedEndDate
				: parsedStartDate,
	});
}

function estimateDenominator(totalErrors: number, average: number) {
	if (average <= 0 || totalErrors <= 0) {
		return 0;
	}

	return totalErrors / average;
}

function formatDimensionLabel(
	value: string,
	splitBy: "project_path" | "user_id",
	userLabelById: Map<string, string>,
) {
	if (splitBy === "user_id") {
		return userLabelById.get(value) ?? value;
	}

	return value.split("/").at(-1) || value;
}
