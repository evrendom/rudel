import {
	buildSessionAdalineSpans,
	getSessionAdalineTurnStatus,
	type SessionAdalineOption,
	type SessionAdalineSpan,
	type SessionAdalineSpanStatus,
} from "./session-adaline-model";
import { formatSessionTurnMetricValue } from "./session-turn-metric";

export type SessionTurnTimelineLane = "member" | "model";

export type SessionTurnTimelineBlockKind =
	| "activity"
	| "member"
	| "model"
	| "reasoning"
	| "response";

export type SessionTurnTimelineThicknessMetric = "cost" | "tokens" | "tools";

export type SessionTurnTimelineBlock = {
	depth: 0 | 1;
	durationMs: number;
	estimatedDuration: boolean;
	heightRatio: number;
	id: string;
	kind: SessionTurnTimelineBlockKind;
	label: string;
	lane: SessionTurnTimelineLane;
	metricValue: number | undefined;
	preview: string;
	status: SessionAdalineSpanStatus;
	thicknessRatio: number | undefined;
	timestampMs: number;
	topRatio: number;
	turnIndex: number;
};

export type SessionTurnTimelineContextPoint = {
	offsetRatio: number;
	turnIndex: number;
	value: number;
	valueRatio: number;
};

export type SessionTurnTimelineLayout = {
	blocks: readonly SessionTurnTimelineBlock[];
	contextMaximum: number;
	contextPoints: readonly SessionTurnTimelineContextPoint[];
	endMs: number | undefined;
	startMs: number | undefined;
	totalDurationMs: number;
};

export type SessionTurnTimelineTickLayout = {
	intervalMs: number;
	ticks: readonly {
		offsetRatio: number;
		timestampMs: number;
	}[];
};

export type SessionTurnTimelineViewportRange = {
	endRatio: number;
	startRatio: number;
};

const TIMELINE_TICK_INTERVALS_MS: readonly number[] = [
	1_000,
	2_000,
	5_000,
	10_000,
	15_000,
	30_000,
	60_000,
	2 * 60_000,
	5 * 60_000,
	10 * 60_000,
	15 * 60_000,
	30 * 60_000,
	60 * 60_000,
	2 * 60 * 60_000,
	6 * 60 * 60_000,
	12 * 60 * 60_000,
	24 * 60 * 60_000,
];

function parseTimestamp(timestamp: string | undefined) {
	if (!timestamp) {
		return undefined;
	}

	const value = Date.parse(timestamp);
	return Number.isNaN(value) ? undefined : value;
}

function getTimelineBlockKind(
	kind: SessionAdalineSpan["kind"],
): SessionTurnTimelineBlockKind {
	switch (kind) {
		case "member":
			return "member";
		case "reasoning":
			return "reasoning";
		case "message":
			return "response";
		case "result":
		case "system":
		case "tool":
			return "activity";
	}
}

export function getSessionTurnTimelineMetricValue(
	option: SessionAdalineOption,
	metric: SessionTurnTimelineThicknessMetric,
) {
	switch (metric) {
		case "cost":
			return option.metrics.estimatedCost;
		case "tokens":
			if (
				option.metrics.inputTokens === undefined &&
				option.metrics.outputTokens === undefined
			) {
				return undefined;
			}
			return (
				(option.metrics.inputTokens ?? 0) + (option.metrics.outputTokens ?? 0)
			);
		case "tools":
			return option.toolCallCount;
	}
}

export function formatSessionTurnTimelineMetricValue(
	value: number | undefined,
	metric: SessionTurnTimelineThicknessMetric,
) {
	if (metric === "cost") {
		return formatSessionTurnMetricValue(value, "cost");
	}
	if (metric === "tokens") {
		const formatted = formatSessionTurnMetricValue(value, "input");
		return value === undefined ? formatted : `${formatted} tok`;
	}
	if (value === undefined) {
		return "—";
	}
	return `${value.toLocaleString()} ${value === 1 ? "tool" : "tools"}`;
}

function getTimelineBlockLabel(
	span: SessionAdalineSpan,
	skill: string | undefined,
) {
	if (span.kind === "tool" && span.label === "Skill" && skill) {
		return `Skill · ${skill}`;
	}
	return span.label;
}

