import {
	DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
	type SessionThreadOverviewTimelineSettings,
} from "./session-thread-overview-config";

const MINUTE_MS = 60 * 1_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const ROUND_TICK_INTERVALS_MS: readonly number[] = [
	MINUTE_MS,
	5 * MINUTE_MS,
	15 * MINUTE_MS,
	30 * MINUTE_MS,
	HOUR_MS,
	2 * HOUR_MS,
	4 * HOUR_MS,
	6 * HOUR_MS,
	12 * HOUR_MS,
	DAY_MS,
	2 * DAY_MS,
	7 * DAY_MS,
];

export type SessionThreadTimelineInterval = {
	endTimestamp: number;
	key: string;
	startTimestamp: number;
};

export type SessionThreadOverviewBreak = {
	durationMs: number;
	endTimestamp: number;
	idleDurationMs: number;
	idleEndTimestamp: number;
	idleStartTimestamp: number;
	key: string;
	startTimestamp: number;
	xEndRatio: number;
	xStartRatio: number;
};

export type SessionThreadOverviewTick = {
	timestamp: number;
	xRatio: number;
};

type TimelineScale = {
	axisEndTimestamp: number | undefined;
	axisStartTimestamp: number | undefined;
	breaks: readonly SessionThreadOverviewBreak[];
	projectTimestamp: (timestamp: number) => number | undefined;
	unprojectRatio: (ratio: number) => number | undefined;
};

export type SessionThreadOverviewTimelineScale = TimelineScale & {
	ticks: readonly SessionThreadOverviewTick[];
};

function mergeActivityIntervals(
	intervals: readonly SessionThreadTimelineInterval[],
) {
	const sorted = [...intervals].sort(
		(left, right) => left.startTimestamp - right.startTimestamp,
	);
	const merged: { endTimestamp: number; startTimestamp: number }[] = [];
	for (const interval of sorted) {
		const previous = merged.at(-1);
		if (!previous || interval.startTimestamp > previous.endTimestamp) {
			merged.push({
				endTimestamp: interval.endTimestamp,
				startTimestamp: interval.startTimestamp,
			});
			continue;
		}

		previous.endTimestamp = Math.max(
			previous.endTimestamp,
			interval.endTimestamp,
		);
	}

	return merged;
}

