import type {
	SessionTurnTableOption,
	SessionTurnTableRow,
	SessionTurnTableSpeaker,
} from "./session-turn-table";
import type { SessionTurnTableSortKey } from "./session-turn-table-filters";
import {
	formatCompactTurnDuration,
	formatCompactTurnTokens,
	formatTotalTurnDuration,
	formatTurnCost,
	getMaximumRowValue,
	getRelativeMagnitude,
	getRowTotal,
} from "./session-turn-table-metrics";

type TurnTableValue = {
	key?: string;
	label: string;
	relativeMagnitude: number | undefined;
	title: string | undefined;
};

type TurnTableSummary = {
	label: string;
	title: string;
};

export type TurnTableColumn = {
	appearance: "plain" | "signal" | "tag";
	getValues: (row: SessionTurnTableRow) => readonly TurnTableValue[];
	key: string;
	label: string;
	sortKey: SessionTurnTableSortKey | undefined;
	summary: TurnTableSummary | undefined;
	widthClassName: string;
};

function buildIndexedColumns({
	count,
	getValue,
	key,
	label,
	sortKey,
	widthClassName,
}: {
	count: number;
	getValue: (
		option: SessionTurnTableOption,
		index: number,
	) => TurnTableValue | undefined;
	key: string;
	label: string;
	sortKey: SessionTurnTableSortKey;
	widthClassName: string;
}): TurnTableColumn[] {
	return Array.from({ length: count }, (_, index) => ({
		appearance: "plain",
		getValues: (row: SessionTurnTableRow) => {
			if (row.speaker === "member") {
				return [];
			}
			const value = getValue(row.match.option, index);
			return value ? [value] : [];
		},
		key: `${key}-${index}`,
		label: index === 0 ? label : `${label} ${index + 1}`,
		sortKey,
		summary: undefined,
		widthClassName,
	}));
}

