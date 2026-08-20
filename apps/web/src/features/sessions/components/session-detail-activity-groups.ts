import { formatClockTime, type SessionDetailOverview } from "@rudel/api-routes";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { SESSION_DETAIL_SIGNAL_LABELS } from "./session-detail-language-signals";
import type { SessionDetailOverviewTurnOption } from "./session-detail-overview-model";
import { formatSessionCost } from "./session-detail-view-model";
import { formatCompactTurnTokens } from "./session-turn-table-metrics";

export type SessionDetailActivityKind =
	| "edit"
	| "error"
	| "read"
	| "signal"
	| "skill"
	| "subagent"
	| "write";

export type SessionDetailActivityOccurrence = {
	count: number;
	detail: string;
	eventId: string | undefined;
	key: string;
	supportingDetail?: string;
	time: string;
	turnIndex: number;
	turnLabel: string;
};

export type SessionDetailActivityGroup = {
	emptyLabel: string;
	kind: SessionDetailActivityKind;
	label: string;
	omittedCount: number;
	occurrences: readonly SessionDetailActivityOccurrence[];
	totalCount: number;
};

type SessionDetailFileOperation = NonNullable<
	SessionDetailOverview["turnPage"]["items"][number]["fileEvents"]
>[number]["operation"];

function getFileName(path: string) {
	return path.replaceAll("\\", "/").split("/").at(-1) ?? path;
}

function getTurnLabel(
	option: SessionDetailOverviewTurnOption,
	turnIndex: number,
) {
	return `Turn ${(option.turnNumber ?? turnIndex + 1).toLocaleString()}`;
}

function getOccurrenceTime(
	timestamp: string | undefined,
	option: SessionDetailOverviewTurnOption,
) {
	return formatClockTime(timestamp) || option.timing.startTime;
}

function buildFileActivityGroup({
	label,
	operation,
	options,
}: {
	label: string;
	operation: SessionDetailFileOperation;
	options: readonly SessionDetailOverviewTurnOption[];
}): SessionDetailActivityGroup {
	const action =
		operation === "created"
			? "written"
			: operation === "edited"
				? "edited"
				: "read";
	const occurrences = options.flatMap((option, turnIndex) => {
		const events = (option.fileEvents ?? []).filter(
			(event) => event.operation === operation,
		);
		const editedFileNames = option.metrics.editedFiles.map(getFileName);
		const hasExactEditedFileNames =
			operation === "edited" &&
			events.every((event) => event.count === 1) &&
			editedFileNames.length === events.length;

		return events.map((event, eventIndex) => ({
			count: event.count,
			detail: event.path
				? getFileName(event.path)
				: hasExactEditedFileNames && editedFileNames[eventIndex]
					? editedFileNames[eventIndex]
					: event.count === 1
						? `File ${action}`
						: `${event.count.toLocaleString()} files ${action}`,
			eventId: event.eventId,
			key: `${option.turnId}-${operation}-${event.at}-${eventIndex}`,
			time: getOccurrenceTime(event.at, option),
			turnIndex,
			turnLabel: getTurnLabel(option, turnIndex),
		}));
	});

	const totalCount = occurrences.reduce(
		(total, occurrence) => total + occurrence.count,
		0,
	);
	const kind =
		operation === "read" ? "read" : operation === "created" ? "write" : "edit";

	return {
		emptyLabel: `No files ${action}`,
		kind,
		label,
		omittedCount: 0,
		occurrences,
		totalCount,
	};
}

function buildErrorActivityGroup(
	options: readonly SessionDetailOverviewTurnOption[],
): SessionDetailActivityGroup {
	const occurrences = options.flatMap((option, turnIndex) => {
		if (option.metrics.errorEvents.length > 0) {
			return option.metrics.errorEvents.map((event, eventIndex) => ({
				count: 1,
				detail: event.content ?? "Error",
				eventId: undefined,
				key: `${option.turnId}-error-${event.at}-${eventIndex}`,
				time: getOccurrenceTime(event.at, option),
				turnIndex,
				turnLabel: getTurnLabel(option, turnIndex),
			}));
		}
		if (option.metrics.errorCount === 0) {
			return [];
		}
		return [
			{
				count: option.metrics.errorCount,
				detail:
					option.metrics.errorCount === 1
						? "Error"
						: `${option.metrics.errorCount.toLocaleString()} errors`,
				eventId: undefined,
				key: `${option.turnId}-error-fallback`,
				time: option.timing.endTime || option.timing.startTime,
				turnIndex,
				turnLabel: getTurnLabel(option, turnIndex),
			},
		];
	});

	return {
		emptyLabel: "No errors",
		kind: "error",
		label: "Errors",
		omittedCount: 0,
		occurrences,
		totalCount: occurrences.reduce(
			(total, occurrence) => total + occurrence.count,
			0,
		),
	};
}