export function buildSessionTurnTimelineLayout(
	options: readonly SessionAdalineOption[],
	metric: SessionTurnTimelineThicknessMetric,
): SessionTurnTimelineLayout {
	const drafts: {
		depth: 0 | 1;
		durationMs: number;
		estimatedDuration: boolean;
		id: string;
		kind: SessionTurnTimelineBlockKind;
		label: string;
		lane: SessionTurnTimelineLane;
		metricValue: number | undefined;
		preview: string;
		status: SessionAdalineSpanStatus;
		timestampMs: number;
		turnIndex: number;
	}[] = [];
	const contextDrafts: {
		timestampMs: number;
		turnIndex: number;
		value: number;
	}[] = [];

	options.forEach((option, turnIndex) => {
		const metricValue = getSessionTurnTimelineMetricValue(option, metric);
		const turnDrafts: typeof drafts = [];
		let skillIndex = 0;

		for (const span of buildSessionAdalineSpans(option)) {
			const timestampMs = parseTimestamp(span.timestamp);
			if (timestampMs === undefined) {
				continue;
			}

			const isSkill = span.kind === "tool" && span.label === "Skill";
			const skill = isSkill ? option.metrics.skills[skillIndex] : undefined;
			if (isSkill) {
				skillIndex += 1;
			}
			const kind = getTimelineBlockKind(span.kind);
			const lane = kind === "member" ? "member" : "model";
			turnDrafts.push({
				depth: kind === "member" ? 0 : 1,
				durationMs: kind === "member" ? 0 : Math.max(span.durationMs ?? 0, 0),
				estimatedDuration: span.durationMs === undefined,
				id: `${option.key}:${span.id}`,
				kind,
				label: getTimelineBlockLabel(span, skill),
				lane,
				metricValue: lane === "member" ? undefined : metricValue,
				preview: span.preview,
				status: span.status,
				timestampMs,
				turnIndex,
			});
		}

		const memberDrafts = turnDrafts.filter((draft) => draft.lane === "member");
		const modelDrafts = turnDrafts.filter((draft) => draft.lane === "model");
		const firstModelTimestampMs = Math.min(
			...modelDrafts.map((draft) => draft.timestampMs),
		);
		if (Number.isFinite(firstModelTimestampMs)) {
			const lastModelTimestampMs = Math.max(
				...modelDrafts.map((draft) => draft.timestampMs + draft.durationMs),
			);
			const recordedTurnEndMs = parseTimestamp(option.timing.endTimestamp);
			const modelEndMs = Math.max(
				recordedTurnEndMs ?? lastModelTimestampMs,
				lastModelTimestampMs,
			);
			drafts.push(
				...memberDrafts,
				{
					depth: 0,
					durationMs: Math.max(modelEndMs - firstModelTimestampMs, 0),
					estimatedDuration: recordedTurnEndMs === undefined,
					id: `${option.key}:model`,
					kind: "model",
					label: "Model trace",
					lane: "model",
					metricValue,
					preview: option.preview,
					status: getSessionAdalineTurnStatus(option),
					timestampMs: firstModelTimestampMs,
					turnIndex,
				},
				...modelDrafts,
			);
		} else {
			drafts.push(...memberDrafts);
		}

		const contextTimestampMs =
			(Number.isFinite(firstModelTimestampMs)
				? firstModelTimestampMs
				: undefined) ??
			parseTimestamp(option.timing.startTimestamp) ??
			Math.min(...turnDrafts.map((draft) => draft.timestampMs));
		if (
			option.metrics.inputTokens !== undefined &&
			Number.isFinite(contextTimestampMs)
		) {
			contextDrafts.push({
				timestampMs: contextTimestampMs,
				turnIndex,
				value: option.metrics.inputTokens,
			});
		}
	});

	if (drafts.length === 0 && contextDrafts.length === 0) {
		return {
			blocks: [],
			contextMaximum: 0,
			contextPoints: [],
			endMs: undefined,
			startMs: undefined,
			totalDurationMs: 0,
		};
	}

	const firstTimestampMs = Math.min(
		...drafts.map((draft) => draft.timestampMs),
		...contextDrafts.map((draft) => draft.timestampMs),
	);
	const lastTimestampMs = Math.max(
		...drafts.map((draft) => draft.timestampMs + draft.durationMs),
		...contextDrafts.map((draft) => draft.timestampMs),
	);
	const observedDurationMs = Math.max(lastTimestampMs - firstTimestampMs, 0);
	const paddingMs = Math.max(
		Math.min(observedDurationMs * 0.025, 30_000),
		1_000,
	);
	const totalDurationMs = Math.max(observedDurationMs + paddingMs * 2, 10_000);
	const centerTimestampMs = (firstTimestampMs + lastTimestampMs) / 2;
	const startMs = centerTimestampMs - totalDurationMs / 2;
	const endMs = startMs + totalDurationMs;
	const maximumMetricValue = Math.max(
		0,
		...drafts
			.filter((draft) => draft.kind === "model")
			.map((draft) => draft.metricValue ?? 0),
	);
	const contextMaximum = Math.max(
		0,
		...contextDrafts.map((draft) => draft.value),
	);
	const orderedContextDrafts = [...contextDrafts].sort(
		(first, second) => first.timestampMs - second.timestampMs,
	);

	return {
		blocks: drafts.map((draft) => ({
			...draft,
			heightRatio: draft.durationMs / totalDurationMs,
			thicknessRatio:
				draft.lane === "member" ||
				draft.metricValue === undefined ||
				maximumMetricValue <= 0
					? undefined
					: draft.metricValue / maximumMetricValue,
			topRatio: (draft.timestampMs - startMs) / totalDurationMs,
		})),
		contextMaximum,
		contextPoints: orderedContextDrafts.map((draft) => ({
			offsetRatio: (draft.timestampMs - startMs) / totalDurationMs,
			turnIndex: draft.turnIndex,
			value: draft.value,
			valueRatio: contextMaximum <= 0 ? 0 : draft.value / contextMaximum,
		})),
		endMs,
		startMs,
		totalDurationMs,
	};
}

