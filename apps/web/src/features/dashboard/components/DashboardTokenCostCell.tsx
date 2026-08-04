import { DashboardCellStack } from "@/features/dashboard/components/DashboardGridTable";
import { formatCurrency, formatWholeCurrency } from "@/lib/format";

function formatCostSplit(inputTokens: number, outputTokens: number) {
	if (inputTokens <= 0 && outputTokens <= 0) {
		return "—";
	}

	const totalTokens = inputTokens + outputTokens;
	const inputPercent = Math.round((inputTokens / totalTokens) * 100);
	const outputPercent = Math.max(100 - inputPercent, 0);

	return `${inputPercent}% IN / ${outputPercent}% OUT`;
}

export function DashboardTokenCostCell({
	cost,
	inputTokens,
	isCostPartial = false,
	outputTokens,
	showDetailedCost = true,
}: {
	at: string | undefined;
	cost: number | null | undefined;
	inputTokens: number;
	isCostPartial?: boolean;
	outputTokens: number;
	model: string | null | undefined;
	showDetailedCost?: boolean;
}) {
	const resolvedCost = cost ?? null;

	return (
		<DashboardCellStack
			primary={
				resolvedCost === null
					? "—"
					: `${isCostPartial ? "≥ " : ""}${
							showDetailedCost
								? formatCurrency(resolvedCost)
								: formatWholeCurrency(resolvedCost)
						}`
			}
			secondary={formatCostSplit(inputTokens, outputTokens)}
			primaryClassName="font-medium tabular-nums"
			secondaryClassName="font-medium tabular-nums uppercase tracking-[0.02em]"
		/>
	);
}
