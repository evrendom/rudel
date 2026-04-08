import { useChartTheme } from "@/hooks/useChartTheme";

interface ChartTooltipProps {
	active?: boolean;
	// biome-ignore lint/suspicious/noExplicitAny: recharts payload type is complex and varies by chart
	payload?: ReadonlyArray<any>;
	label?: string | number;
	nameFormatter?: (name: string) => string;
	sortItems?: boolean;
	valueFormatter?: (value: number, name: string) => string;
	showTotal?: boolean;
}

export function ChartTooltip({
	active,
	payload,
	label,
	nameFormatter,
	sortItems = false,
	valueFormatter,
	showTotal = true,
}: ChartTooltipProps) {
	const { tooltipBg, tooltipBorder } = useChartTheme();

	if (!active || !payload || payload.length === 0) return null;

	const visibleItems = payload.filter((item) => item.value !== 0);
	if (visibleItems.length === 0) return null;
	const sortedItems = sortItems
		? [...visibleItems].sort(
				(left, right) =>
					Number(right.value ?? 0) - Number(left.value ?? 0) ||
					String(left.name).localeCompare(String(right.name)),
			)
		: visibleItems;

	const total = visibleItems.reduce((sum, item) => sum + item.value, 0);

	const formatValue = (value: number, name: string): string => {
		if (valueFormatter) return valueFormatter(value, name);
		return value.toLocaleString();
	};

	return (
		<div
			className="rounded-lg shadow-lg p-3 min-w-[180px]"
			style={{
				backgroundColor: tooltipBg,
				border: `1px solid ${tooltipBorder}`,
			}}
		>
			{label && (
				<div className="text-xs font-semibold text-foreground mb-2">
					{label}
				</div>
			)}
			<div className="space-y-0.5">
				{sortedItems.map((item) => {
					const displayName = nameFormatter
						? nameFormatter(item.name)
						: item.name;
					return (
						<div key={item.name} className="flex items-center gap-2 py-0.5">
							<div
								className="w-2 h-2 rounded-full flex-shrink-0"
								style={{ backgroundColor: item.color ?? item.fill }}
							/>
							<span className="text-xs text-foreground flex-1">
								{displayName}
							</span>
							<span className="text-xs font-semibold text-foreground">
								{formatValue(item.value, item.name)}
							</span>
						</div>
					);
				})}
			</div>
			{showTotal && visibleItems.length > 1 && (
				<div className="pt-1.5 mt-1.5 border-t border-border flex justify-between text-xs font-semibold text-foreground">
					<span>Total</span>
					<span>{formatValue(total, "total")}</span>
				</div>
			)}
		</div>
	);
}
