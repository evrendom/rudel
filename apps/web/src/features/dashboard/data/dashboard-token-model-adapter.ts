import type { ModelTokensTrendData } from "@rudel/api-routes";

export type DashboardTokenModelSummaryRow = {
	estimatedCost: number | null;
	id: string;
	inputTokens: number;
	isCostPartial: boolean;
	label: string;
	outputTokens: number;
	totalTokens: number;
};

export type DashboardTokenModelChartDatum = {
	estimatedCost: number | null;
	id: string;
	inputTokens: number;
	isCostPartial: boolean;
	label: string;
	outputTokens: number;
	shortLabel: string;
	value: number;
};

const MAX_VISIBLE_MODEL_BARS = 20;

function formatModelAxisLabel(model: string) {
	const trimmedLabel = model.trim();

	if (trimmedLabel.length === 0) {
		return "Unknown";
	}

	const withoutDateSuffix = trimmedLabel.replace(/-\d{8}$/u, "");

	if (withoutDateSuffix.startsWith("claude-")) {
		return withoutDateSuffix.replace(/^claude-/u, "");
	}

	return withoutDateSuffix;
}

export function buildDashboardTokenModelRows(
	modelTokensTrend: ModelTokensTrendData[] | undefined,
): DashboardTokenModelSummaryRow[] {
	const rowsByModel = new Map<
		string,
		{
			hasKnownCost: boolean;
			inputTokens: number;
			isCostPartial: boolean;
			knownCost: number;
			outputTokens: number;
			totalTokens: number;
		}
	>();

	for (const row of modelTokensTrend ?? []) {
		const currentRow = rowsByModel.get(row.model) ?? {
			hasKnownCost: false,
			inputTokens: 0,
			isCostPartial: false,
			knownCost: 0,
			outputTokens: 0,
			totalTokens: 0,
		};

		if (row.estimated_cost == null) {
			currentRow.isCostPartial = true;
		} else {
			currentRow.hasKnownCost = true;
			currentRow.knownCost += row.estimated_cost;
		}
		currentRow.inputTokens += row.input_tokens;
		currentRow.outputTokens += row.output_tokens;
		currentRow.totalTokens += row.total_tokens;

		rowsByModel.set(row.model, currentRow);
	}

	return Array.from(rowsByModel.entries())
		.map(([model, row]) => ({
			estimatedCost: row.hasKnownCost ? row.knownCost : null,
			id: model,
			inputTokens: row.inputTokens,
			isCostPartial: row.hasKnownCost && row.isCostPartial,
			label: model,
			outputTokens: row.outputTokens,
			totalTokens: row.totalTokens,
		}))
		.sort(
			(left, right) =>
				right.totalTokens - left.totalTokens ||
				right.inputTokens - left.inputTokens ||
				left.label.localeCompare(right.label),
		);
}

export function buildDashboardTokenModelChartData(
	rows: DashboardTokenModelSummaryRow[],
): DashboardTokenModelChartDatum[] {
	return rows.slice(0, MAX_VISIBLE_MODEL_BARS).map((row) => ({
		estimatedCost: row.estimatedCost,
		id: row.id,
		inputTokens: row.inputTokens,
		isCostPartial: row.isCostPartial,
		label: row.label,
		outputTokens: row.outputTokens,
		shortLabel: formatModelAxisLabel(row.label),
		value: row.totalTokens,
	}));
}
