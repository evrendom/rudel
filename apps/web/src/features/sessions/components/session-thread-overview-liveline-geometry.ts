import type { SessionThreadOverviewPathPoint } from "./session-thread-overview-chart";
import type { SessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import { resolveLivelineInputTokenLimit } from "./session-thread-overview-context-limits";
import type {
	SessionOverviewCallPoint,
	SessionOverviewCallSeries,
	SessionOverviewCallTurn,
} from "./session-thread-overview-model";
import { getChartX } from "./session-thread-overview-strip-utils";

export type SessionOverviewLivelinePoint = SessionThreadOverviewPathPoint & {
	value: number;
};

export type SessionOverviewLivelineSignal = {
	areaPath: string;
	baselineY: number;
	gridYs: readonly number[];
	linePath: string;
	points: readonly SessionOverviewLivelinePoint[];
	topY: number;
};

export type SessionOverviewLivelineCallHit = {
	call: SessionOverviewCallPoint;
	callIndex: number;
	turnIndex: number;
};

function formatPathNumber(value: number) {
	const rounded = Number(value.toFixed(3));
	return Object.is(rounded, -0) ? "0" : String(rounded);
}

function getLivelineY(
	value: number,
	maximum: number,
	topY: number,
	baselineY: number,
) {
	if (value <= 0 || maximum <= 0) {
		return baselineY;
	}
	return baselineY - Math.min(value / maximum, 1) * (baselineY - topY);
}

function getInteriorCallXs(
	turn: SessionOverviewCallTurn,
	config: SessionThreadOverviewStripConfig,
) {
	const startX = getChartX(turn.xStartRatio, config);
	const endX = getChartX(turn.xEndRatio, config);
	const width = endX - startX;
	if (width <= 0 || turn.calls.length === 0) {
		return [];
	}

	const minimumGap = Math.min(1, width / (turn.calls.length + 1));
	const positions = turn.calls.map((call, index) => {
		const minimumX = startX + minimumGap * (index + 1);
		const maximumX = endX - minimumGap * (turn.calls.length - index);
		return Math.min(
			Math.max(getChartX(call.xRatio, config), minimumX),
			maximumX,
		);
	});

	for (let index = positions.length - 2; index >= 0; index -= 1) {
		const nextX = positions[index + 1];
		const currentX = positions[index];
		if (nextX !== undefined && currentX !== undefined) {
			positions[index] = Math.min(currentX, nextX - minimumGap);
		}
	}

	return positions;
}

// X coordinate of one plotted model call, identical to the step positions
// buildLivelineSignal draws, so focused markers share the collision logic.
export function getLivelineCallX(
	series: SessionOverviewCallSeries,
	config: SessionThreadOverviewStripConfig,
	turnIndex: number,
	callIndex: number,
) {
	const turn = series.turns.find((candidate) => candidate.index === turnIndex);
	if (!turn) {
		return undefined;
	}
	return getInteriorCallXs(turn, config)[callIndex];
}

// Top of the input axis: the largest denominator any call is scaled by,
// mirroring buildLivelineSignal's per-call maximum resolution. With a single
// model this is simply its context window.
export function getLivelineInputAxisMaximum(
	series: SessionOverviewCallSeries,
	headroom = 1.12,
) {
	const observedMaximum =
		Math.max(
			0,
			...series.turns.flatMap((turn) =>
				turn.calls.map((call) => call.inputTotal),
			),
		) * headroom;
	let maximum = 0;
	for (const turn of series.turns) {
		for (const call of turn.calls) {
			maximum = Math.max(
				maximum,
				call.modelContextWindow ??
					resolveLivelineInputTokenLimit(call.model) ??
					observedMaximum,
			);
		}
	}
	return maximum;
}

// The call whose value the drawn step path holds at chart position x: the
// first call's value applies from the turn's start, each later call's from
// its own step X, and the hold runs to the turn's end. Outside every turn
// the signal is on the baseline and there is no call.
export function getLivelineCallAtX(
	series: SessionOverviewCallSeries,
	config: SessionThreadOverviewStripConfig,
	x: number,
): SessionOverviewLivelineCallHit | undefined {
	for (const turn of series.turns) {
		const startX = getChartX(turn.xStartRatio, config);
		const endX = getChartX(turn.xEndRatio, config);
		if (x < startX || x > endX) {
			continue;
		}
		const callXs = getInteriorCallXs(turn, config);
		let callIndex = 0;
		for (let index = 1; index < callXs.length; index += 1) {
			const callX = callXs[index];
			if (callX !== undefined && callX <= x) {
				callIndex = index;
			}
		}
		const call = turn.calls[callIndex];
		return call ? { call, callIndex, turnIndex: turn.index } : undefined;
	}
	return undefined;
}

// Hovering is point inspection, not step-path inspection. Select the plotted
// call nearest the cursor so the readout changes halfway between adjacent
// calls instead of holding the previous value until the next vertical step.
export function getNearestLivelineCallAtX(
	series: SessionOverviewCallSeries,
	config: SessionThreadOverviewStripConfig,
	x: number,
): SessionOverviewLivelineCallHit | undefined {
	const plotLeft = config.plotPadding;
	const plotRight = config.chartWidth - config.plotPadding;
	let nearest: SessionOverviewLivelineCallHit | undefined;
	let nearestDistance = Number.POSITIVE_INFINITY;

	for (const turn of series.turns) {
		const callXs = getInteriorCallXs(turn, config);
		for (const [callIndex, call] of turn.calls.entries()) {
			const callX = callXs[callIndex];
			if (callX === undefined || callX < plotLeft || callX > plotRight) {
				continue;
			}
			const distance = Math.abs(callX - x);
			if (distance < nearestDistance) {
				nearest = { call, callIndex, turnIndex: turn.index };
				nearestDistance = distance;
			}
		}
	}

	return nearest;
}

// A historical Liveline-style signal rather than a cumulative curve. Each
// point is one model call's input context and does not sum earlier chart
// points. Turn boundaries are explicit zeroes, keeping the entire idle span
// on the baseline.
export function buildLivelineSignal(
	series: SessionOverviewCallSeries,
	config: SessionThreadOverviewStripConfig,
	headroom = 1.12,
): SessionOverviewLivelineSignal {
	const topY = 5;
	const baselineY = config.axisY;
	const plotLeft = config.plotPadding;
	const plotRight = config.chartWidth - config.plotPadding;
	const observedMaximum =
		Math.max(
			0,
			...series.turns.flatMap((turn) =>
				turn.calls.map((call) => call.inputTotal),
			),
		) * headroom;
	const getMaximum = (call: SessionOverviewCallTurn["calls"][number]) =>
		call.modelContextWindow ??
		resolveLivelineInputTokenLimit(call.model) ??
		observedMaximum;
	const points: SessionOverviewLivelinePoint[] = [
		{ value: 0, x: plotLeft, y: baselineY },
	];
	let linePath = `M ${formatPathNumber(plotLeft)} ${formatPathNumber(baselineY)}`;

	for (const turn of series.turns) {
		const startX = getChartX(turn.xStartRatio, config);
		const endX = getChartX(turn.xEndRatio, config);
		const callXs = getInteriorCallXs(turn, config);
		if (callXs.length === 0) {
			continue;
		}

		points.push({ value: 0, x: startX, y: baselineY });
		linePath += ` H ${formatPathNumber(startX)}`;
		for (const [callIndex, call] of turn.calls.entries()) {
			const x = callXs[callIndex];
			if (x === undefined) {
				continue;
			}
			const value = call.inputTotal;
			const point = {
				value,
				x,
				y: getLivelineY(value, getMaximum(call), topY, baselineY),
			};
			points.push(point);
			if (callIndex === 0) {
				linePath += ` V ${formatPathNumber(point.y)}`;
			} else {
				linePath += ` H ${formatPathNumber(x)} V ${formatPathNumber(point.y)}`;
			}
		}
		points.push({ value: 0, x: endX, y: baselineY });
		linePath += ` H ${formatPathNumber(endX)} V ${formatPathNumber(baselineY)}`;
	}

	points.push({ value: 0, x: plotRight, y: baselineY });
	linePath += ` H ${formatPathNumber(plotRight)}`;
	const firstPoint = points[0];
	const lastPoint = points.at(-1);
	const areaPath =
		linePath && firstPoint && lastPoint
			? `${linePath} L ${formatPathNumber(lastPoint.x)} ${formatPathNumber(baselineY)} L ${formatPathNumber(firstPoint.x)} ${formatPathNumber(baselineY)} Z`
			: "";

	return {
		areaPath,
		baselineY,
		gridYs: [0.25, 0.5, 0.75].map(
			(ratio) => baselineY - (baselineY - topY) * ratio,
		),
		linePath,
		points,
		topY,
	};
}
