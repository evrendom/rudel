import type { SessionTurn } from "./session-turns";

export type SessionTraceTimelineInput = {
	endTimestamp?: string;
	startTimestamp?: string;
};

function parseTimestamp(timestamp: string | undefined) {
	if (!timestamp) {
		return undefined;
	}
	const value = Date.parse(timestamp);
	return Number.isNaN(value) ? undefined : value;
}

export function buildWaterfallLayout(
	turns: readonly SessionTraceTimelineInput[],
	settings: {
		compressedGapMs?: number;
		idleGapThresholdMs?: number;
	} = {},
) {
	const compressedGapMs = settings.compressedGapMs ?? 60_000;
	const idleGapThresholdMs = settings.idleGapThresholdMs ?? 600_000;
	const rows: {
		estimated: boolean;
		index: number;
		x0: number;
		x1: number;
	}[] = [];
	const breaks: { afterIndex: number; originalGapMs: number; x: number }[] = [];
	let compressedCursor = 0;
	let previousEnd: number | undefined;

	turns.forEach((turn, index) => {
		const start = parseTimestamp(turn.startTimestamp);
		const end = parseTimestamp(turn.endTimestamp);
		if (start !== undefined && previousEnd !== undefined) {
			const gap = Math.max(start - previousEnd, 0);
			if (gap > idleGapThresholdMs) {
				compressedCursor += compressedGapMs;
				breaks.push({
					afterIndex: index - 1,
					originalGapMs: gap,
					x: compressedCursor,
				});
			} else {
				compressedCursor += gap;
			}
		}

		const duration =
			start !== undefined && end !== undefined && end >= start
				? end - start
				: 0;
		rows.push({
			estimated: start === undefined || end === undefined,
			index,
			x0: compressedCursor,
			x1: compressedCursor + duration,
		});
		compressedCursor += duration;
		previousEnd = end ?? start ?? previousEnd;
	});

	return { breaks, rows, totalCompressedMs: compressedCursor };
}

export type SessionTraceEventSpan = {
	end: number;
	id: string;
	kind: string;
	label: string;
	start: number;
};

export function buildEventSpans(turn: SessionTurn) {
	const events = turn.responseItems.flatMap((item) =>
		item.kind === "agent" ? item.events : [],
	);
	let turnEnd: number | undefined;
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (event?.kind === "message") {
			turnEnd = parseTimestamp(event.timestamp);
			break;
		}
	}

	return events.map((event, index): SessionTraceEventSpan => {
		const start = parseTimestamp(event.timestamp) ?? 0;
		const next = parseTimestamp(events[index + 1]?.timestamp);
		const label = event.kind === "tool" ? event.toolName : event.kind;
		return {
			end: Math.max(next ?? turnEnd ?? start, start),
			id: event.id,
			kind: event.kind,
			label,
			start,
		};
	});
}

export function buildMetricShareLayout(
	values: readonly (number | undefined)[],
) {
	let total = 0;
	for (const value of values) {
		total += value ?? 0;
	}
	if (total <= 0) {
		return [];
	}

	let cursor = 0;
	return values.map((value, index) => {
		const share = (value ?? 0) / total;
		const segment = { index, share, x0: cursor, x1: cursor + share };
		cursor += share;
		return segment;
	});
}
