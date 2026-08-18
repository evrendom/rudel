import type { SessionDetailTurnSummary } from "@rudel/api-routes";
import type { SessionThreadOverviewChart } from "./session-thread-overview-chart";
import type { SessionTurnTableOption } from "./session-turn-table";

export type SessionThreadOverviewTimelineEventKind =
	| "error"
	| "file-edit"
	| "file-read"
	| "file-write"
	| "skill"
	| "subagent";

export type SessionThreadOverviewTimelineEvent = {
	count: number;
	key: string;
	kind: SessionThreadOverviewTimelineEventKind;
	label: string;
	timestamp: number | undefined;
	turnIndex?: number;
	xRatio: number;
};

interface SessionThreadOverviewTimelineOption extends SessionTurnTableOption {
	fileEvents?: ReadonlyArray<
		NonNullable<SessionDetailTurnSummary["fileEvents"]>[number]
	>;
	subagentEvents?: ReadonlyArray<
		NonNullable<SessionDetailTurnSummary["subagentEvents"]>[number]
	>;
}

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
	options: readonly SessionThreadOverviewTimelineOption[],
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
							turnIndex,
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
								turnIndex,
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
							turnIndex,
							xRatio: getEventXRatio(chart, timestamp, row.xRatio),
						};
					})
				: option.metrics.skills.map((skill, eventIndex) => ({
						count: 1,
						key: `${option.key}-skill-fallback-${eventIndex}`,
						kind: "skill" as const,
						label: `Skill: ${skill}`,
						timestamp: fallbackTimestamp,
						turnIndex,
						xRatio: getEventXRatio(chart, fallbackTimestamp, row.xRatio),
					}));
		const fileEvents = (option.fileEvents ?? []).map((event, eventIndex) => {
			const timestamp = parseEventTimestamp(event.at);
			const label =
				event.operation === "read"
					? "File read"
					: event.operation === "created"
						? "File write"
						: "File edit";
			const kind =
				event.operation === "read"
					? ("file-read" as const)
					: event.operation === "created"
						? ("file-write" as const)
						: ("file-edit" as const);
			return {
				count: event.count,
				key: `${option.key}-${kind}-${eventIndex}`,
				kind,
				label,
				timestamp,
				turnIndex,
				xRatio: getEventXRatio(chart, timestamp, row.xRatio),
			};
		});
		const subagentEvents = (option.subagentEvents ?? []).map(
			(event, eventIndex) => {
				const timestamp = parseEventTimestamp(event.at);
				return {
					count: event.count,
					key: `${option.key}-subagent-${eventIndex}`,
					kind: "subagent" as const,
					label: "Subagent",
					timestamp,
					turnIndex,
					xRatio: getEventXRatio(chart, timestamp, row.xRatio),
				};
			},
		);

		return [...errorEvents, ...skillEvents, ...fileEvents, ...subagentEvents];
	});
}
