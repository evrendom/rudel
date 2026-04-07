import { format, parseISO } from "date-fns";
import type { DashboardDailyPatternPoint } from "@/features/dashboard/data/dashboard-static-data";
import { cn } from "@/lib/utils";

type DashboardDailyOverviewRow = {
	commitRate: number | null;
	commits: number | null;
	dateLabel: string;
	dayLabel: string;
	id: string;
	sessions: number | null;
	statusLabel: string;
	statusTone: "danger" | "muted" | "success" | "warning";
};

const MAX_DAILY_ROWS = 10;

function getStatusTone(commitRate: number | null) {
	if (commitRate == null) {
		return {
			label: "No activity",
			tone: "muted" as const,
		};
	}

	if (commitRate >= 65) {
		return {
			label: "High throughput",
			tone: "success" as const,
		};
	}

	if (commitRate >= 45) {
		return {
			label: "Steady",
			tone: "warning" as const,
		};
	}

	return {
		label: "Needs review",
		tone: "danger" as const,
	};
}

function getToneClasses(tone: DashboardDailyOverviewRow["statusTone"]) {
	switch (tone) {
		case "success":
			return {
				dotClassName: "bg-[color:var(--dashboardy-success-foreground)]",
				textClassName: "text-[color:var(--dashboardy-success-foreground)]",
			};
		case "warning":
			return {
				dotClassName: "bg-[color:var(--dashboardy-warning-foreground)]",
				textClassName: "text-[color:var(--dashboardy-warning-foreground)]",
			};
		case "danger":
			return {
				dotClassName: "bg-[color:var(--dashboardy-danger-foreground)]",
				textClassName: "text-[color:var(--dashboardy-danger-foreground)]",
			};
		case "muted":
			return {
				dotClassName: "bg-[color:var(--dashboardy-subtle)]",
				textClassName: "text-[color:var(--dashboardy-muted)]",
			};
	}
}

function buildDailyRows(
	data: DashboardDailyPatternPoint[],
): DashboardDailyOverviewRow[] {
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
			const status = getStatusTone(point.commitRate);

			return {
				commitRate: point.commitRate,
				commits: point.commits,
				dateLabel: safeDateLabel,
				dayLabel: safeDayLabel,
				id: point.date,
				sessions: point.sessions,
				statusLabel: status.label,
				statusTone: status.tone,
			};
		});
}

export function DashboardDailyOverviewTable({
	data,
	highlightedDate,
	highlightSource,
	onHighlightDateChange,
}: {
	data: DashboardDailyPatternPoint[];
	highlightedDate?: string | null;
	highlightSource?: "chart" | "table" | null;
	onHighlightDateChange?: (date: string | null) => void;
}) {
	const rows = buildDailyRows(data);
	const hasTableHighlight =
		highlightSource === "table" && highlightedDate != null;
	const hasChartHighlight =
		highlightSource === "chart" && highlightedDate != null;

	return (
		<div className="overflow-x-auto">
			<div className="min-w-[54rem]">
				<div className="grid grid-cols-[minmax(180px,1.2fr)_90px_90px_130px_minmax(160px,1fr)] gap-6 px-3.5 text-[13px] font-semibold text-[color:var(--dashboardy-muted)]">
					<p>Day</p>
					<p>Sessions</p>
					<p>Commits</p>
					<p>Rate</p>
					<p>Overview</p>
				</div>
				<div className="mt-1 grid gap-1">
					{rows.map((row) => {
						const tone = getToneClasses(row.statusTone);
						const isHighlighted = highlightedDate === row.id;

						return (
							<button
								key={row.id}
								type="button"
								className={cn(
									"grid min-h-12 w-full grid-cols-[minmax(180px,1.2fr)_90px_90px_130px_minmax(160px,1fr)] items-center gap-6 rounded-lg px-3.5 py-2 text-left text-sm transition-colors duration-300 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)]",
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
									{row.sessions ?? "—"}
								</p>
								<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
									{row.commits ?? "—"}
								</p>
								<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
									{row.commitRate == null ? "—" : `${row.commitRate}%`}
								</p>
								<div className="flex items-center gap-2">
									<span
										className={`size-2 rounded-full ${tone.dotClassName}`}
									/>
									<p className={`truncate font-semibold ${tone.textClassName}`}>
										{row.statusLabel}
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
