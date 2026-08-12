export const SESSION_DETAIL_EXPERIMENT_TABS = [
	{ label: "Turn table", value: "turn-table" },
	{ label: "Conversation", value: "conversation" },
	{ label: "JSONL", value: "jsonl" },
] as const;

export type SessionDetailExperimentTab =
	(typeof SESSION_DETAIL_EXPERIMENT_TABS)[number]["value"];

export function isSessionDetailExperimentTab(
	value: unknown,
): value is SessionDetailExperimentTab {
	return SESSION_DETAIL_EXPERIMENT_TABS.some((tab) => tab.value === value);
}

export type SessionJsonlPresentation = {
	formattedContent: string;
	recordCount: number;
};

function formatJsonlRecord(record: string) {
	try {
		const value: unknown = JSON.parse(record);
		return JSON.stringify(value, null, 2) ?? record;
	} catch {
		return record;
	}
}

export function buildSessionJsonlPresentation(
	content: string,
): SessionJsonlPresentation {
	const formattedRecords = content
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map(formatJsonlRecord);

	return {
		formattedContent: formattedRecords.join("\n\n"),
		recordCount: formattedRecords.length,
	};
}
