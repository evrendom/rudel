import type { SessionTurnTableOption } from "./session-turn-table";

export type SessionThreadSegment =
	| { dimmed: boolean; index: number; type: "turn" }
	| { indices: readonly number[]; key: string; type: "hidden" };

export function buildSessionThreadSegments(
	optionCount: number,
	matchedIndices: ReadonlySet<number> | undefined,
	expandedHiddenKeys: ReadonlySet<string>,
) {
	if (!matchedIndices) {
		return Array.from(
			{ length: optionCount },
			(_, index): SessionThreadSegment => ({
				dimmed: false,
				index,
				type: "turn",
			}),
		);
	}

	const segments: SessionThreadSegment[] = [];
	let hiddenIndices: number[] = [];

	function flushHidden() {
		if (hiddenIndices.length === 0) {
			return;
		}

		const key = `hidden-${hiddenIndices[0]}-${hiddenIndices.at(-1)}`;
		if (expandedHiddenKeys.has(key)) {
			segments.push(
				...hiddenIndices.map(
					(index): SessionThreadSegment => ({
						dimmed: true,
						index,
						type: "turn",
					}),
				),
			);
		} else {
			segments.push({ indices: hiddenIndices, key, type: "hidden" });
		}
		hiddenIndices = [];
	}

	for (let index = 0; index < optionCount; index += 1) {
		if (matchedIndices.has(index)) {
			flushHidden();
			segments.push({ dimmed: false, index, type: "turn" });
		} else {
			hiddenIndices.push(index);
		}
	}
	flushHidden();

	return segments;
}

const summaryCostFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	style: "currency",
});

export function summarizeHiddenTurns(
	indices: readonly number[],
	options: readonly SessionTurnTableOption[],
) {
	const hiddenOptions = indices.flatMap((index) => {
		const option = options[index];
		return option ? [option] : [];
	});
	const costs = hiddenOptions.flatMap((option) =>
		option.metrics.estimatedCost === undefined
			? []
			: [option.metrics.estimatedCost],
	);
	const durationSeconds = hiddenOptions.reduce(
		(total, option) => total + (option.timing.durationSeconds ?? 0),
		0,
	);
	const durationLabel =
		durationSeconds >= 3_600
			? `${Math.round(durationSeconds / 3_600)}h`
			: `${Math.round(durationSeconds / 60)}m`;
	const costLabel =
		costs.length === 0
			? "$—"
			: summaryCostFormatter.format(
					costs.reduce((total, cost) => total + cost, 0),
				);

	return `${indices.length.toLocaleString()} turns hidden · ${costLabel} · ${durationLabel}`;
}
