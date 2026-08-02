import { DashboardCellStack } from "@/features/dashboard/components/DashboardGridTable";
import { formatCurrency, formatWholeCurrency } from "@/lib/format";

export function DashboardTokenCostCell({
	cost,
	showDetailedCost = true,
}: {
	cost: number | null | undefined;
	showDetailedCost?: boolean;
}) {
	return (
		<DashboardCellStack
			primary={
				cost == null
					? "—"
					: showDetailedCost
						? formatCurrency(cost)
						: formatWholeCurrency(cost)
			}
			primaryClassName="font-medium tabular-nums"
		/>
	);
}
