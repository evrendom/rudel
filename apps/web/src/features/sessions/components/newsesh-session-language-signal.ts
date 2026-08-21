export interface NewseshLanguageSignal {
	readonly category: "apology" | "positive" | "swear";
	readonly count: number;
	readonly label: string;
	readonly speaker: "member" | "model";
}

type LanguageSignalCountSource = {
	readonly [key: `${string}_${"swears" | "apologies" | "positive"}`]: number;
};

const NEWSHESH_LANGUAGE_SIGNAL_ORDER: ReadonlyArray<{
	category: NewseshLanguageSignal["category"];
	countKey:
		| "member_swears"
		| "member_apologies"
		| "member_positive"
		| "model_swears"
		| "model_apologies"
		| "model_positive";
	label: string;
	speaker: NewseshLanguageSignal["speaker"];
}> = [
	{
		category: "swear",
		countKey: "member_swears",
		label: "you swore",
		speaker: "member",
	},
	{
		category: "apology",
		countKey: "member_apologies",
		label: "you apologized",
		speaker: "member",
	},
	{
		category: "positive",
		countKey: "member_positive",
		label: "you praised",
		speaker: "member",
	},
	{
		category: "swear",
		countKey: "model_swears",
		label: "model swore",
		speaker: "model",
	},
	{
		category: "apology",
		countKey: "model_apologies",
		label: "model apologized",
		speaker: "model",
	},
	{
		category: "positive",
		countKey: "model_positive",
		label: "model praised",
		speaker: "model",
	},
];

export function getNewseshLanguageSignals(
	session: LanguageSignalCountSource,
): NewseshLanguageSignal[] {
	return NEWSHESH_LANGUAGE_SIGNAL_ORDER.map((signal, order) => ({
		category: signal.category,
		count: session[signal.countKey],
		label: signal.label,
		order,
		speaker: signal.speaker,
	}))
		.filter((signal) => signal.count > 0)
		.sort((left, right) => right.count - left.count || left.order - right.order)
		.map(({ order: _order, ...signal }) => signal);
}

export function getNewseshLanguageSignalCategoryLabel(
	signal: NewseshLanguageSignal,
) {
	return `${signal.speaker} ${
		signal.category === "swear" ? "swearing" : signal.category
	}`;
}

export function getNewseshLanguageSignalTagLabel(
	signal: NewseshLanguageSignal,
) {
	return signal.count === 1
		? signal.label
		: `${signal.label} +${signal.count - 1}`;
}
