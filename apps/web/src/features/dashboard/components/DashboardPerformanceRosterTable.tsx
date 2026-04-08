import type { UserDailyTrendData } from "@rudel/api-routes";
import { useRef } from "react";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/app/ui/tooltip";
import { DashboardModelBadges } from "@/features/dashboard/components/DashboardModelBadges";
import type { DashboardPerformanceUserComparison } from "@/features/dashboard/data/dashboard-performance-adapter";

type DashboardPerformanceRosterRow = {
	commitRate: number;
	commits: number;
	id: string;
	imageUrl?: string | null;
	modelsUsed: string[];
	repositoriesTouched: string[];
	sessions: number;
	userLabel: string;
};

const MAX_VISIBLE_REPOSITORIES = 2;

function getAvatarInitials(fullLabel: string) {
	const fallbackToken = fullLabel.includes("@")
		? (fullLabel.split("@")[0] ?? fullLabel)
		: fullLabel;
	const parts = fallbackToken.split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		return "AI";
	}

	if (parts.length === 1) {
		return parts[0]?.slice(0, 2).toUpperCase() ?? "AI";
	}

	return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
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

function buildRosterRows(
	performanceUsers: DashboardPerformanceUserComparison[],
	highlightedDate: string | null,
	trendData: UserDailyTrendData[] | undefined,
): DashboardPerformanceRosterRow[] {
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
		const commits =
			highlightedDate != null
				? (highlightedRow?.total_commits ?? 0)
				: user.commits;
		const commitRate =
			sessions > 0 ? Math.round((commits / sessions) * 100) : 0;

		return {
			commitRate,
			commits,
			id: user.userId,
			imageUrl: user.imageUrl,
			modelsUsed: user.modelsUsed,
			repositoriesTouched: user.repositoriesTouched,
			sessions,
			userLabel: user.label,
		};
	});
}

export function DashboardPerformanceRosterTable({
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
	const rows = buildRosterRows(performanceUsers, highlightedDate, trendData);
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

			const row = target.closest<HTMLElement>("[data-performance-row-id]");

			onHighlightUserChange(row?.dataset.performanceRowId ?? null);
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
			<div className="flex min-w-[60rem] flex-col gap-1">
				<div className="grid grid-cols-[minmax(180px,12fr)_minmax(168px,8fr)_minmax(180px,8fr)_80px_80px_112px] gap-6 px-3.5 text-[13px] font-semibold text-[color:var(--dashboardy-muted)]">
					<p>User</p>
					<p>Repository</p>
					<p>Models used</p>
					<p>Sessions</p>
					<p>Commits</p>
					<p>Rate</p>
				</div>
				<div ref={rowContainerRef} className="grid gap-0">
					{rows.map((row) => {
						const rateTone = getRateTone(row.commitRate);
						const visibleRepositories = row.repositoriesTouched.slice(
							0,
							MAX_VISIBLE_REPOSITORIES,
						);
						const hiddenRepositories = row.repositoriesTouched.slice(
							MAX_VISIBLE_REPOSITORIES,
						);
						const hiddenRepositoryCount = Math.max(
							row.repositoriesTouched.length - visibleRepositories.length,
							0,
						);

						return (
							<div
								key={row.id}
								data-performance-row-id={row.id}
								className="grid min-h-12 grid-cols-[minmax(180px,12fr)_minmax(168px,8fr)_minmax(180px,8fr)_80px_80px_112px] items-center gap-6 rounded-lg px-3.5 py-2 text-sm odd:bg-[color:var(--dashboardy-subsurface-strong)]"
							>
								<div className="flex min-w-0 items-center gap-3">
									<div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-[color:var(--dashboardy-surface)] shadow-sm">
										{row.imageUrl ? (
											<img
												src={row.imageUrl}
												alt={row.userLabel}
												className="size-full object-cover"
											/>
										) : (
											<span className="text-[10px] font-semibold text-[color:var(--dashboardy-heading)]">
												{getAvatarInitials(row.userLabel)}
											</span>
										)}
									</div>
									<p className="truncate font-semibold text-[color:var(--dashboardy-heading)]">
										{row.userLabel}
									</p>
								</div>
								<div className="flex min-w-0 flex-wrap items-center gap-1.5">
									{row.repositoriesTouched.length > 0 ? (
										<p className="truncate text-[13px] font-medium text-[color:var(--dashboardy-heading)]">
											{visibleRepositories.map((repository, index) => (
												<span key={`${row.id}-${repository}`}>
													{index > 0 ? ", " : null}
													{repository}
												</span>
											))}
											{hiddenRepositoryCount > 0 ? (
												<>
													{visibleRepositories.length > 0 ? ", " : null}
													<Tooltip>
														<TooltipTrigger
															render={
																<span className="cursor-help text-[color:var(--dashboardy-muted)] underline decoration-black/10 underline-offset-2" />
															}
														>
															{hiddenRepositoryCount} more
														</TooltipTrigger>
														<TooltipContent align="start" className="max-w-sm">
															<div className="grid gap-0.5">
																{hiddenRepositories.map((repository) => (
																	<p key={`${row.id}-tooltip-${repository}`}>
																		{repository}
																	</p>
																))}
															</div>
														</TooltipContent>
													</Tooltip>
												</>
											) : null}
										</p>
									) : (
										<span className="text-[12px] text-[color:var(--dashboardy-muted)]">
											—
										</span>
									)}
								</div>
								<div className="flex min-w-0 flex-wrap items-center gap-1.5">
									<DashboardModelBadges models={row.modelsUsed} />
								</div>
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
			</div>
		</div>
	);
}
