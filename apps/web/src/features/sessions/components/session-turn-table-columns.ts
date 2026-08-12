import type {
	SessionTurnTableOption,
	SessionTurnTableRow,
} from "./session-turn-table";
import type { SessionTurnTableSortKey } from "./session-turn-table-filters";
import type { SessionTurnTableView } from "./session-turn-table-view-tabs";

type TurnTableValue = {
	label: string;
	title: string | undefined;
};

export type TurnTableColumn = {
	appearance: "plain" | "tag";
	getValues: (row: SessionTurnTableRow) => readonly TurnTableValue[];
	key: string;
	label: string;
	sortKey: SessionTurnTableSortKey | undefined;
	widthClassName: string;
};

const turnCostFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	style: "currency",
});

function formatCompactTurnTokens(value: number) {
	if (value < 1_000) {
		return Math.round(value).toLocaleString();
	}

	if (value < 1_000_000) {
		return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`;
	}

	return `${(value / 1_000_000).toFixed(value < 10_000_000 ? 1 : 0)}m`;
}

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
		widthClassName,
	}));
}

export function buildSessionTurnTableColumns(
	options: readonly SessionTurnTableOption[],
	tableView: SessionTurnTableView,
): TurnTableColumn[] {
	if (tableView === "member") {
		return [
			{
				appearance: "plain",
				getValues: (row) =>
					row.characterCount === undefined
						? []
						: [
								{
									label: row.characterCount.toLocaleString(),
									title: `${row.characterCount.toLocaleString()} characters`,
								},
							],
				key: "characters",
				label: "Characters",
				sortKey: undefined,
				widthClassName: "w-28",
			},
			{
				appearance: "plain",
				getValues: () => [],
				key: "negative-signals",
				label: "Negative signals",
				sortKey: undefined,
				widthClassName: "w-32",
			},
		];
	}

	const maxCommands = Math.max(
		0,
		...options.map((option) => option.slashCommands.length),
	);
	const scalarColumns: TurnTableColumn[] = [
		{
			appearance: "plain",
			getValues: (row) =>
				row.speaker === "member"
					? []
					: [
							{
								label: row.match.option.timing.startTime || "—",
								title: row.match.option.timing.startTime
									? "Turn start time"
									: "Start time unavailable",
							},
						],
			key: "time",
			label: "Time",
			sortKey: "time",
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
							label: `+${row.match.option.timing.durationLabel}`,
							title: "Prompt to final assistant message",
						}
					: undefined;
				return value ? [value] : [];
			},
			key: "duration",
			label: "Duration",
			sortKey: "duration",
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
								title:
									row.match.option.metrics.inputTokens === undefined
										? "Input tokens unavailable"
										: `${row.match.option.metrics.inputTokens.toLocaleString()} input tokens`,
							},
						],
			key: "input",
			label: "Input",
			sortKey: "input",
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
								title:
									row.match.option.metrics.outputTokens === undefined
										? "Output tokens unavailable"
										: `${row.match.option.metrics.outputTokens.toLocaleString()} output tokens`,
							},
						],
			key: "output",
			label: "Output",
			sortKey: "output",
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
										: turnCostFormatter.format(
												row.match.option.metrics.estimatedCost,
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
			widthClassName: "w-16",
		},
		{
			appearance: "plain",
			getValues: (row) => {
				if (row.speaker === "member" || row.match.option.toolCallCount === 0) {
					return [];
				}
				return [
					{ label: String(row.match.option.toolCallCount), title: undefined },
				];
			},
			key: "tools",
			label: "Tools",
			sortKey: "tools",
			widthClassName: "w-14",
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
						title: undefined,
					},
				];
			},
			key: "errors",
			label: "Errors",
			sortKey: "errors",
			widthClassName: "w-14",
		},
		{
			appearance: "plain",
			getValues: (row) =>
				row.speaker === "member"
					? []
					: [
							{
								label: String(row.match.option.metrics.editedFiles.length),
								title: undefined,
							},
						],
			key: "files",
			label: "Files",
			sortKey: "files",
			widthClassName: "w-14",
		},
		{
			appearance: "plain",
			getValues: (row) =>
				row.speaker === "member"
					? []
					: [
							{
								label: String(row.match.option.metrics.skills.length),
								title: undefined,
							},
						],
			key: "skills",
			label: "Skills",
			sortKey: "skills",
			widthClassName: "w-14",
		},
	];
	const commandColumns = buildIndexedColumns({
		count: maxCommands,
		getValue: (option, index) => {
			const command = option.slashCommands[index];
			return command
				? {
						label: command.startsWith("/") ? command : `/${command}`,
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
