import type { ModelTokensTrendData } from "@rudel/api-routes";

export type DashboardTokenModelSummaryRow = {
	estimatedCost: number | null;
	id: string;
	inputTokens: number;
	label: string;
	outputTokens: number;
	totalTokens: number;
};

export type DashboardTokenModelChartDatum = {
	estimatedCost: number | null;
	id: string;
	inputTokens: number;
	label: string;
	outputTokens: number;
	shortLabel: string;
	value: number;
};

export type DashboardPricingCoverage = {
	dailyUnresolvedModels: readonly {
		date: string;
		model: string;
		unpricedTokens: number;
	}[];
	pricedTokenPercent: number | null;
	totalTokens: number;
	unpricedModelCount: number;
	unpricedTokens: number;
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
			estimatedCost: number | null;
			inputTokens: number;
			outputTokens: number;
			totalTokens: number;
		}
	>();

	for (const row of modelTokensTrend ?? []) {
		const currentRow = rowsByModel.get(row.model) ?? {
			estimatedCost: 0,
			inputTokens: 0,
			outputTokens: 0,
			totalTokens: 0,
		};

		currentRow.estimatedCost =
			currentRow.estimatedCost === null ||
			row.estimated_cost === null ||
			row.unpriced_session_count > 0
				? null
				: currentRow.estimatedCost + row.estimated_cost;
		currentRow.inputTokens += row.input_tokens;
		currentRow.outputTokens += row.output_tokens;
		currentRow.totalTokens += row.total_tokens;

		rowsByModel.set(row.model, currentRow);
	}

	return Array.from(rowsByModel.entries())
		.map(([model, row]) => ({
			estimatedCost: row.estimatedCost,
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

export function buildDashboardPricingCoverage(
	modelTokensTrend: ModelTokensTrendData[] | undefined,
): DashboardPricingCoverage {
	let totalTokens = 0;
	let unpricedTokens = 0;
	const unresolvedModels = new Set<string>();
	const dailyUnresolvedModels: {
		date: string;
		model: string;
		unpricedTokens: number;
	}[] = [];

	for (const row of modelTokensTrend ?? []) {
		const safeTotalTokens = Math.max(0, row.total_tokens);
		const safeUnpricedTokens = Math.min(
			safeTotalTokens,
			Math.max(0, row.unpriced_token_count),
		);
		totalTokens += safeTotalTokens;
		unpricedTokens += safeUnpricedTokens;

		if (safeUnpricedTokens > 0) {
			unresolvedModels.add(row.model);
			dailyUnresolvedModels.push({
				date: row.date,
				model: row.model,
				unpricedTokens: safeUnpricedTokens,
			});
		}
	}

	return {
		dailyUnresolvedModels: dailyUnresolvedModels.sort(
			(left, right) =>
				right.unpricedTokens - left.unpricedTokens ||
				left.date.localeCompare(right.date) ||
				left.model.localeCompare(right.model),
		),
		pricedTokenPercent:
			totalTokens > 0
				? Math.round(((totalTokens - unpricedTokens) / totalTokens) * 1000) / 10
				: null,
		totalTokens,
		unpricedModelCount: unresolvedModels.size,
		unpricedTokens,
	};
}

export function buildDashboardTokenModelChartData(
	rows: DashboardTokenModelSummaryRow[],
): DashboardTokenModelChartDatum[] {
	return rows.slice(0, MAX_VISIBLE_MODEL_BARS).map((row) => ({
		estimatedCost: row.estimatedCost,
		id: row.id,
		inputTokens: row.inputTokens,
		label: row.label,
		outputTokens: row.outputTokens,
		shortLabel: formatModelAxisLabel(row.label),
		value: row.totalTokens,
	}));
}
