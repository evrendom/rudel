import type { ModelTokensTrendData } from "@rudel/api-routes";
import { calculateCost } from "@/lib/format";

export type DashboardTokenModelSummaryRow = {
	estimatedCost: number;
	id: string;
	inputTokens: number;
	label: string;
	outputTokens: number;
	totalTokens: number;
};

export type DashboardTokenModelChartDatum = {
	id: string;
	label: string;
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
			inputTokens: number;
			outputTokens: number;
			totalTokens: number;
		}
	>();

	for (const row of modelTokensTrend ?? []) {
		const currentRow = rowsByModel.get(row.model) ?? {
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
		};

		currentRow.inputTokens += row.input_tokens;
		currentRow.outputTokens += row.output_tokens;
		currentRow.totalTokens += row.total_tokens;

		rowsByModel.set(row.model, currentRow);
	}

	return Array.from(rowsByModel.entries())
		.map(([model, row]) => ({
			estimatedCost: calculateCost(row.inputTokens, row.outputTokens, model),
			id: model,
			inputTokens: row.inputTokens,
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
		id: row.id,
		label: row.label,
		shortLabel: formatModelAxisLabel(row.label),
		value: row.totalTokens,
	}));
}
