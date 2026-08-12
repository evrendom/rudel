import { buildWaterfallLayout } from "./session-trace-timeline";
import {
	formatSessionTurnMetricValue,
	getSessionTurnMetricValue,
} from "./session-turn-metric";
import type { SessionTurnTableOption } from "./session-turn-table";

export type SessionTurnWaterfallMetric = "context" | "cost" | "time";

export type SessionTurnWaterfallRow = {
	estimated: boolean;
	index: number;
	offsetRatio: number;
	sizeRatio: number;
	value: number | undefined;
};

export type SessionTurnWaterfallLayout = {
	maximum: number;
	rows: readonly SessionTurnWaterfallRow[];
};

export function getSessionTurnWaterfallMetricValue(
	option: SessionTurnTableOption,
	metric: SessionTurnWaterfallMetric,
) {
	if (metric === "time") {
		return getSessionTurnMetricValue(option, "duration");
	}

	return getSessionTurnMetricValue(
		option,
		metric === "context" ? "input" : "cost",
	);
}

export function formatSessionTurnWaterfallMetricValue(
	value: number | undefined,
	metric: SessionTurnWaterfallMetric,
) {
	return formatSessionTurnMetricValue(
		value,
		metric === "time" ? "duration" : metric === "context" ? "input" : "cost",
	);
}

export function buildSessionTurnWaterfallLayout(
	options: readonly SessionTurnTableOption[],
	metric: SessionTurnWaterfallMetric,
): SessionTurnWaterfallLayout {
	if (metric === "time") {
		const timeline = buildWaterfallLayout(
			options.map((option) => option.timing),
		);
		const totalMilliseconds = Math.max(timeline.totalCompressedMs, 1);

		return {
			maximum: timeline.totalCompressedMs / 1_000,
			rows: timeline.rows.map((row) => ({
				estimated: row.estimated,
				index: row.index,
				offsetRatio: row.x0 / totalMilliseconds,
				sizeRatio: (row.x1 - row.x0) / totalMilliseconds,
				value: options[row.index]?.timing.durationSeconds,
			})),
		};
	}

	const values = options.map((option) =>
		getSessionTurnWaterfallMetricValue(option, metric),
	);
	const maximum = Math.max(0, ...values.map((value) => value ?? 0));

	return {
		maximum,
		rows: values.map((value, index) => ({
			estimated: value === undefined,
			index,
			offsetRatio: 0,
			sizeRatio:
				maximum > 0 && value !== undefined ? Math.max(value / maximum, 0) : 0,
			value,
		})),
	};
}
