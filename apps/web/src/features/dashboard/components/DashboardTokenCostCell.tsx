import { DashboardCellStack } from "@/features/dashboard/components/DashboardGridTable";
import {
	calculateCost,
	formatCurrency,
	formatWholeCurrency,
} from "@/lib/format";

function formatCostSplit(
	inputTokens: number,
	outputTokens: number,
	model?: string | null,
	at?: string,
) {
	if (inputTokens <= 0 && outputTokens <= 0) {
		return "—";
	}

	const pricingOptions = at === undefined ? model : { at, model };
	const inputCost = calculateCost(inputTokens, 0, pricingOptions);
	const outputCost = calculateCost(0, outputTokens, pricingOptions);
	const totalCost = inputCost + outputCost;

	if (totalCost <= 0) {
		return "—";
	}

	const inputPercent = Math.round((inputCost / totalCost) * 100);
	const outputPercent = Math.max(100 - inputPercent, 0);

	return `${inputPercent}% IN / ${outputPercent}% OUT`;
}

export function DashboardTokenCostCell({
	at,
	cost,
	inputTokens,
	outputTokens,
	model,
	showDetailedCost = true,
}: {
	at?: string;
	cost?: number;
	inputTokens: number;
	outputTokens: number;
	model?: string | null;
	showDetailedCost?: boolean;
}) {
	const pricingOptions = at === undefined ? model : { at, model };
	const resolvedCost =
		cost ?? calculateCost(inputTokens, outputTokens, pricingOptions);

	return (
		<DashboardCellStack
			primary={
				showDetailedCost
					? formatCurrency(resolvedCost)
					: formatWholeCurrency(resolvedCost)
			}
			secondary={formatCostSplit(inputTokens, outputTokens, model, at)}
			primaryClassName="font-medium tabular-nums"
			secondaryClassName="font-medium tabular-nums uppercase tracking-[0.02em]"
		/>
	);
}
