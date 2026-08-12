import type {
	SessionThreadOverviewBarScale,
	SessionThreadOverviewTimelineSettings,
} from "./session-thread-overview-config";
import {
	buildSessionThreadOverviewTimelineScale,
	type SessionThreadOverviewBreak,
	type SessionThreadOverviewTick,
	type SessionThreadTimelineInterval,
} from "./session-thread-overview-timeline";
import type { SessionTurnTableOption } from "./session-turn-table";

export type {
	SessionThreadOverviewBreak,
	SessionThreadOverviewTick,
	SessionThreadTimelineInterval,
} from "./session-thread-overview-timeline";

export type SessionThreadOverviewMetric =
	| "cost"
	| "edits"
	| "input"
	| "output"
	| "reasoning"
	| "skills"
	| "subagents";

export const DEFAULT_SESSION_THREAD_OVERVIEW_METRIC: SessionThreadOverviewMetric =
	"cost";

export interface SessionThreadOverviewChartOption
	extends SessionTurnTableOption {
	reasoningCount: number;
	subagentCount: number;
}

export type SessionThreadOverviewChartRow = {
	cost: number | undefined;
	editCount: number;
	errorCount: number;
	index: number;
	inputTokens: number | undefined;
	outputTokens: number | undefined;
	reasoningCount: number;
	skillCount: number;
	subagentCount: number;
	xEndRatio: number;
	xRatio: number;
	xStartRatio: number;
};

export type SessionThreadOverviewViewport = {
	xEndRatio: number;
	xStartRatio: number;
};

export type SessionThreadOverviewCostPoint = {
	cumulativeCost: number;
	index: number;
	xRatio: number;
};

export type SessionThreadOverviewPathPoint = {
	x: number;
	y: number;
};

export type SessionThreadOverviewChart = {
	axisEndTimestamp: number | undefined;
	axisStartTimestamp: number | undefined;
	breaks: readonly SessionThreadOverviewBreak[];
	rows: readonly SessionThreadOverviewChartRow[];
	ticks: readonly SessionThreadOverviewTick[];
	unprojectRatio: (ratio: number) => number | undefined;
	totals: {
		cost: number | undefined;
		edits: number;
		errors: number;
		inputTokens: number | undefined;
		outputTokens: number | undefined;
		reasoning: number;
		skills: number;
		subagents: number;
	};
};

function parseTimestamp(timestamp: string | undefined) {
	if (!timestamp) {
		return undefined;
	}

	const value = Date.parse(timestamp);
	return Number.isNaN(value) ? undefined : value;
}

function parseTranscriptTimestamps(content: string) {
	const timestamps: number[] = [];
	for (const rawLine of content.split("\n")) {
		if (!rawLine.trim()) {
			continue;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(rawLine);
		} catch {
			continue;
		}
		if (
			typeof parsed !== "object" ||
			parsed === null ||
			!("timestamp" in parsed) ||
			typeof parsed.timestamp !== "string"
		) {
			continue;
		}

		const timestamp = parseTimestamp(parsed.timestamp);
		if (timestamp !== undefined) {
			timestamps.push(timestamp);
		}
	}

	return timestamps;
}

export function getSessionSubagentActivityIntervals(
	subagents: Readonly<Record<string, string>>,
): SessionThreadTimelineInterval[] {
	return Object.entries(subagents).flatMap(([key, content]) => {
		const timestamps = parseTranscriptTimestamps(content);
		if (timestamps.length === 0) {
			return [];
		}

		return [
			{
				endTimestamp: Math.max(...timestamps),
				key,
				startTimestamp: Math.min(...timestamps),
			},
		];
	});
}

