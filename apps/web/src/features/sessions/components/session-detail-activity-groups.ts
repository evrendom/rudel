import { formatClockTime, type SessionDetailOverview } from "@rudel/api-routes";
import {
	type LanguageSignalCategory,
	scanLanguageSignals,
} from "@rudel/language-signals";
import type { SessionDetailOverviewTurnOption } from "./session-detail-overview-model";

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
	time: string;
	turnIndex: number;
	turnLabel: string;
};

export type SessionDetailActivityGroup = {
	emptyLabel: string;
	kind: SessionDetailActivityKind;
	label: string;
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
				detail: "Error",
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
		occurrences,
		totalCount: occurrences.length,
	};
}

const DISPLAYED_SIGNAL_LABELS: Readonly<
	Partial<Record<LanguageSignalCategory, string>>
> = {
	apology: "Apologetic",
	negative: "Negative",
	positive: "Positive",
};

function buildSignalActivityGroup(
	options: readonly SessionDetailOverviewTurnOption[],
): SessionDetailActivityGroup {
	const occurrences = options.flatMap((option, turnIndex) =>
		scanLanguageSignals(option.memberText).flatMap((signal, signalIndex) => {
			const categoryLabel = DISPLAYED_SIGNAL_LABELS[signal.category];
			if (!categoryLabel) {
				return [];
			}
			return [
				{
					count: 1,
					detail: `${categoryLabel} · ${signal.matchedText}`,
					eventId: undefined,
					key: `${option.turnId}-signal-${signal.ruleId}-${signal.start}-${signalIndex}`,
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
		occurrences,
		totalCount: occurrences.length,
	};
}

function buildSubagentActivityGroup(
	options: readonly SessionDetailOverviewTurnOption[],
): SessionDetailActivityGroup {
	const occurrences = options.flatMap((option, turnIndex) =>
		(option.subagentEvents ?? []).map((event, eventIndex) => ({
			count: event.count,
			detail:
				event.count === 1
					? "Subagent"
					: `${event.count.toLocaleString()} subagents`,
			eventId: undefined,
			key: `${option.turnId}-subagent-${event.at}-${eventIndex}`,
			time: getOccurrenceTime(event.at, option),
			turnIndex,
			turnLabel: getTurnLabel(option, turnIndex),
		})),
	);

	return {
		emptyLabel: "No subagents used",
		kind: "subagent",
		label: "Subagent",
		occurrences,
		totalCount: occurrences.reduce(
			(total, occurrence) => total + occurrence.count,
			0,
		),
	};
}

export function buildSessionDetailActivityGroups({
	options,
}: {
	options: readonly SessionDetailOverviewTurnOption[];
}) {
	return [
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
		buildSubagentActivityGroup(options),
	] satisfies readonly SessionDetailActivityGroup[];
}