function buildTimelineScale(
	intervals: readonly SessionThreadTimelineInterval[],
	settings: SessionThreadOverviewTimelineSettings,
): TimelineScale {
	const idleGapThresholdMs = Math.max(
		settings.idleGapThresholdMinutes * MINUTE_MS,
		MINUTE_MS,
	);
	// A cut must leave this much real idle time visible on each side of the
	// marker; gaps that cannot afford the margin stay uncompressed.
	const breakMarginMs = Math.max(settings.breakMarginMinutes, 0) * MINUTE_MS;
	const getRemovedMs = (idleDurationMs: number) =>
		Math.floor(
			Math.max(idleDurationMs - 2 * breakMarginMs, 0) / idleGapThresholdMs,
		) * idleGapThresholdMs;
	const merged = mergeActivityIntervals(intervals);
	const firstInterval = merged[0];
	const lastInterval = merged.at(-1);
	if (!firstInterval || !lastInterval) {
		return {
			axisEndTimestamp: undefined,
			axisStartTimestamp: undefined,
			breaks: [],
			projectTimestamp: () => undefined,
			unprojectRatio: () => undefined,
		};
	}

	const axisStartTimestamp = firstInterval.startTimestamp;
	const axisEndTimestamp = lastInterval.endTimestamp;
	const sourceBreaks = merged.slice(0, -1).flatMap((interval, index) => {
		const nextInterval = merged[index + 1];
		if (!nextInterval) {
			return [];
		}
		const idleDurationMs = nextInterval.startTimestamp - interval.endTimestamp;
		const durationMs = getRemovedMs(idleDurationMs);
		const visibleRemainderMs = idleDurationMs - durationMs;
		const startTimestamp =
			interval.endTimestamp + Math.floor(visibleRemainderMs / 2);
		return durationMs > 0
			? [
					{
						durationMs,
						endTimestamp: startTimestamp + durationMs,
						idleDurationMs,
						idleEndTimestamp: nextInterval.startTimestamp,
						idleStartTimestamp: interval.endTimestamp,
						startTimestamp,
					},
				]
			: [];
	});
	const fullDuration = axisEndTimestamp - axisStartTimestamp;
	const removedDuration = sourceBreaks.reduce(
		(total, gap) => total + gap.durationMs,
		0,
	);
	const activeDuration = fullDuration - removedDuration;
	if (fullDuration <= 0 || activeDuration <= 0 || sourceBreaks.length === 0) {
		const projectTimestamp = (timestamp: number) =>
			fullDuration <= 0
				? 0.5
				: Math.min(
						Math.max((timestamp - axisStartTimestamp) / fullDuration, 0),
						1,
					);
		const unprojectRatio = (ratio: number) =>
			fullDuration <= 0
				? axisStartTimestamp
				: axisStartTimestamp + Math.min(Math.max(ratio, 0), 1) * fullDuration;
		return {
			axisEndTimestamp,
			axisStartTimestamp,
			breaks: [],
			projectTimestamp,
			unprojectRatio,
		};
	}

	const breakRatio = Math.min(
		settings.fixedBreakRatio,
		settings.maximumTotalBreakRatio / sourceBreaks.length,
	);
	const activeRatio = 1 - breakRatio * sourceBreaks.length;
	const activeScale = activeRatio / activeDuration;
	const projectTimestamp = (timestamp: number) => {
		const boundedTimestamp = Math.min(
			Math.max(timestamp, axisStartTimestamp),
			axisEndTimestamp,
		);
		let sourceCursor = axisStartTimestamp;
		let targetCursor = 0;

		for (const gap of sourceBreaks) {
			if (boundedTimestamp <= gap.startTimestamp) {
				return targetCursor + (boundedTimestamp - sourceCursor) * activeScale;
			}

			targetCursor += (gap.startTimestamp - sourceCursor) * activeScale;
			if (boundedTimestamp <= gap.endTimestamp) {
				return (
					targetCursor +
					((boundedTimestamp - gap.startTimestamp) / gap.durationMs) *
						breakRatio
				);
			}

			targetCursor += breakRatio;
			sourceCursor = gap.endTimestamp;
		}

		return targetCursor + (boundedTimestamp - sourceCursor) * activeScale;
	};
	const breaks = sourceBreaks.map((gap, index) => ({
		...gap,
		key: `idle-${index}-${gap.startTimestamp}`,
		xEndRatio: projectTimestamp(gap.endTimestamp),
		xStartRatio: projectTimestamp(gap.startTimestamp),
	}));

	// Inverse of projectTimestamp: walks the same active/break segments so a
	// pointer position on the compressed axis maps back to a real timestamp.
	const unprojectRatio = (ratio: number) => {
		const boundedRatio = Math.min(Math.max(ratio, 0), 1);
		let sourceCursor = axisStartTimestamp;
		let targetCursor = 0;

		for (const gap of sourceBreaks) {
			const activeSpanRatio = (gap.startTimestamp - sourceCursor) * activeScale;
			if (boundedRatio <= targetCursor + activeSpanRatio) {
				return sourceCursor + (boundedRatio - targetCursor) / activeScale;
			}
			targetCursor += activeSpanRatio;
			if (boundedRatio <= targetCursor + breakRatio) {
				return (
					gap.startTimestamp +
					((boundedRatio - targetCursor) / breakRatio) * gap.durationMs
				);
			}
			targetCursor += breakRatio;
			sourceCursor = gap.endTimestamp;
		}

		return Math.min(
			sourceCursor + (boundedRatio - targetCursor) / activeScale,
			axisEndTimestamp,
		);
	};

	return {
		axisEndTimestamp,
		axisStartTimestamp,
		breaks,
		projectTimestamp,
		unprojectRatio,
	};
}

function getRoundTickInterval(durationMs: number, targetTickCount: number) {
	const targetInterval = durationMs / Math.max(targetTickCount, 1);
	return (
		ROUND_TICK_INTERVALS_MS.find(
			(intervalMs) => intervalMs >= targetInterval,
		) ??
		ROUND_TICK_INTERVALS_MS.at(-1) ??
		DAY_MS
	);
}

