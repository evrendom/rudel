import type { SessionThreadOverviewTimelineSettings } from "./session-thread-overview-config";
import {
	buildSessionThreadOverviewTimelineScale,
	type SessionThreadOverviewBreak,
	type SessionThreadOverviewTick,
	type SessionThreadTimelineInterval,
} from "./session-thread-overview-timeline";
import type { SessionTurnTableOption } from "./session-turn-table";

export type SessionThreadOverviewChartRow = {
	cost: number | undefined;
	index: number;
	inputTokens: number | undefined;
	xEndRatio: number;
	xRatio: number;
	xStartRatio: number;
};

type SessionThreadOverviewViewport = {
	xEndRatio: number;
	xStartRatio: number;
};

export type SessionThreadOverviewChart = {
	axisEndTimestamp: number | undefined;
	axisStartTimestamp: number | undefined;
	breaks: readonly SessionThreadOverviewBreak[];
	rows: readonly SessionThreadOverviewChartRow[];
	ticks: readonly SessionThreadOverviewTick[];
	projectTimestamp: (timestamp: number) => number | undefined;
	unprojectRatio: (ratio: number) => number | undefined;
};

export function buildSessionThreadOverviewChart(
	options: readonly SessionTurnTableOption[],
	timelineSettings?: SessionThreadOverviewTimelineSettings,
): SessionThreadOverviewChart {
	const scale = buildSessionThreadOverviewTimelineScale(
		getTurnActivityIntervals(options),
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
			cost: option.metrics.estimatedCost,
			index,
			inputTokens: option.metrics.inputTokens,
			xEndRatio,
			xRatio: xEndRatio,
			xStartRatio,
		};
	});

	return {
		axisEndTimestamp: scale.axisEndTimestamp,
		axisStartTimestamp: scale.axisStartTimestamp,
		breaks: scale.breaks,
		projectTimestamp: scale.projectTimestamp,
		rows,
		ticks: scale.ticks,
		unprojectRatio: scale.unprojectRatio,
	};
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

function parseTimestamp(timestamp: string | undefined) {
	if (!timestamp) {
		return undefined;
	}

	const value = Date.parse(timestamp);
	return Number.isNaN(value) ? undefined : value;
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
