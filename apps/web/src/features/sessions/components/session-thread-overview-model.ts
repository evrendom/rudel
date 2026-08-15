import type { SessionThreadOverviewChartRow } from "./session-thread-overview-chart";
import { resolveSessionOverviewContextWindow } from "./session-thread-overview-context-limits";
import type { TokenUsageEvent } from "./session-turn-metadata";

// "Aug 2 14:32:07" — the exact scrub position on the timescale.
export function formatTimelineMomentWithSeconds(timestampMs: number) {
	const date = new Date(timestampMs);
	const dateLabel = date.toLocaleDateString([], {
		day: "numeric",
		month: "short",
	});
	const clockLabel = date.toLocaleTimeString([], {
		hour: "2-digit",
		hour12: false,
		minute: "2-digit",
		second: "2-digit",
	});
	return `${dateLabel} ${clockLabel}`;
}

// "+2h 13m" / "+45s" — elapsed since the session's first activity.
export function formatElapsedSinceStart(elapsedMs: number) {
	const totalSeconds = Math.max(Math.round(elapsedMs / 1_000), 0);
	if (totalSeconds < 60) {
		return `+${totalSeconds}s`;
	}
	const totalMinutes = Math.floor(totalSeconds / 60);
	const days = Math.floor(totalMinutes / (24 * 60));
	const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
	const minutes = totalMinutes % 60;
	const parts = [
		days > 0 ? `${days}d` : "",
		hours > 0 ? `${hours}h` : "",
		minutes > 0 ? `${minutes}m` : "",
	].filter(Boolean);
	return `+${parts.join(" ")}`;
}
export type SessionOverviewCallPoint = {
	cacheCreation: number;
	cacheRead: number;
	fresh: number;
	inputTotal: number;
	model: string | undefined;
	modelContextWindow?: number;
	xRatio: number;
};

export type SessionOverviewCallTurn = {
	calls: readonly SessionOverviewCallPoint[];
	index: number;
	inputTotal: number;
	xEndRatio: number;
	xStartRatio: number;
};

export type SessionOverviewModelContextLimit = {
	model: string;
	source: "catalog" | "observed" | "reported";
	tokenLimit: number;
};

export type SessionOverviewCallSeries = {
	aggregates: {
		largestCallInputTotal: number;
		largestTurnInputTotal: number;
		modelContextLimits: readonly SessionOverviewModelContextLimit[];
	};
	turns: readonly SessionOverviewCallTurn[];
};

function parseEventTimestamp(at: string) {
	const value = Date.parse(at);
	return Number.isFinite(value) ? value : undefined;
}

// This is the sole normalization boundary for the activity map. Event
// ordering, timestamp fallbacks, call composition, and observed per-model
// context ceilings all live here so the chart consumes stable geometry.
export function buildSessionOverviewCallSeries(
	rows: readonly SessionThreadOverviewChartRow[],
	getTurnUsage: (rowIndex: number) => readonly TokenUsageEvent[],
): SessionOverviewCallSeries {
	const turns: SessionOverviewCallTurn[] = [];
	const observedModelLimits = new Map<string, number>();
	const reportedModelLimits = new Map<string, number>();

	for (const row of rows) {
		const events = getTurnUsage(row.index).map((event, sourceIndex) => ({
			event,
			sourceIndex,
			time: parseEventTimestamp(event.at),
		}));
		if (events.length === 0) {
			continue;
		}

		const ordered = [...events].sort((a, b) => {
			if (a.time === undefined && b.time === undefined) {
				return a.sourceIndex - b.sourceIndex;
			}
			if (a.time === undefined) {
				return 1;
			}
			if (b.time === undefined) {
				return -1;
			}
			return a.time - b.time || a.sourceIndex - b.sourceIndex;
		});
		const knownTimes = ordered.flatMap(({ time }) =>
			time === undefined ? [] : [time],
		);
		const minTime = knownTimes.length > 0 ? Math.min(...knownTimes) : undefined;
		const timeSpan =
			knownTimes.length > 0 ? Math.max(...knownTimes) - (minTime ?? 0) : 0;
		const hasCompleteTimeline = knownTimes.length === ordered.length;
		const xStartRatio = row.xStartRatio;
		const xEndRatio = Math.max(row.xEndRatio, row.xStartRatio);
		const xSpan = xEndRatio - xStartRatio;

		const calls = ordered.map(({ event, time }, index) => {
			const progress =
				hasCompleteTimeline &&
				time !== undefined &&
				minTime !== undefined &&
				timeSpan > 0
					? (time - minTime) / timeSpan
					: index / ordered.length;
			const inputTotal =
				event.inputTokens +
				event.cacheReadInputTokens +
				event.cacheCreationInputTokens;
			if (event.model) {
				observedModelLimits.set(
					event.model,
					Math.max(observedModelLimits.get(event.model) ?? 0, inputTotal),
				);
				if (event.modelContextWindow !== undefined) {
					reportedModelLimits.set(
						event.model,
						Math.max(
							reportedModelLimits.get(event.model) ?? 0,
							event.modelContextWindow,
						),
					);
				}
			}
			return {
				cacheCreation: event.cacheCreationInputTokens,
				cacheRead: event.cacheReadInputTokens,
				fresh: event.inputTokens,
				inputTotal,
				model: event.model,
				...(event.modelContextWindow === undefined
					? {}
					: { modelContextWindow: event.modelContextWindow }),
				xRatio: xStartRatio + progress * xSpan,
			};
		});

		turns.push({
			calls,
			index: row.index,
			inputTotal: calls.reduce((sum, call) => sum + call.inputTotal, 0),
			xEndRatio,
			xStartRatio,
		});
	}

	return {
		aggregates: {
			largestCallInputTotal: Math.max(
				0,
				...turns.flatMap((turn) => turn.calls.map((call) => call.inputTotal)),
			),
			largestTurnInputTotal: Math.max(
				0,
				...turns.map((turn) => turn.inputTotal),
			),
			modelContextLimits: [...observedModelLimits.entries()]
				.sort(([leftModel], [rightModel]) =>
					leftModel.localeCompare(rightModel),
				)
				.map(
					([model, largestObservedCall]): SessionOverviewModelContextLimit => {
						const reportedLimit = reportedModelLimits.get(model);
						if (reportedLimit !== undefined) {
							return {
								model,
								source: "reported",
								tokenLimit: reportedLimit,
							};
						}
						const contextWindow = resolveSessionOverviewContextWindow(
							model,
							largestObservedCall,
						);
						return { model, ...contextWindow };
					},
				),
		},
		turns,
	};
}
