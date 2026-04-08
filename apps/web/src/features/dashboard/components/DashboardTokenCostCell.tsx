import { DashboardCellStack } from "@/features/dashboard/components/DashboardGridTable";
import { calculateCost, formatWholeCurrency } from "@/lib/format";

function formatCostSplit(
	inputTokens: number,
	outputTokens: number,
	model?: string | null,
) {
	if (inputTokens <= 0 && outputTokens <= 0) {
		return "—";
	}

	const inputCost = calculateCost(inputTokens, 0, model);
	const outputCost = calculateCost(0, outputTokens, model);
	const totalCost = inputCost + outputCost;

	if (totalCost <= 0) {
		return "—";
	}

	const inputPercent = Math.round((inputCost / totalCost) * 100);
	const outputPercent = Math.max(100 - inputPercent, 0);

	return `${inputPercent}% IN / ${outputPercent}% OUT`;
}

export function DashboardTokenCostCell({
	cost,
	inputTokens,
	outputTokens,
	model,
}: {
	cost?: number;
	inputTokens: number;
	outputTokens: number;
	model?: string | null;
}) {
	const resolvedCost = cost ?? calculateCost(inputTokens, outputTokens, model);

	return (
		<DashboardCellStack
			primary={formatWholeCurrency(resolvedCost)}
			secondary={formatCostSplit(inputTokens, outputTokens, model)}
			primaryClassName="font-medium tabular-nums"
			secondaryClassName="font-medium tabular-nums uppercase tracking-[0.02em]"
		/>
	);
}
