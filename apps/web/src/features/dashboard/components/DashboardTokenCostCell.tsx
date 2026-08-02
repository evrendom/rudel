import { DashboardCellStack } from "@/features/dashboard/components/DashboardGridTable";
import {
	calculateCost,
	formatCurrency,
	formatWholeCurrency,
} from "@/lib/format";

function formatCostSplit(
	inputTokens: number,
	outputTokens: number,
	model: string | null | undefined,
	at: string | undefined,
) {
	if (
		(inputTokens <= 0 && outputTokens <= 0) ||
		at === undefined ||
		model == null
	) {
		return "—";
	}

	const inputCost = calculateCost(inputTokens, 0, { at, model });
	const outputCost = calculateCost(0, outputTokens, { at, model });
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
	at: string | undefined;
	cost: number | null | undefined;
	inputTokens: number;
	outputTokens: number;
	model: string | null | undefined;
	showDetailedCost?: boolean;
}) {
	const resolvedCost =
		cost === undefined && at !== undefined && model != null
			? calculateCost(inputTokens, outputTokens, { at, model })
			: (cost ?? null);

	return (
		<DashboardCellStack
			primary={
				resolvedCost === null
					? "—"
					: showDetailedCost
						? formatCurrency(resolvedCost)
						: formatWholeCurrency(resolvedCost)
			}
			secondary={formatCostSplit(inputTokens, outputTokens, model, at)}
			primaryClassName="font-medium tabular-nums"
			secondaryClassName="font-medium tabular-nums uppercase tracking-[0.02em]"
		/>
	);
}
