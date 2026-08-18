import {
	getSessionThreadOverviewIndexAtRatio,
	type SessionThreadOverviewChartRow,
} from "./session-thread-overview-chart";
import type { SessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import type { SessionThreadOverviewTimelineEvent } from "./session-thread-overview-events";
import { getLivelineCallNearX } from "./session-thread-overview-liveline-geometry";
import type {
	SessionOverviewCallPoint,
	SessionOverviewCallSeries,
} from "./session-thread-overview-model";
import {
	getChartX,
	type SessionOverviewHover,
} from "./session-thread-overview-strip-utils";

const SESSION_OVERVIEW_EVENT_HOVER_RADIUS_PX = 8;

export type SessionOverviewActivityCounts = {
	edits: number;
	errors: number;
	reads: number;
	skills: number;
	subagents: number;
	writes: number;
};

type SessionOverviewActivityTarget =
	| {
			callIndex: number;
			kind: "call";
			turnIndex: number;
	  }
	| {
			eventXRatio: number;
			kind: "event";
			turnIndex: number;
	  }
	| {
			kind: "none";
			turnIndex: number;
	  };

function eventStartsAtOrAfterCall(
	event: SessionThreadOverviewTimelineEvent,
	call: SessionOverviewCallPoint,
) {
	return event.timestamp !== undefined && call.timestampMs !== undefined
		? event.timestamp >= call.timestampMs
		: event.xRatio >= call.xRatio;
}

function eventStartsBeforeCall(
	event: SessionThreadOverviewTimelineEvent,
	call: SessionOverviewCallPoint,
) {
	return event.timestamp !== undefined && call.timestampMs !== undefined
		? event.timestamp < call.timestampMs
		: event.xRatio < call.xRatio;
}

function eventBelongsToCall(
	event: SessionThreadOverviewTimelineEvent,
	series: SessionOverviewCallSeries,
	target: SessionOverviewActivityTarget,
) {
	if (target.kind === "none") {
		return false;
	}
	if (target.kind === "event") {
		return event.xRatio.toFixed(6) === target.eventXRatio.toFixed(6);
	}

	const turn = series.turns.find(
		(candidate) => candidate.index === target.turnIndex,
	);
	const call = turn?.calls[target.callIndex];
	if (!call) {
		return false;
	}

	const startsInsideCallWindow =
		target.callIndex === 0 || eventStartsAtOrAfterCall(event, call);
	const nextCall = turn.calls[target.callIndex + 1];
	const endsInsideCallWindow =
		nextCall === undefined || eventStartsBeforeCall(event, nextCall);
	return startsInsideCallWindow && endsInsideCallWindow;
}

export function getSessionOverviewCallActivityCounts(
	events: readonly SessionThreadOverviewTimelineEvent[],
	series: SessionOverviewCallSeries,
	target: SessionOverviewActivityTarget,
): SessionOverviewActivityCounts {
	const counts: SessionOverviewActivityCounts = {
		edits: 0,
		errors: 0,
		reads: 0,
		skills: 0,
		subagents: 0,
		writes: 0,
	};

	for (const event of events) {
		if (
			event.turnIndex !== target.turnIndex ||
			!eventBelongsToCall(event, series, target)
		) {
			continue;
		}

		switch (event.kind) {
			case "error":
				counts.errors += event.count;
				break;
			case "file-edit":
				counts.edits += event.count;
				break;
			case "file-read":
				counts.reads += event.count;
				break;
			case "file-write":
				counts.writes += event.count;
				break;
			case "skill":
				counts.skills += event.count;
				break;
			case "subagent":
				counts.subagents += event.count;
				break;
		}
	}

	return counts;
}

export function hasSessionOverviewActivity(
	counts: SessionOverviewActivityCounts,
) {
	return Object.values(counts).some((count) => count > 0);
}

export function resolveSessionOverviewHoverAtRatio(
	rows: readonly SessionThreadOverviewChartRow[],
	events: readonly SessionThreadOverviewTimelineEvent[],
	series: SessionOverviewCallSeries,
	config: SessionThreadOverviewStripConfig,
	xRatio: number,
): SessionOverviewHover | undefined {
	const hoverX = getChartX(xRatio, config);
	const callHit = getLivelineCallNearX(series, config, hoverX);
	if (callHit && rows.some((row) => row.index === callHit.turnIndex)) {
		return {
			hit: callHit,
			index: callHit.turnIndex,
			kind: "call",
			xRatio,
		};
	}

	let nearestEvent: SessionThreadOverviewTimelineEvent | undefined;
	let nearestEventDistance = Number.POSITIVE_INFINITY;

	for (const event of events) {
		if (
			event.turnIndex === undefined ||
			!rows.some((row) => row.index === event.turnIndex)
		) {
			continue;
		}
		const distance = Math.abs(getChartX(event.xRatio, config) - hoverX);
		if (
			distance <= SESSION_OVERVIEW_EVENT_HOVER_RADIUS_PX &&
			distance < nearestEventDistance
		) {
			nearestEventDistance = distance;
			nearestEvent = event;
		}
	}

	if (nearestEvent?.turnIndex !== undefined) {
		return {
			activityXRatio: nearestEvent.xRatio,
			index: nearestEvent.turnIndex,
			kind: "activity",
			xRatio,
		};
	}

	const index = getSessionThreadOverviewIndexAtRatio(rows, xRatio);
	return index === undefined ? undefined : { index, kind: "timeline", xRatio };
}
