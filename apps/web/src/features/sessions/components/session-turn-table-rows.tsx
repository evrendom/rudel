import { ChevronDown, ChevronRight } from "lucide-react";
import type { SessionCompaction } from "./session-compactions";
import type { SessionTurnEpisode } from "./session-turn-episodes";

export function SessionTurnCompactionRow({
	columnCount,
	compaction,
}: {
	columnCount: number;
	compaction: SessionCompaction;
}) {
	return (
		<tr className="border-y border-amber-200/70 bg-amber-50 dark:border-amber-400/15 dark:bg-amber-400/10">
			<td
				colSpan={columnCount}
				className="h-7 px-3 text-xs font-medium tracking-[-0.01em] text-amber-800 dark:text-amber-300"
				title={new Date(compaction.timestamp).toLocaleString()}
			>
				Compaction
			</td>
		</tr>
	);
}

export function SessionTurnEpisodeRow({
	collapsed,
	columnCount,
	episode,
	onToggle,
}: {
	collapsed: boolean;
	columnCount: number;
	episode: SessionTurnEpisode;
	onToggle: (() => void) | undefined;
}) {
	return (
		<tr className="border-b border-(--session-overview-border) bg-[color-mix(in_srgb,var(--session-overview-hover)_72%,var(--session-overview-surface))]">
			<td colSpan={columnCount} className="p-0">
				<button
					type="button"
					aria-expanded={!collapsed}
					className="flex min-h-9 w-full items-center gap-2 px-3 text-left text-xs font-medium text-(--session-overview-text) outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent)"
					onClick={onToggle}
				>
					{collapsed ? (
						<ChevronRight aria-hidden="true" className="size-3.5 shrink-0" />
					) : (
						<ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />
					)}
					<span className="min-w-0 flex-1 truncate">{episode.label}</span>
					<span className="shrink-0 font-normal text-(--session-overview-muted) tabular-nums">
						{episode.indices.length} turns · {episode.stats.tools} tools
					</span>
				</button>
			</td>
		</tr>
	);
}
