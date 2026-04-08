import { format, parseISO } from "date-fns";
import type { DashboardTokenDailyPoint } from "@/features/dashboard/data/dashboard-tab-adapters";
import { formatCompactNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

type DashboardTokenDailyOverviewRow = {
	avgTokensPerSession: number | null;
	dateLabel: string;
	dayLabel: string;
	id: string;
	mixLabel: string;
	mixTone: "balanced" | "input-heavy" | "muted" | "output-heavy";
	sessions: number;
	totalTokens: number;
};

const MAX_DAILY_ROWS = 10;

function getMixStatus(point: DashboardTokenDailyPoint) {
	if (point.totalTokens <= 0) {
		return {
			label: "No activity",
			tone: "muted" as const,
		};
	}

	const inputShare = point.inputTokens / point.totalTokens;

	if (inputShare >= 0.6) {
		return {
			label: `${Math.round(inputShare * 100)}% input`,
			tone: "input-heavy" as const,
		};
	}

	if (inputShare <= 0.4) {
		return {
			label: `${Math.round((1 - inputShare) * 100)}% output`,
			tone: "output-heavy" as const,
		};
	}

	return {
		label: "Balanced mix",
		tone: "balanced" as const,
	};
}

function getToneClasses(tone: DashboardTokenDailyOverviewRow["mixTone"]) {
	switch (tone) {
		case "input-heavy":
			return {
				dotClassName: "bg-[color:var(--dashboardy-info-foreground,#1949A9)]",
				textClassName: "text-[color:var(--dashboardy-info-foreground,#1949A9)]",
			};
		case "output-heavy":
			return {
				dotClassName: "bg-[color:var(--dashboardy-danger-foreground,#C21674)]",
				textClassName:
					"text-[color:var(--dashboardy-danger-foreground,#C21674)]",
			};
		case "balanced":
			return {
				dotClassName: "bg-[color:var(--dashboardy-success-foreground)]",
				textClassName: "text-[color:var(--dashboardy-success-foreground)]",
			};
		case "muted":
			return {
				dotClassName: "bg-[color:var(--dashboardy-subtle)]",
				textClassName: "text-[color:var(--dashboardy-muted)]",
			};
	}
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
			const mixStatus = getMixStatus(point);

			return {
				avgTokensPerSession: point.avgTokensPerSession,
				dateLabel: safeDateLabel,
				dayLabel: safeDayLabel,
				id: point.date,
				mixLabel: mixStatus.label,
				mixTone: mixStatus.tone,
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
			<div className="min-w-[54rem]">
				<div className="grid grid-cols-[minmax(180px,1.2fr)_90px_130px_130px_minmax(160px,1fr)] gap-6 px-3.5 text-[13px] font-semibold text-[color:var(--dashboardy-muted)]">
					<p>Day</p>
					<p>Sessions</p>
					<p>Total</p>
					<p>Avg / session</p>
					<p>Mix</p>
				</div>
				<div className="grid gap-0">
					{rows.map((row) => {
						const tone = getToneClasses(row.mixTone);
						const isHighlighted = highlightedDate === row.id;
						const totalLabel =
							row.totalTokens > 0 ? row.totalTokens.toLocaleString() : "0";

						return (
							<button
								key={row.id}
								type="button"
								className={cn(
									"grid min-h-12 w-full grid-cols-[minmax(180px,1.2fr)_90px_130px_130px_minmax(160px,1fr)] items-center gap-6 rounded-lg px-3.5 py-2 text-left text-sm transition-colors duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
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
								<p
									className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]"
									title={totalLabel}
								>
									{formatCompactNumber(row.totalTokens)}
								</p>
								<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
									{row.avgTokensPerSession == null
										? "—"
										: formatCompactNumber(row.avgTokensPerSession)}
								</p>
								<div className="flex items-center gap-2">
									<span
										className={`size-2 rounded-full ${tone.dotClassName}`}
									/>
									<p className={`truncate font-semibold ${tone.textClassName}`}>
										{row.mixLabel}
									</p>
								</div>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
