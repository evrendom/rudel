import type { UserDailyTrendData } from "@rudel/api-routes";
import { useRef } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";

type DashboardTokenDeveloperTableRow = {
	avgTokensPerSession: number;
	id: string;
	modelsUsed: string[];
	sessions: number;
	totalTokens: number;
	userLabel: string;
};

function formatCompactNumber(value: number) {
	if (value >= 1_000_000) {
		return `${(value / 1_000_000).toFixed(1)}M`;
	}

	if (value >= 1_000) {
		return `${(value / 1_000).toFixed(1)}K`;
	}

	return value.toLocaleString();
}

function buildRows(
	performanceUsers: DashboardPerformanceUserComparison[],
	highlightedDate: string | null,
	trendData: UserDailyTrendData[] | undefined,
): DashboardTokenDeveloperTableRow[] {
	const rowMap = new Map(
		(trendData ?? []).map(
			(row) => [`${row.user_id}:${row.date}`, row] as const,
		),
	);

	return performanceUsers.map((user) => {
		const highlightedRow =
			highlightedDate != null
				? rowMap.get(`${user.userId}:${highlightedDate}`)
				: undefined;
		const sessions =
			highlightedDate != null ? (highlightedRow?.sessions ?? 0) : user.sessions;
		const totalTokens =
			highlightedDate != null
				? (highlightedRow?.total_tokens ?? 0)
				: user.totalTokens;

		return {
			avgTokensPerSession:
				sessions > 0 ? Math.round(totalTokens / sessions) : 0,
			id: user.userId,
			modelsUsed: user.modelsUsed,
			sessions,
			totalTokens,
			userLabel: user.label,
		};
	});
}

export function DashboardTokenDeveloperTable({
	highlightedDate,
	onHighlightUserChange,
	performanceUsers,
	trendData,
}: {
	highlightedDate: string | null;
	onHighlightUserChange?: (userId: string | null) => void;
	performanceUsers: DashboardPerformanceUserComparison[];
	trendData: UserDailyTrendData[] | undefined;
}) {
	const rows = buildRows(performanceUsers, highlightedDate, trendData);
	const rowContainerRef = useRef<HTMLDivElement | null>(null);

	useMountEffect(() => {
		const element = rowContainerRef.current;

		if (!element || !onHighlightUserChange) {
			return;
		}

		const handlePointerOver = (event: PointerEvent) => {
			const target = event.target;

			if (!(target instanceof Element)) {
				return;
			}

			const row = target.closest<HTMLElement>("[data-token-row-id]");

			onHighlightUserChange(row?.dataset.tokenRowId ?? null);
		};

		const handlePointerLeave = () => {
			onHighlightUserChange(null);
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
			<div className="flex min-w-[54rem] flex-col gap-1">
				<div className="grid grid-cols-[minmax(180px,11fr)_minmax(180px,9fr)_90px_120px_120px] gap-6 px-3.5 text-[13px] font-semibold text-[color:var(--dashboardy-muted)]">
					<p>User</p>
					<p>Models used</p>
					<p>Sessions</p>
					<p>Tokens</p>
					<p>Avg / session</p>
				</div>
				<div ref={rowContainerRef} className="grid gap-0">
					{rows.map((row) => (
						<div
							key={row.id}
							data-token-row-id={row.id}
							className="grid min-h-12 grid-cols-[minmax(180px,11fr)_minmax(180px,9fr)_90px_120px_120px] items-center gap-6 rounded-lg px-3.5 py-2 text-sm odd:bg-[color:var(--dashboardy-subsurface-strong)]"
						>
							<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
								{row.userLabel}
							</p>
							<div className="flex min-w-0 flex-wrap items-center gap-1.5">
								<DashboardModelBadges models={row.modelsUsed} />
							</div>
							<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
								{row.sessions}
							</p>
							<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
								{formatCompactNumber(row.totalTokens)}
							</p>
							<p className="font-medium tabular-nums text-[color:var(--dashboardy-heading)]">
								{row.sessions > 0
									? formatCompactNumber(row.avgTokensPerSession)
									: "—"}
							</p>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
