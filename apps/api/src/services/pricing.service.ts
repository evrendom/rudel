export const INPUT_PRICE_PER_MILLION = 3.0;
export const OUTPUT_PRICE_PER_MILLION = 15.0;
export const ESTIMATED_PRICING_MODE = "estimated_flat_tokens_v1" as const;

export function calculateEstimatedCost(
	inputTokens: number,
	outputTokens: number,
	precision = 4,
) {
	const cost =
		(inputTokens / 1_000_000) * INPUT_PRICE_PER_MILLION +
		(outputTokens / 1_000_000) * OUTPUT_PRICE_PER_MILLION;

	return Number(cost.toFixed(precision));
}

export function buildEstimatedCostSql({
	inputExpr,
	outputExpr,
	precision,
}: {
	inputExpr: string;
	outputExpr: string;
	precision?: number;
}) {
	const expression = `((${outputExpr}) / 1000000.0) * ${OUTPUT_PRICE_PER_MILLION} + ((${inputExpr}) / 1000000.0) * ${INPUT_PRICE_PER_MILLION}`;

	if (typeof precision === "number") {
		return `round(${expression}, ${precision})`;
	}

	return expression;
}
