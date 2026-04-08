import { format, parseISO } from "date-fns";
import { DashboardCellStack } from "@/features/dashboard/components/DashboardGridTable";
import type { DashboardTokenDailyPoint } from "@/features/dashboard/data/dashboard-tab-adapters";
import {
	calculateCost,
	formatCompactNumber,
	formatCurrency,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type DashboardTokenDailyOverviewRow = {
	avgTokensPerSession: number | null;
	dateLabel: string;
	dayLabel: string;
	id: string;
	inputTokens: number;
	outputTokens: number;
	sessions: number;
	totalTokens: number;
};

const MAX_DAILY_ROWS = 10;

function formatTokenMix(point: DashboardTokenDailyOverviewRow) {
	if (point.totalTokens <= 0) {
		return "—";
	}

	const inputPercent = Math.round(
		(point.inputTokens / point.totalTokens) * 100,
	);
	return `${inputPercent} IN / ${100 - inputPercent} OUT`;
}

function buildTokenRows(
	data: DashboardTokenDailyPoint[],
): DashboardTokenDailyOverviewRow[] {
	return data
		.slice(-MAX_DAILY_ROWS)
		.reverse()
		.map((point) => {
			const parsedDate = parseISO(point.date);
			const safeDateLabel = Number.isNaN(parsedDate.getTime())
				? point.date
				: format(parsedDate, "MMM d");
			const safeDayLabel = Number.isNaN(parsedDate.getTime())
				? point.axisLabel
				: format(parsedDate, "EEEE");

			return {
				avgTokensPerSession: point.avgTokensPerSession,
				dateLabel: safeDateLabel,
				dayLabel: safeDayLabel,
				id: point.date,
				inputTokens: point.inputTokens,
				outputTokens: point.outputTokens,
				sessions: point.sessions,
				totalTokens: point.totalTokens,
			};
		});
}

export function DashboardTokenDailyOverviewTable({
	data,
	highlightedDate,
	highlightSource,
	onHighlightDateChange,
}: {
	data: DashboardTokenDailyPoint[];
	highlightedDate?: string | null;
	highlightSource?: "chart" | "table" | null;
	onHighlightDateChange?: (date: string | null) => void;
}) {
	const rows = buildTokenRows(data);
	const hasTableHighlight =
		highlightSource === "table" && highlightedDate != null;
	const hasChartHighlight =
		highlightSource === "chart" && highlightedDate != null;

	return (
		<div className="overflow-x-auto">
			<div className="min-w-[60rem]">
				<div className="grid grid-cols-[minmax(180px,1.2fr)_90px_minmax(180px,1.05fr)_130px_120px] gap-6 px-3.5 text-[13px] font-semibold text-[color:var(--dashboardy-muted)]">
					<p>Day</p>
					<p>Sessions</p>
					<p>Tokens</p>
					<p>Avg / session</p>
					<p>Cost</p>
				</div>
				<div className="grid gap-0">
					{rows.map((row) => {
						const isHighlighted = highlightedDate === row.id;
						const cost = calculateCost(row.inputTokens, row.outputTokens);

						return (
							<button
								key={row.id}
								type="button"
								className={cn(
									"grid min-h-12 w-full grid-cols-[minmax(180px,1.2fr)_90px_minmax(180px,1.05fr)_130px_120px] items-center gap-6 rounded-lg px-3.5 py-2 text-left text-sm transition-colors duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
									!hasTableHighlight &&
										"odd:bg-[color:var(--dashboardy-subsurface-strong)]",
									hasTableHighlight &&
										"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
									hasChartHighlight &&
										isHighlighted &&
										"bg-[color:var(--dashboardy-surface)] odd:bg-[color:var(--dashboardy-surface)]",
									hasTableHighlight &&
										isHighlighted &&
										"bg-[color:var(--dashboardy-subsurface-strong)] odd:bg-[color:var(--dashboardy-subsurface-strong)]",
								)}
								onMouseEnter={() => onHighlightDateChange?.(row.id)}
								onMouseLeave={() => onHighlightDateChange?.(null)}
								onFocus={() => onHighlightDateChange?.(row.id)}
								onBlur={() => onHighlightDateChange?.(null)}
							>
								<div className="min-w-0">
									<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
										{row.dayLabel}
									</p>
									<p className="mt-0.5 font-mono text-[12px] text-[color:var(--dashboardy-muted)]">
										{row.dateLabel}
									</p>
								</div>
								<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
									{row.sessions}
								</p>
								<DashboardCellStack
									primary={formatCompactNumber(row.totalTokens)}
									secondary={formatTokenMix(row)}
									primaryClassName="font-medium tabular-nums"
									secondaryClassName="font-medium tabular-nums uppercase tracking-[0.02em]"
								/>
								<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
									{row.avgTokensPerSession == null
										? "—"
										: formatCompactNumber(row.avgTokensPerSession)}
								</p>
								<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
									{formatCurrency(cost)}
								</p>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