export function getSessionSubagentCountsByTurn(
	options: readonly SessionTurnTableOption[],
	subagents: Readonly<Record<string, string>>,
) {
	const anchors = options.map((option) =>
		parseTimestamp(option.timing.startTimestamp),
	);
	const counts = options.map(() => 0);

	for (const interval of getSessionSubagentActivityIntervals(subagents)) {
		for (let index = anchors.length - 1; index >= 0; index -= 1) {
			const anchor = anchors[index];
			if (anchor !== undefined && interval.startTimestamp >= anchor) {
				counts[index] = (counts[index] ?? 0) + 1;
				break;
			}
		}
	}

	return counts;
}

function sumRecordedValues(values: readonly (number | undefined)[]) {
	let hasRecordedValue = false;
	let total = 0;
	for (const value of values) {
		if (value === undefined) {
			continue;
		}
		hasRecordedValue = true;
		total += value;
	}

	return hasRecordedValue ? total : undefined;
}

function getTurnActivityIntervals(
	options: readonly SessionTurnTableOption[],
): SessionThreadTimelineInterval[] {
	return options.flatMap((option) => {
		const startTimestamp = parseTimestamp(option.timing.startTimestamp);
		const endTimestamp = parseTimestamp(option.timing.endTimestamp);
		const usableStartTimestamp = startTimestamp ?? endTimestamp;
		if (usableStartTimestamp === undefined) {
			return [];
		}

		return [
			{
				endTimestamp: Math.max(
					endTimestamp ?? usableStartTimestamp,
					usableStartTimestamp,
				),
				key: option.key,
				startTimestamp: usableStartTimestamp,
			},
		];
	});
}

export function getSessionThreadOverviewMetricValue(
	row: SessionThreadOverviewChartRow,
	metric: SessionThreadOverviewMetric,
) {
	switch (metric) {
		case "cost":
			return row.cost;
		case "edits":
			return row.editCount;
		case "input":
			return row.inputTokens;
		case "output":
			return row.outputTokens;
		case "reasoning":
			return row.reasoningCount;
		case "skills":
			return row.skillCount;
		case "subagents":
			return row.subagentCount;
	}
}

export function getSessionThreadOverviewMetricMaximum(
	rows: readonly SessionThreadOverviewChartRow[],
	metric: SessionThreadOverviewMetric,
) {
	return Math.max(
		0,
		...rows.map((row) => getSessionThreadOverviewMetricValue(row, metric) ?? 0),
	);
}

export function getSessionThreadOverviewMetricRatio(
	row: SessionThreadOverviewChartRow,
	metric: SessionThreadOverviewMetric,
	maximum: number,
	scale: SessionThreadOverviewBarScale = "sqrt",
) {
	const value = getSessionThreadOverviewMetricValue(row, metric);
	if (value === undefined || value <= 0 || maximum <= 0) {
		return undefined;
	}

	const ratio = value / maximum;
	return scale === "sqrt" ? Math.sqrt(ratio) : ratio;
}

export function getSessionThreadOverviewMetricMedian(
	rows: readonly SessionThreadOverviewChartRow[],
	metric: SessionThreadOverviewMetric,
) {
	const values = rows
		.map((row) => getSessionThreadOverviewMetricValue(row, metric))
		.filter((value): value is number => value !== undefined && value > 0)
		.sort((left, right) => left - right);
	if (values.length === 0) {
		return undefined;
	}

	const middle = Math.floor(values.length / 2);
	const upper = values[middle];
	if (values.length % 2 === 1) {
		return upper;
	}

	const lower = values[middle - 1];
	return lower === undefined || upper === undefined
		? upper
		: (lower + upper) / 2;
}

export function getSessionThreadOverviewIndexAtRatio(
	rows: readonly SessionThreadOverviewChartRow[],
	xRatio: number,
) {
	const firstRow = rows[0];
	if (!firstRow) {
		return undefined;
	}

	const boundedRatio = Math.min(Math.max(xRatio, 0), 1);
	let closestRow = firstRow;
	let closestDistance = Math.abs(firstRow.xRatio - boundedRatio);
	for (const row of rows.slice(1)) {
		const distance = Math.abs(row.xRatio - boundedRatio);
		if (distance < closestDistance) {
			closestDistance = distance;
			closestRow = row;
		}
	}

	return closestRow.index;
}

