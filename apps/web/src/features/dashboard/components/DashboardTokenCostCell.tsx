import { DashboardCellStack } from "@/features/dashboard/components/DashboardGridTable";
import { calculateCost, formatWholeCurrency } from "@/lib/format";

function formatCostSplit(inputTokens: number, outputTokens: number) {
	if (inputTokens <= 0 && outputTokens <= 0) {
		return "—";
	}

	const inputCost = calculateCost(inputTokens, 0);
	const outputCost = calculateCost(0, outputTokens);
	const totalCost = inputCost + outputCost;

	if (totalCost <= 0) {
		return "—";
	}

	const inputPercent = Math.round((inputCost / totalCost) * 100);
	const outputPercent = Math.max(100 - inputPercent, 0);

	return `${inputPercent}% IN / ${outputPercent}% OUT`;
}

export function DashboardTokenCostCell({
	inputTokens,
	outputTokens,
}: {
	inputTokens: number;
	outputTokens: number;
}) {
	return (
		<DashboardCellStack
			primary={formatWholeCurrency(calculateCost(inputTokens, outputTokens))}
			secondary={formatCostSplit(inputTokens, outputTokens)}
			primaryClassName="font-medium tabular-nums"
			secondaryClassName="font-medium tabular-nums uppercase tracking-[0.02em]"
		/>
	);
}