function getNextRoundTick(timestamp: number, intervalMs: number) {
	const date = new Date(timestamp);
	if (intervalMs >= DAY_MS) {
		const intervalDays = Math.max(Math.round(intervalMs / DAY_MS), 1);
		date.setHours(0, 0, 0, 0);
		do {
			date.setDate(date.getDate() + intervalDays);
		} while (date.getTime() <= timestamp);
		return date.getTime();
	}

	if (intervalMs >= HOUR_MS) {
		const intervalHours = Math.max(Math.round(intervalMs / HOUR_MS), 1);
		date.setMinutes(0, 0, 0);
		const hourRemainder = date.getHours() % intervalHours;
		date.setHours(
			date.getHours() +
				(hourRemainder === 0 ? intervalHours : intervalHours - hourRemainder),
		);
		return date.getTime();
	}

	const intervalMinutes = Math.max(Math.round(intervalMs / MINUTE_MS), 1);
	date.setSeconds(0, 0);
	const minuteRemainder = date.getMinutes() % intervalMinutes;
	date.setMinutes(
		date.getMinutes() +
			(minuteRemainder === 0
				? intervalMinutes
				: intervalMinutes - minuteRemainder),
	);
	return date.getTime();
}

function advanceRoundTick(timestamp: number, intervalMs: number) {
	const date = new Date(timestamp);
	if (intervalMs >= DAY_MS) {
		date.setDate(date.getDate() + Math.max(Math.round(intervalMs / DAY_MS), 1));
		return date.getTime();
	}

	if (intervalMs >= HOUR_MS) {
		date.setHours(
			date.getHours() + Math.max(Math.round(intervalMs / HOUR_MS), 1),
		);
		return date.getTime();
	}

	date.setMinutes(
		date.getMinutes() + Math.max(Math.round(intervalMs / MINUTE_MS), 1),
	);
	return date.getTime();
}

function buildTimelineTicks(
	scale: TimelineScale,
	settings: SessionThreadOverviewTimelineSettings,
) {
	const axisStartTimestamp = scale.axisStartTimestamp;
	const axisEndTimestamp = scale.axisEndTimestamp;
	if (axisStartTimestamp === undefined || axisEndTimestamp === undefined) {
		return [];
	}

	const duration = axisEndTimestamp - axisStartTimestamp;
	if (duration <= 0) {
		return [{ timestamp: axisStartTimestamp, xRatio: 0.5 }];
	}

	const ticks: SessionThreadOverviewTick[] = [
		{ timestamp: axisStartTimestamp, xRatio: 0 },
	];
	const intervalMs = getRoundTickInterval(duration, settings.targetTickCount);
	let timestamp = getNextRoundTick(axisStartTimestamp, intervalMs);
	let guard = 0;
	while (timestamp < axisEndTimestamp && guard < 2_000) {
		guard += 1;
		const insideBreak = scale.breaks.some(
			(gap) => timestamp > gap.startTimestamp && timestamp < gap.endTimestamp,
		);
		const xRatio = scale.projectTimestamp(timestamp);
		const previousTick = ticks.at(-1);
		if (
			!insideBreak &&
			xRatio !== undefined &&
			previousTick &&
			xRatio - previousTick.xRatio >= settings.minimumTickSpacingRatio
		) {
			ticks.push({ timestamp, xRatio });
		}
		timestamp = advanceRoundTick(timestamp, intervalMs);
	}

	const previousTick = ticks.at(-1);
	if (
		previousTick &&
		1 - previousTick.xRatio >= settings.minimumTickSpacingRatio
	) {
		ticks.push({ timestamp: axisEndTimestamp, xRatio: 1 });
	}

	return ticks;
}

export function buildSessionThreadOverviewTimelineScale(
	intervals: readonly SessionThreadTimelineInterval[],
	settings: SessionThreadOverviewTimelineSettings = DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
): SessionThreadOverviewTimelineScale {
	const scale = buildTimelineScale(intervals, settings);
	return {
		...scale,
		ticks: buildTimelineTicks(scale, settings),
	};
}
