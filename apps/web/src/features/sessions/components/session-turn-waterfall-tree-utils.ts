import {
	Activity,
	Brain,
	FileOutput,
	type LucideIcon,
	MessageSquare,
	Settings2,
	Sparkles,
	User,
	Wrench,
} from "lucide-react";
import type { SelectedTurnOption } from "./session-selected-turn";
import type { SessionTurnWaterfallRow } from "./session-turn-waterfall";
import type {
	SessionTurnWaterfallTraceKind,
	SessionTurnWaterfallTraceRow,
} from "./session-turn-waterfall-trace";

export type WaterfallBarPosition = Pick<
	SessionTurnWaterfallRow,
	"estimated" | "offsetRatio" | "sizeRatio"
>;

export function getTraceIcon(kind: SessionTurnWaterfallTraceKind): LucideIcon {
	switch (kind) {
		case "activity":
			return Activity;
		case "member":
			return User;
		case "reasoning":
			return Brain;
		case "message":
			return MessageSquare;
		case "skill":
			return Sparkles;
		case "tool":
			return Wrench;
		case "result":
			return FileOutput;
		case "system":
			return Settings2;
	}
}

function parseTimestamp(timestamp: string | undefined) {
	if (!timestamp) {
		return undefined;
	}

	const value = Date.parse(timestamp);
	return Number.isNaN(value) ? undefined : value;
}

export function getTraceBarPosition(
	option: SelectedTurnOption,
	turnPosition: WaterfallBarPosition,
	traceRow: SessionTurnWaterfallTraceRow,
): WaterfallBarPosition {
	const turnStart = parseTimestamp(option.timing.startTimestamp);
	const turnEnd = parseTimestamp(option.timing.endTimestamp);
	const traceStart = parseTimestamp(traceRow.timestamp);
	if (
		turnStart === undefined ||
		turnEnd === undefined ||
		traceStart === undefined ||
		turnEnd <= turnStart
	) {
		return {
			estimated: true,
			offsetRatio: turnPosition.offsetRatio,
			sizeRatio: 0,
		};
	}

	const turnDuration = turnEnd - turnStart;
	const traceOffset = Math.min(
		Math.max((traceStart - turnStart) / turnDuration, 0),
		1,
	);
	const traceSize = Math.min(
		Math.max((traceRow.durationMs ?? 0) / turnDuration, 0),
		1 - traceOffset,
	);
	return {
		estimated: traceRow.durationMs === undefined,
		offsetRatio:
			turnPosition.offsetRatio + traceOffset * turnPosition.sizeRatio,
		sizeRatio: traceSize * turnPosition.sizeRatio,
	};
}