export function getSessionThreadOverviewViewport(
	rows: readonly SessionThreadOverviewChartRow[],
	visibleRange: readonly [number, number] | undefined,
): SessionThreadOverviewViewport | undefined {
	if (!visibleRange) {
		return undefined;
	}

	const startIndex = Math.min(visibleRange[0], visibleRange[1]);
	const endIndex = Math.max(visibleRange[0], visibleRange[1]);
	const visibleRows = rows.filter(
		(row) => row.index >= startIndex && row.index <= endIndex,
	);
	const firstRow = visibleRows[0];
	const lastRow = visibleRows.at(-1);
	if (!firstRow || !lastRow) {
		return undefined;
	}

	return {
		xEndRatio: Math.max(lastRow.xEndRatio, lastRow.xRatio),
		xStartRatio: Math.min(firstRow.xStartRatio, firstRow.xRatio),
	};
}

export function buildSessionThreadOverviewCumulativeCostPoints(
	rows: readonly SessionThreadOverviewChartRow[],
) {
	let cumulativeCost = 0;
	return rows.map((row): SessionThreadOverviewCostPoint => {
		cumulativeCost += row.cost ?? 0;
		return {
			cumulativeCost,
			index: row.index,
			xRatio: row.xRatio,
		};
	});
}

function formatPathNumber(value: number) {
	const rounded = Number(value.toFixed(3));
	return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function buildSessionThreadOverviewMonotonePath(
	points: readonly SessionThreadOverviewPathPoint[],
) {
	const usablePoints: SessionThreadOverviewPathPoint[] = [];
	for (const point of points) {
		const previous = usablePoints.at(-1);
		if (previous && point.x <= previous.x) {
			if (point.x === previous.x) {
				usablePoints[usablePoints.length - 1] = point;
			}
			continue;
		}
		usablePoints.push(point);
	}

	const firstPoint = usablePoints[0];
	if (!firstPoint) {
		return "";
	}
	if (usablePoints.length === 1) {
		return `M ${formatPathNumber(firstPoint.x)} ${formatPathNumber(firstPoint.y)}`;
	}

	const segmentCount = usablePoints.length - 1;
	const intervalWidths = new Array<number>(segmentCount).fill(0);
	const secantSlopes = new Array<number>(segmentCount).fill(0);
	for (let index = 0; index < segmentCount; index += 1) {
		const left = usablePoints[index];
		const right = usablePoints[index + 1];
		if (!left || !right) {
			continue;
		}
		const width = right.x - left.x;
		intervalWidths[index] = width;
		secantSlopes[index] = width === 0 ? 0 : (right.y - left.y) / width;
	}

	const tangents = new Array<number>(usablePoints.length).fill(0);
	tangents[0] = secantSlopes[0] ?? 0;
	tangents[tangents.length - 1] = secantSlopes.at(-1) ?? 0;
	for (let index = 1; index < usablePoints.length - 1; index += 1) {
		const previousSlope = secantSlopes[index - 1] ?? 0;
		const nextSlope = secantSlopes[index] ?? 0;
		tangents[index] =
			previousSlope * nextSlope <= 0 ? 0 : (previousSlope + nextSlope) / 2;
	}

	for (let index = 0; index < segmentCount; index += 1) {
		const slope = secantSlopes[index] ?? 0;
		if (slope === 0) {
			tangents[index] = 0;
			tangents[index + 1] = 0;
			continue;
		}

		const alpha = (tangents[index] ?? 0) / slope;
		const beta = (tangents[index + 1] ?? 0) / slope;
		const magnitudeSquared = alpha * alpha + beta * beta;
		if (magnitudeSquared <= 9) {
			continue;
		}

		const scale = 3 / Math.sqrt(magnitudeSquared);
		tangents[index] = scale * alpha * slope;
		tangents[index + 1] = scale * beta * slope;
	}

	let path = `M ${formatPathNumber(firstPoint.x)} ${formatPathNumber(firstPoint.y)}`;
	for (let index = 0; index < segmentCount; index += 1) {
		const left = usablePoints[index];
		const right = usablePoints[index + 1];
		if (!left || !right) {
			continue;
		}
		const width = intervalWidths[index] ?? 0;
		const leftTangent = tangents[index] ?? 0;
		const rightTangent = tangents[index + 1] ?? 0;
		path += [
			" C ",
			formatPathNumber(left.x + width / 3),
			" ",
			formatPathNumber(left.y + (leftTangent * width) / 3),
			" ",
			formatPathNumber(right.x - width / 3),
			" ",
			formatPathNumber(right.y - (rightTangent * width) / 3),
			" ",
			formatPathNumber(right.x),
			" ",
			formatPathNumber(right.y),
		].join("");
	}

	return path;
}

export function buildSessionThreadOverviewChart(
	options: readonly SessionThreadOverviewChartOption[],
	additionalActivityIntervals: readonly SessionThreadTimelineInterval[] = [],
	timelineSettings?: SessionThreadOverviewTimelineSettings,
): SessionThreadOverviewChart {
	const costValues = options.map((option) => option.metrics.estimatedCost);
	const inputValues = options.map((option) => option.metrics.inputTokens);
	const outputValues = options.map((option) => option.metrics.outputTokens);
	const scale = buildSessionThreadOverviewTimelineScale(
		[...getTurnActivityIntervals(options), ...additionalActivityIntervals],
		timelineSettings,
	);
	const fallbackDenominator = Math.max(options.length, 1);
	const rows = options.map((option, index) => {
		const startTimestamp = parseTimestamp(option.timing.startTimestamp);
		const endTimestamp = parseTimestamp(option.timing.endTimestamp);
		const fallbackRatio = (index + 0.5) / fallbackDenominator;
		const usableStartTimestamp = startTimestamp ?? endTimestamp;
		const usableEndTimestamp =
			endTimestamp === undefined ||
			(usableStartTimestamp !== undefined &&
				endTimestamp < usableStartTimestamp)
				? usableStartTimestamp
				: endTimestamp;
		const xStartRatio =
			usableStartTimestamp === undefined
				? fallbackRatio
				: (scale.projectTimestamp(usableStartTimestamp) ?? fallbackRatio);
		const xEndRatio =
			usableEndTimestamp === undefined
				? xStartRatio
				: (scale.projectTimestamp(usableEndTimestamp) ?? xStartRatio);

		return {
			cost: costValues[index],
			editCount: option.metrics.editedFiles.length,
			errorCount: option.metrics.errorCount,
			index,
			inputTokens: inputValues[index],
			outputTokens: outputValues[index],
			reasoningCount: option.reasoningCount,
			skillCount: option.metrics.skills.length,
			subagentCount: option.subagentCount,
			xEndRatio,
			xRatio: xEndRatio,
			xStartRatio,
		};
	});

	return {
		axisEndTimestamp: scale.axisEndTimestamp,
		axisStartTimestamp: scale.axisStartTimestamp,
		breaks: scale.breaks,
		rows,
		ticks: scale.ticks,
		unprojectRatio: scale.unprojectRatio,
		totals: {
			cost: sumRecordedValues(costValues),
			edits: rows.reduce((total, row) => total + row.editCount, 0),
			errors: rows.reduce((total, row) => total + row.errorCount, 0),
			inputTokens: sumRecordedValues(inputValues),
			outputTokens: sumRecordedValues(outputValues),
			reasoning: rows.reduce((total, row) => total + row.reasoningCount, 0),
			skills: rows.reduce((total, row) => total + row.skillCount, 0),
			subagents: rows.reduce((total, row) => total + row.subagentCount, 0),
		},
	};
}