export function getSessionTurnTimelineHeight(totalDurationMs: number) {
	return Math.min(Math.max((totalDurationMs / 1_000) * 2.5, 640), 7_200);
}

export function getSessionTurnTimelineViewportRange(
	blocks: readonly SessionTurnTimelineBlock[],
	visibleTurnRange: readonly [number, number],
): SessionTurnTimelineViewportRange | undefined {
	const firstVisibleTurn = Math.min(...visibleTurnRange);
	const lastVisibleTurn = Math.max(...visibleTurnRange);
	const visibleBlocks = blocks.filter(
		(block) =>
			block.turnIndex >= firstVisibleTurn && block.turnIndex <= lastVisibleTurn,
	);

	if (visibleBlocks.length === 0) {
		return undefined;
	}

	return {
		endRatio: Math.max(
			...visibleBlocks.map((block) => block.topRatio + block.heightRatio),
		),
		startRatio: Math.min(...visibleBlocks.map((block) => block.topRatio)),
	};
}

export function buildSessionTurnTimelineTicks(
	startMs: number,
	endMs: number,
	height: number,
): SessionTurnTimelineTickLayout {
	const durationMs = Math.max(endMs - startMs, 1);
	const targetIntervalMs = durationMs / Math.max(height / 64, 1);
	const largerIntervalIndex = TIMELINE_TICK_INTERVALS_MS.findIndex(
		(candidate) => candidate >= targetIntervalMs,
	);
	const largerIntervalMs =
		TIMELINE_TICK_INTERVALS_MS[largerIntervalIndex] ??
		TIMELINE_TICK_INTERVALS_MS.at(-1) ??
		24 * 60 * 60_000;
	const smallerIntervalMs =
		TIMELINE_TICK_INTERVALS_MS[Math.max(largerIntervalIndex - 1, 0)] ??
		largerIntervalMs;
	const intervalMs =
		targetIntervalMs - smallerIntervalMs <= largerIntervalMs - targetIntervalMs
			? smallerIntervalMs
			: largerIntervalMs;
	const firstTickMs = Math.ceil(startMs / intervalMs) * intervalMs;
	const ticks: { offsetRatio: number; timestampMs: number }[] = [];

	for (
		let timestampMs = firstTickMs;
		timestampMs <= endMs;
		timestampMs += intervalMs
	) {
		ticks.push({
			offsetRatio: (timestampMs - startMs) / durationMs,
			timestampMs,
		});
	}

	return { intervalMs, ticks };
}
