import type { RepositoryDailyTrendData } from "@rudel/api-routes";
import { useRef, useState } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { Popover, PopoverContent, PopoverTrigger } from "@/app/ui/popover";
import type { DashboardRepositorySummaryRow } from "@/features/dashboard/data/dashboard-repository-trend";

type DashboardRepositoryTableRow = DashboardRepositorySummaryRow;
const MAX_VISIBLE_REPOSITORIES = 7;

function buildRepositoryRows(
	rows: DashboardRepositorySummaryRow[],
	highlightedDate: string | null,
	trendData: RepositoryDailyTrendData[] | undefined,
): DashboardRepositoryTableRow[] {
	const rowMap = new Map(
		(trendData ?? []).map(
			(row) => [`${row.repository}:${row.date}`, row] as const,
		),
	);

	return rows.map((row) => {
		const highlightedRow =
			highlightedDate != null
				? rowMap.get(`${row.id}:${highlightedDate}`)
				: undefined;
		const sessions =
			highlightedDate != null ? (highlightedRow?.sessions ?? 0) : row.sessions;
		const commits =
			highlightedDate != null
				? (highlightedRow?.total_commits ?? 0)
				: row.commits;

		return {
			...row,
			commitRate: sessions > 0 ? Math.round((commits / sessions) * 100) : 0,
			commits,
			sessions,
		};
	});
}

function getRateTone(commitRate: number) {
	if (commitRate >= 65) {
		return {
			dotClassName: "bg-[color:var(--dashboardy-success-foreground)]",
			textClassName: "text-[color:var(--dashboardy-success-foreground)]",
		};
	}

	if (commitRate >= 45) {
		return {
			dotClassName: "bg-[color:var(--dashboardy-warning-foreground)]",
			textClassName: "text-[color:var(--dashboardy-warning-foreground)]",
		};
	}

	return {
		dotClassName: "bg-[color:var(--dashboardy-danger-foreground)]",
		textClassName: "text-[color:var(--dashboardy-danger-foreground)]",
	};
}

function DashboardRepositoryOverflowPopover({
	rows,
}: {
	rows: DashboardRepositorySummaryRow[];
}) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger
				className="rounded-sm transition-colors hover:text-[color:var(--dashboardy-heading)]"
				onMouseEnter={() => setIsOpen(true)}
				onMouseLeave={() => setIsOpen(false)}
			>
				({rows.length} more)
			</PopoverTrigger>
			<PopoverContent
				side="bottom"
				align="end"
				sideOffset={6}
				className="max-h-56 min-w-40 max-w-[18rem] gap-1 overflow-y-auto rounded-lg px-2.5 py-2 text-[11px] shadow-md"
				onMouseEnter={() => setIsOpen(true)}
				onMouseLeave={() => setIsOpen(false)}
			>
				<div className="grid gap-0.5 text-muted-foreground">
					{rows.map((row) => (
						<p key={row.id} className="truncate">
							{row.label}
						</p>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

export function DashboardRepositoryTable({
	highlightedDate,
	onHighlightRepositoryChange,
	rows,
	trendData,
}: {
	highlightedDate: string | null;
	onHighlightRepositoryChange?: (repositoryId: string | null) => void;
	rows: DashboardRepositorySummaryRow[];
	trendData: RepositoryDailyTrendData[] | undefined;
}) {
	const displayRows = buildRepositoryRows(rows, highlightedDate, trendData);
	const visibleRows = displayRows.slice(0, MAX_VISIBLE_REPOSITORIES);
	const hiddenRows = displayRows.slice(MAX_VISIBLE_REPOSITORIES);
	const hiddenRowCount = Math.max(0, displayRows.length - visibleRows.length);
	const rowContainerRef = useRef<HTMLDivElement | null>(null);

	useMountEffect(() => {
		const element = rowContainerRef.current;

		if (!element || !onHighlightRepositoryChange) {
			return;
		}

		const handlePointerOver = (event: PointerEvent) => {
			const target = event.target;

			if (!(target instanceof Element)) {
				return;
			}

			const row = target.closest<HTMLElement>("[data-repository-row-id]");

			onHighlightRepositoryChange(row?.dataset.repositoryRowId ?? null);
		};

		const handlePointerLeave = () => {
			onHighlightRepositoryChange(null);
		};

		element.addEventListener("pointerover", handlePointerOver);
		element.addEventListener("pointerleave", handlePointerLeave);

		return () => {
			element.removeEventListener("pointerover", handlePointerOver);
			element.removeEventListener("pointerleave", handlePointerLeave);
		};
	});

	return (
		<div className="overflow-x-auto">
			<div className="flex min-w-[44rem] flex-col gap-1">
				<div className="grid grid-cols-[minmax(200px,14fr)_100px_90px_90px_112px] gap-6 px-3.5 text-[13px] font-semibold text-[color:var(--dashboardy-muted)]">
					<p>Repository</p>
					<p>Active days</p>
					<p>Sessions</p>
					<p>Commits</p>
					<p>Rate</p>
				</div>
				<div ref={rowContainerRef} className="grid gap-0">
					{visibleRows.map((row) => {
						const rateTone = getRateTone(row.commitRate);

						return (
							<div
								key={row.id}
								data-repository-row-id={row.id}
								className="grid min-h-12 grid-cols-[minmax(200px,14fr)_100px_90px_90px_112px] items-center gap-6 rounded-lg px-3.5 py-2 text-sm odd:bg-[color:var(--dashboardy-subsurface-strong)]"
							>
								<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
									{row.label}
								</p>
								<p className="font-medium tabular-nums text-[color:var(--dashboardy-muted)]">
									{row.activeDays ?? "—"}
								</p>
								<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
									{row.sessions}
								</p>
								<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
									{row.commits}
								</p>
								<div className="flex items-center justify-start gap-2">
									<span
										className={`size-2 rounded-full ${rateTone.dotClassName}`}
									/>
									<p
										className={`font-semibold tabular-nums ${rateTone.textClassName}`}
									>
										{row.commitRate}%
									</p>
								</div>
							</div>
						);
					})}
				</div>
				{hiddenRowCount > 0 ? (
					<div className="flex justify-end px-3.5 pt-2 text-[12px] font-medium text-[color:var(--dashboardy-muted)]">
						<DashboardRepositoryOverflowPopover rows={hiddenRows} />
					</div>
				) : null}
			</div>
		</div>
	);
}