function buildSkillActivityGroup(
	options: readonly SessionDetailOverviewTurnOption[],
): SessionDetailActivityGroup {
	const occurrences = options.flatMap((option, turnIndex) => {
		const events =
			option.metrics.skillEvents.length > 0
				? option.metrics.skillEvents
				: option.metrics.skills.map((skill) => ({
						at:
							option.timing.endTimestamp ?? option.timing.startTimestamp ?? "",
						skill,
					}));
		return events.map((event, eventIndex) => ({
			count: 1,
			detail: event.skill,
			eventId: undefined,
			key: `${option.turnId}-skill-${event.at}-${event.skill}-${eventIndex}`,
			time: getOccurrenceTime(event.at || undefined, option),
			turnIndex,
			turnLabel: getTurnLabel(option, turnIndex),
		}));
	});

	return {
		emptyLabel: "No skills used",
		kind: "skill",
		label: "Skills",
		omittedCount: 0,
		occurrences,
		totalCount: occurrences.length,
	};
}

function buildSignalActivityGroup(
	options: readonly SessionDetailOverviewTurnOption[],
): SessionDetailActivityGroup {
	const occurrences = options.flatMap((option, turnIndex) =>
		option.signalOccurrences.flatMap((signal, signalIndex) => {
			const categoryLabel = SESSION_DETAIL_SIGNAL_LABELS[signal.category];
			if (!categoryLabel) {
				return [];
			}
			return [
				{
					count: 1,
					detail: `${categoryLabel} · ${signal.matchedText}`,
					eventId: undefined,
					key: `${option.turnId}-signal-${signal.category}-${signalIndex}`,
					time: option.timing.startTime,
					turnIndex,
					turnLabel: getTurnLabel(option, turnIndex),
				},
			];
		}),
	);

	return {
		emptyLabel: "No positive, negative, or apologetic signals detected",
		kind: "signal",
		label: "Signals",
		omittedCount: options.reduce(
			(total, option) =>
				total +
				(option.signalOccurrencesTruncated
					? option.signalOccurrencesOmittedCount
					: 0),
			0,
		),
		occurrences,
		totalCount: occurrences.length,
	};
}

function buildSubagentActivityGroup(
	options: readonly SessionDetailOverviewTurnOption[],
	subagents: readonly SessionDetailOverview["subagents"][number][],
): SessionDetailActivityGroup {
	const subagentsById = new Map(
		subagents.map((subagent) => [subagent.subagentId, subagent]),
	);
	const occurrences = options.flatMap((option, turnIndex) =>
		(option.subagentEvents ?? []).map((event, eventIndex) => {
			const subagent = event.subagentId
				? subagentsById.get(event.subagentId)
				: undefined;
			const metrics = subagent
				? [
						`Cost ${formatSessionCost(subagent.estimatedCost)}`,
						`IN-TOK ${subagent.inputTokens === null ? "—" : formatCompactTurnTokens(subagent.inputTokens)}`,
						`OUT-TOK ${subagent.outputTokens === null ? "—" : formatCompactTurnTokens(subagent.outputTokens)}`,
					]
				: [];
			return {
				count: event.count,
				detail: subagent?.model
					? formatModelDisplayLabel(subagent.model)
					: event.count === 1
						? "Subagent"
						: `${event.count.toLocaleString()} subagents`,
				eventId: event.eventId,
				key: `${option.turnId}-subagent-${event.at}-${eventIndex}`,
				...(metrics.length > 0
					? { supportingDetail: metrics.join(" · ") }
					: {}),
				time: getOccurrenceTime(event.at, option),
				turnIndex,
				turnLabel: getTurnLabel(option, turnIndex),
			};
		}),
	);

	return {
		emptyLabel: "No subagents used",
		kind: "subagent",
		label: "Subagent",
		omittedCount: 0,
		occurrences,
		totalCount: occurrences.reduce(
			(total, occurrence) => total + occurrence.count,
			0,
		),
	};
}

export function buildSessionDetailActivityGroups({
	activityTotals,
	options,
	subagents,
}: {
	activityTotals: SessionDetailOverview["activityTotals"];
	options: readonly SessionDetailOverviewTurnOption[];
	subagents: readonly SessionDetailOverview["subagents"][number][];
}) {
	const groups = [
		buildFileActivityGroup({
			label: "Read",
			operation: "read",
			options,
		}),
		buildFileActivityGroup({
			label: "Wrote",
			operation: "created",
			options,
		}),
		buildFileActivityGroup({
			label: "Edited",
			operation: "edited",
			options,
		}),
		buildErrorActivityGroup(options),
		buildSignalActivityGroup(options),
		buildSkillActivityGroup(options),
		buildSubagentActivityGroup(options, subagents),
	] satisfies readonly SessionDetailActivityGroup[];

	return groups.map((group) => ({
		...group,
		totalCount: activityTotals[group.kind],
	}));
}