export function buildSessionTurnTableColumns(
	options: readonly SessionTurnTableOption[],
	primarySpeaker: SessionTurnTableSpeaker,
	rows: readonly SessionTurnTableRow[] = [],
): TurnTableColumn[] {
	if (primarySpeaker === "member") {
		const maximumCharacterCount = getMaximumRowValue(
			rows,
			(row) => row.characterCount,
		);
		const totalCharacterCount = getRowTotal(rows, (row) => row.characterCount);
		return [
			{
				appearance: "plain",
				getValues: (row) =>
					row.characterCount === undefined
						? []
						: [
								{
									label: row.characterCount.toLocaleString(),
									relativeMagnitude: getRelativeMagnitude(
										row.characterCount,
										maximumCharacterCount,
									),
									title: `${row.characterCount.toLocaleString()} characters`,
								},
							],
				key: "characters",
				label: "Characters",
				sortKey: undefined,
				summary:
					totalCharacterCount === undefined
						? undefined
						: {
								label: totalCharacterCount.toLocaleString(),
								title: `${totalCharacterCount.toLocaleString()} total characters`,
							},
				widthClassName: "w-28",
			},
			{
				appearance: "signal",
				getValues: (row) =>
					row.speaker === "member"
						? row.sentimentWords.map((word, index) => ({
								key: `${row.key}:sentiment:${index}`,
								label: word,
								relativeMagnitude: undefined,
								title: "Detected in user message",
							}))
						: [],
				key: "sentiment-words",
				label: "Sentiment words",
				sortKey: undefined,
				summary: undefined,
				widthClassName: "w-32",
			},
		];
	}

	const maxCommands = Math.max(
		0,
		...options.map((option) => option.slashCommands.length),
	);
	const modelRows = rows.filter((row) => row.speaker === "model");
	const maximums = {
		cost: getMaximumRowValue(
			modelRows,
			(row) => row.match.option.metrics.estimatedCost,
		),
		duration: getMaximumRowValue(
			modelRows,
			(row) => row.match.option.timing.durationSeconds,
		),
		input: getMaximumRowValue(
			modelRows,
			(row) => row.match.option.metrics.inputTokens,
		),
		output: getMaximumRowValue(
			modelRows,
			(row) => row.match.option.metrics.outputTokens,
		),
	};
	const totals = {
		cost: getRowTotal(
			modelRows,
			(row) => row.match.option.metrics.estimatedCost,
		),
		duration: getRowTotal(
			modelRows,
			(row) => row.match.option.timing.durationSeconds,
		),
		errors: getRowTotal(
			modelRows,
			(row) => row.match.option.metrics.errorCount,
		),
		files: getRowTotal(
			modelRows,
			(row) => row.match.option.metrics.editedFiles.length,
		),
		input: getRowTotal(
			modelRows,
			(row) => row.match.option.metrics.inputTokens,
		),
		output: getRowTotal(
			modelRows,
			(row) => row.match.option.metrics.outputTokens,
		),
		skills: getRowTotal(
			modelRows,
			(row) => row.match.option.metrics.skills.length,
		),
		tools: getRowTotal(modelRows, (row) => row.match.option.toolCallCount),
	};
	const scalarColumns: TurnTableColumn[] = [
		{
			appearance: "plain",
			getValues: (row) =>
				row.speaker === "member"
					? []
					: [
							{
								label: row.match.option.timing.startTime || "—",
								relativeMagnitude: undefined,
								title: row.match.option.timing.startTime
									? "Turn start time"
									: "Start time unavailable",
							},
						],
			key: "time",
			label: "Time",
			sortKey: "time",
			summary: undefined,
			widthClassName: "w-18",
		},
		{
			appearance: "plain",
			getValues: (row) => {
				if (row.speaker === "member") {
					return [];
				}
				const value = row.match.option.timing.durationLabel
					? {
							label: formatCompactTurnDuration(
								row.match.option.timing.durationLabel,
							),
							relativeMagnitude: getRelativeMagnitude(
								row.match.option.timing.durationSeconds,
								maximums.duration,
							),
							title: "Prompt to final assistant message",
						}
					: undefined;
				return value ? [value] : [];
			},
			key: "duration",
			label: "Duration",
			sortKey: "duration",
			summary:
				totals.duration === undefined
					? undefined
					: {
							label: formatTotalTurnDuration(totals.duration),
							title: `${totals.duration.toLocaleString()} total seconds`,
						},
			widthClassName: "w-16",
		},
		{
			appearance: "plain",
			getValues: (row) =>
				row.speaker === "member"
					? []
					: [
							{
								label:
									row.match.option.metrics.inputTokens === undefined
										? "—"
										: formatCompactTurnTokens(
												row.match.option.metrics.inputTokens,
											),
								relativeMagnitude: getRelativeMagnitude(
									row.match.option.metrics.inputTokens,
									maximums.input,
								),
								title:
									row.match.option.metrics.inputTokens === undefined
										? "Input tokens unavailable"
										: `${row.match.option.metrics.inputTokens.toLocaleString()} input tokens`,
							},
						],
			key: "input",
			label: "Input",
			sortKey: "input",
			summary:
				totals.input === undefined
					? undefined
					: {
							label: formatCompactTurnTokens(totals.input),
							title: `${totals.input.toLocaleString()} total input tokens`,
						},
			widthClassName: "w-16",
		},
		{
			appearance: "plain",
			getValues: (row) =>
				row.speaker === "member"
					? []
					: [
							{
								label:
									row.match.option.metrics.outputTokens === undefined
										? "—"
										: formatCompactTurnTokens(
												row.match.option.metrics.outputTokens,
											),
								relativeMagnitude: getRelativeMagnitude(
									row.match.option.metrics.outputTokens,
									maximums.output,
								),
								title:
									row.match.option.metrics.outputTokens === undefined
										? "Output tokens unavailable"
										: `${row.match.option.metrics.outputTokens.toLocaleString()} output tokens`,
							},
						],
			key: "output",
			label: "Output",
			sortKey: "output",
			summary:
				totals.output === undefined
					? undefined
					: {
							label: formatCompactTurnTokens(totals.output),
							title: `${totals.output.toLocaleString()} total output tokens`,
						},
			widthClassName: "w-16",
		},
		{
			appearance: "plain",
			getValues: (row) =>
				row.speaker === "member"
					? []
					: [
							{
								label:
									row.match.option.metrics.estimatedCost === undefined
										? "—"
										: formatTurnCost(row.match.option.metrics.estimatedCost),
								relativeMagnitude: getRelativeMagnitude(
									row.match.option.metrics.estimatedCost,
									maximums.cost,
								),
								title:
									row.match.option.metrics.estimatedCost === undefined
										? "Estimated turn cost unavailable"
										: "Estimated turn cost",
							},
						],
			key: "cost",
			label: "Cost",
			sortKey: "cost",
			summary:
				totals.cost === undefined
					? undefined
					: {
							label: formatTurnCost(totals.cost),
							title: "Total estimated cost",
						},
			widthClassName: "w-24",
		},
		{
			appearance: "plain",
			getValues: (row) => {
				if (row.speaker === "member" || row.match.option.toolCallCount === 0) {
					return [];
				}
				return [
					{
						label: String(row.match.option.toolCallCount),
						relativeMagnitude: undefined,
						title: undefined,
					},
				];
			},
			key: "tools",
			label: "Tools",
			sortKey: "tools",
			summary:
				totals.tools === undefined
					? undefined
					: {
							label: totals.tools.toLocaleString(),
							title: "Total tool calls",
						},
			widthClassName: "w-12",
		},
		{
			appearance: "plain",
			getValues: (row) => {
				if (
					row.speaker === "member" ||
					row.match.option.metrics.errorCount === 0
				) {
					return [];
				}
				return [
					{
						label: String(row.match.option.metrics.errorCount),
						relativeMagnitude: undefined,
						title: undefined,
					},
				];
			},
			key: "errors",
			label: "Errors",
			sortKey: "errors",
			summary:
				totals.errors === undefined
					? undefined
					: {
							label: totals.errors.toLocaleString(),
							title: "Total errors",
						},
			widthClassName: "w-12",
		},
		{
			appearance: "plain",
			getValues: (row) =>
				row.speaker === "member"
					? []
					: [
							{
								label: String(row.match.option.metrics.editedFiles.length),
								relativeMagnitude: undefined,
								title: undefined,
							},
						],
			key: "files",
			label: "Files",
			sortKey: "files",
			summary:
				totals.files === undefined
					? undefined
					: {
							label: totals.files.toLocaleString(),
							title: "Total edited files across turns",
						},
			widthClassName: "w-12",
		},
		{
			appearance: "plain",
			getValues: (row) =>
				row.speaker === "member"
					? []
					: [
							{
								label: String(row.match.option.metrics.skills.length),
								relativeMagnitude: undefined,
								title: undefined,
							},
						],
			key: "skills",
			label: "Skills",
			sortKey: "skills",
			summary:
				totals.skills === undefined
					? undefined
					: {
							label: totals.skills.toLocaleString(),
							title: "Total skills across turns",
						},
			widthClassName: "w-12",
		},
	];
	const commandColumns = buildIndexedColumns({
		count: maxCommands,
		getValue: (option, index) => {
			const command = option.slashCommands[index];
			return command
				? {
						label: command.startsWith("/") ? command : `/${command}`,
						relativeMagnitude: undefined,
						title: "Slash command",
					}
				: undefined;
		},
		key: "command",
		label: "Command",
		sortKey: "commands",
		widthClassName: "w-20",
	});

	return [...scalarColumns, ...commandColumns];
}
