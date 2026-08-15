import type { SessionThreadOverviewChart } from "./session-thread-overview-chart";
import type { SessionTurnTableOption } from "./session-turn-table";

export type SessionThreadOverviewTimelineEvent = {
	count: number;
	key: string;
	kind: "error" | "skill";
	label: string;
	timestamp: number | undefined;
	xRatio: number;
};

function parseEventTimestamp(timestamp: string | undefined) {
	if (!timestamp) {
		return undefined;
	}

	const value = Date.parse(timestamp);
	return Number.isNaN(value) ? undefined : value;
}

function getEventXRatio(
	chart: SessionThreadOverviewChart,
	timestamp: number | undefined,
	fallbackXRatio: number,
) {
	return timestamp === undefined
		? fallbackXRatio
		: (chart.projectTimestamp(timestamp) ?? fallbackXRatio);
}

export function buildSessionThreadOverviewTimelineEvents(
	chart: SessionThreadOverviewChart,
	options: readonly SessionTurnTableOption[],
): readonly SessionThreadOverviewTimelineEvent[] {
	return options.flatMap((option, turnIndex) => {
		const row = chart.rows[turnIndex];
		if (!row) {
			return [];
		}

		const fallbackTimestamp = parseEventTimestamp(
			option.timing.endTimestamp ?? option.timing.startTimestamp,
		);
		const errorEvents =
			option.metrics.errorEvents.length > 0
				? option.metrics.errorEvents.map((event, eventIndex) => {
						const timestamp = parseEventTimestamp(event.at);
						return {
							count: 1,
							key: `${option.key}-error-${eventIndex}`,
							kind: "error" as const,
							label: "Error",
							timestamp,
							xRatio: getEventXRatio(chart, timestamp, row.xRatio),
						};
					})
				: option.metrics.errorCount > 0
					? [
							{
								count: option.metrics.errorCount,
								key: `${option.key}-errors`,
								kind: "error" as const,
								label: `${option.metrics.errorCount.toLocaleString()} ${option.metrics.errorCount === 1 ? "error" : "errors"}`,
								timestamp: fallbackTimestamp,
								xRatio: getEventXRatio(chart, fallbackTimestamp, row.xRatio),
							},
						]
					: [];
		const skillEvents =
			option.metrics.skillEvents.length > 0
				? option.metrics.skillEvents.map((event, eventIndex) => {
						const timestamp = parseEventTimestamp(event.at);
						return {
							count: 1,
							key: `${option.key}-skill-${eventIndex}`,
							kind: "skill" as const,
							label: `Skill: ${event.skill}`,
							timestamp,
							xRatio: getEventXRatio(chart, timestamp, row.xRatio),
						};
					})
				: option.metrics.skills.map((skill, eventIndex) => ({
						count: 1,
						key: `${option.key}-skill-fallback-${eventIndex}`,
						kind: "skill" as const,
						label: `Skill: ${skill}`,
						timestamp: fallbackTimestamp,
						xRatio: getEventXRatio(chart, fallbackTimestamp, row.xRatio),
					}));

		return [...errorEvents, ...skillEvents];
	});
}
