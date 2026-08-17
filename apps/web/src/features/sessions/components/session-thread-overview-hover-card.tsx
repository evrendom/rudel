import type { CSSProperties } from "react";
import type { SessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import { resolveLivelineInputTokenLimit } from "./session-thread-overview-context-limits";
import type { SessionOverviewLivelineCallHit } from "./session-thread-overview-liveline-geometry";
import type { SessionOverviewCallSeries } from "./session-thread-overview-model";
import {
	formatElapsedSinceStart,
	formatTimelineMomentWithSeconds,
} from "./session-thread-overview-model";
import type { SessionOverviewHover } from "./session-thread-overview-strip-utils";
import {
	formatCompactNumber,
	getChartX,
	getTurnLabel,
} from "./session-thread-overview-strip-utils";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";

function getContextLimit(
	hit: SessionOverviewLivelineCallHit,
	series: SessionOverviewCallSeries,
) {
	return (
		hit.call.modelContextWindow ??
		resolveLivelineInputTokenLimit(hit.call.model) ??
		series.aggregates.largestCallInputTotal * 1.12
	);
}

function getCardStyle(
	readout: SessionOverviewHover,
	config: SessionThreadOverviewStripConfig,
): CSSProperties {
	const xPercent =
		(getChartX(readout.xRatio, config) / config.chartWidth) * 100;
	return xPercent <= 50
		? { left: `${xPercent}%` }
		: { right: `${100 - xPercent}%` };
}

export function SessionThreadOverviewHoverCard({
	config,
	elapsedMs,
	hit,
	options,
	readout,
	readoutId,
	series,
	timestamp,
}: {
	config: SessionThreadOverviewStripConfig;
	elapsedMs: number | undefined;
	hit: SessionOverviewLivelineCallHit | undefined;
	options: readonly SessionTurnTablePaneOption[];
	readout: SessionOverviewHover | undefined;
	readoutId: string;
	series: SessionOverviewCallSeries;
	timestamp: number | undefined;
}) {
	if (!readout || timestamp === undefined) {
		return null;
	}

	const option = options[hit?.turnIndex ?? readout.index];
	const placement =
		(getChartX(readout.xRatio, config) / config.chartWidth) * 100 <= 50
			? "right"
			: "left";
	const contextLimit = hit ? getContextLimit(hit, series) : undefined;
	const contextUtilization =
		hit && contextLimit && contextLimit > 0
			? (hit.call.inputTotal / contextLimit) * 100
			: undefined;

	return (
		<output
			id={readoutId}
			aria-live="off"
			className={`pointer-events-none absolute top-0 z-50 h-14 w-80 max-w-[calc(100%-1.5rem)] border-x border-(--session-overview-border) bg-[color-mix(in_srgb,var(--session-overview-surface)_96%,transparent)] shadow-sm backdrop-blur-sm ${placement === "right" ? "translate-x-3" : "-translate-x-3"}`}
			data-session-overview-hover-card
			data-session-overview-hover-card-placement={placement}
			style={getCardStyle(readout, config)}
		>
			<div className="flex h-full min-w-0 flex-col justify-center gap-1 px-2.5 py-1.5">
				<div className="flex min-w-0 items-center gap-2 font-mono text-[0.5625rem] tabular-nums">
					<p className="min-w-0 truncate font-medium text-(--session-overview-text)">
						{formatTimelineMomentWithSeconds(timestamp)}
					</p>
					{elapsedMs === undefined ? null : (
						<p className="shrink-0 text-(--session-overview-subtle)">
							{formatElapsedSinceStart(elapsedMs)}
						</p>
					)}
					<p className="min-w-0 flex-1 truncate text-right font-sans font-medium text-(--session-overview-text)">
						{option ? getTurnLabel(option) : "Session activity"}
						{hit?.call.model ? ` · ${hit.call.model}` : ""}
					</p>
					{contextUtilization === undefined ? null : (
						<p className="shrink-0 font-medium text-(--session-overview-text)">
							{contextUtilization.toFixed(1)}%
						</p>
					)}
				</div>

				{hit && contextLimit !== undefined ? (
					<div className="flex min-w-0 items-center justify-between gap-3 font-mono text-[0.5625rem] text-(--session-overview-subtle) tabular-nums">
						<p className="min-w-0 truncate">
							Input context{" "}
							<span className="font-medium text-(--session-overview-text)">
								{formatCompactNumber(hit.call.inputTotal)} /{" "}
								{formatCompactNumber(contextLimit)}
							</span>
						</p>
						<p className="min-w-0 truncate text-right">
							Fresh {formatCompactNumber(hit.call.fresh)} · Read{" "}
							{formatCompactNumber(hit.call.cacheRead)} · Write{" "}
							{formatCompactNumber(hit.call.cacheCreation)}
						</p>
					</div>
				) : (
					<p className="text-[0.5625rem] text-(--session-overview-muted)">
						No model call at this point.
					</p>
				)}
			</div>
		</output>
	);
}
