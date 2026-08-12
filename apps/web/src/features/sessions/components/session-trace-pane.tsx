import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useObservedWidth } from "@/components/conversation/use-observed-width";
import { cn } from "@/lib/utils";
import {
	buildEventSpans,
	buildMetricShareLayout,
	buildWaterfallLayout,
} from "./session-trace-timeline";
import type { SessionTurnLensInput } from "./session-turn-lenses";
import {
	formatSessionTurnMetricValue,
	getSessionTurnMetricValue,
	type SessionTurnMetric,
} from "./session-turn-metric";
import { SessionTurnMetricSwitcher } from "./session-turn-metric-switcher";
import type { SessionTurn } from "./session-turns";
import type { SessionTurnTraceMode } from "./use-session-turn-v2-state";

type TracePaneOption = SessionTurnLensInput & { turn: SessionTurn };

function formatIdleGap(milliseconds: number) {
	const hours = milliseconds / 3_600_000;
	if (hours >= 1) {
		return `${Math.round(hours)}h idle`;
	}
	return `${Math.round(milliseconds / 60_000)}m idle`;
}

export function SessionTracePane({
	matchedIndices,
	metric,
	mode,
	onMetricChange,
	onModeChange,
	onReveal,
	options,
	selectedIndex,
}: {
	matchedIndices: ReadonlySet<number> | undefined;
	metric: SessionTurnMetric;
	mode: SessionTurnTraceMode;
	onMetricChange: (metric: SessionTurnMetric) => void;
	onModeChange: (mode: SessionTurnTraceMode) => void;
	onReveal: (index: number) => void;
	options: readonly TracePaneOption[];
	selectedIndex: number;
}) {
	const [expandedIndex, setExpandedIndex] = useState<number | undefined>();
	const values = useMemo(
		() => options.map((option) => getSessionTurnMetricValue(option, metric)),
		[metric, options],
	);

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex min-h-11 shrink-0 items-center gap-2 border-b border-(--session-overview-border) px-3">
				<div
					role="tablist"
					aria-label="Trace view"
					className="flex rounded-md bg-(--session-overview-hover) p-0.5"
				>
					{(["waterfall", "share"] as const).map((traceMode) => (
						<button
							key={traceMode}
							type="button"
							role="tab"
							aria-selected={mode === traceMode}
							className={cn(
								"h-7 rounded-sm px-2.5 text-xs font-medium capitalize outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)",
								mode === traceMode
									? "bg-(--session-overview-surface) text-(--session-overview-text)"
									: "text-(--session-overview-muted)",
							)}
							onClick={() => onModeChange(traceMode)}
						>
							{traceMode}
						</button>
					))}
				</div>
				<div className="ml-auto">
					<SessionTurnMetricSwitcher
						metric={metric}
						onChange={onMetricChange}
					/>
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-auto overscroll-none p-3">
				{mode === "waterfall" ? (
					<SessionWaterfallTrace
						expandedIndex={expandedIndex}
						matchedIndices={matchedIndices}
						onExpand={setExpandedIndex}
						onReveal={onReveal}
						options={options}
						selectedIndex={selectedIndex}
					/>
				) : (
					<SessionMetricShareTrace
						expandedIndex={expandedIndex}
						matchedIndices={matchedIndices}
						metric={metric}
						onExpand={setExpandedIndex}
						onReveal={onReveal}
						options={options}
						selectedIndex={selectedIndex}
						values={values}
					/>
				)}
			</div>
		</div>
	);
}

function SessionWaterfallTrace({
	expandedIndex,
	matchedIndices,
	onExpand,
	onReveal,
	options,
	selectedIndex,
}: {
	expandedIndex: number | undefined;
	matchedIndices: ReadonlySet<number> | undefined;
	onExpand: (index: number | undefined) => void;
	onReveal: (index: number) => void;
	options: readonly TracePaneOption[];
	selectedIndex: number;
}) {
	const { elementRef, width } = useObservedWidth<HTMLDivElement>();
	const layout = useMemo(
		() => buildWaterfallLayout(options.map((option) => option.timing)),
		[options],
	);
	const innerWidth = Math.max(width - 112, 180);
	const total = Math.max(layout.totalCompressedMs, 1);

	return (
		<div ref={elementRef} className="min-w-[30rem]">
			<div className="mb-2 flex items-center justify-between text-xs text-(--session-overview-muted)">
				<span>Compressed session clock</span>
				<span>{options.length} turns</span>
			</div>
			{layout.rows.map((row) => {
				const option = options[row.index];
				if (!option) {
					return null;
				}
				const x = (row.x0 / total) * innerWidth;
				const barWidth = Math.max(((row.x1 - row.x0) / total) * innerWidth, 3);
				const expanded = expandedIndex === row.index;
				const idleBreak = layout.breaks.find(
					(item) => item.afterIndex === row.index - 1,
				);

				return (
					<div key={option.key}>
						{idleBreak ? (
							<div className="my-1 flex items-center gap-2 text-[0.6875rem] text-(--session-overview-subtle)">
								<div className="h-px flex-1 border-t border-dashed border-(--session-overview-border)" />
								<span>≋ {formatIdleGap(idleBreak.originalGapMs)}</span>
								<div className="h-px flex-1 border-t border-dashed border-(--session-overview-border)" />
							</div>
						) : null}
						<div
							className={cn(
								"flex h-7 items-center gap-1 rounded-md pr-2 hover:bg-(--session-overview-hover)",
								matchedIndices &&
									!matchedIndices.has(row.index) &&
									"opacity-30",
							)}
						>
							<button
								type="button"
								aria-label={`${expanded ? "Collapse" : "Expand"} turn ${option.turnNumber ?? "session start"}`}
								className="flex size-7 shrink-0 items-center justify-center rounded outline-none focus-visible:outline-2 focus-visible:outline-(--session-overview-accent)"
								onClick={() => onExpand(expanded ? undefined : row.index)}
							>
								{expanded ? (
									<ChevronDown className="size-3.5" />
								) : (
									<ChevronRight className="size-3.5" />
								)}
							</button>
							<span className="w-16 shrink-0 truncate text-xs text-(--session-overview-muted)">
								{option.turnNumber === undefined
									? "Start"
									: `Turn ${option.turnNumber}`}
							</span>
							<button
								type="button"
								className="relative h-5 flex-1 rounded outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)"
								onClick={() => onReveal(row.index)}
							>
								<span
									className={cn(
										"absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-(--session-overview-muted)",
										row.index === selectedIndex &&
											"bg-(--session-overview-accent)",
										row.estimated &&
											"border border-dashed border-(--session-overview-muted) bg-transparent",
									)}
									style={{ left: x, width: barWidth }}
								/>
							</button>
						</div>
						{expanded ? <EventSpanList option={option} /> : null}
					</div>
				);
			})}
		</div>
	);
}

function EventSpanList({ option }: { option: TracePaneOption }) {
	const spans = buildEventSpans(option.turn);
	return (
		<div className="ml-24 border-l border-(--session-overview-border) py-1 pl-3">
			{spans.length > 0 ? (
				spans.map((span) => (
					<div key={span.id} className="flex h-6 items-center gap-2 text-xs">
						<span className="w-16 shrink-0 capitalize text-(--session-overview-subtle)">
							{span.kind}
						</span>
						<span className="min-w-0 truncate text-(--session-overview-text)">
							{span.label}
						</span>
						<span className="ml-auto shrink-0 tabular-nums text-(--session-overview-muted)">
							{Math.round((span.end - span.start) / 1_000)}s
						</span>
					</div>
				))
			) : (
				<p className="py-1 text-xs text-(--session-overview-muted)">
					No timed events
				</p>
			)}
		</div>
	);
}

function SessionMetricShareTrace({
	expandedIndex,
	matchedIndices,
	metric,
	onExpand,
	onReveal,
	options,
	selectedIndex,
	values,
}: {
	expandedIndex: number | undefined;
	matchedIndices: ReadonlySet<number> | undefined;
	metric: SessionTurnMetric;
	onExpand: (index: number | undefined) => void;
	onReveal: (index: number) => void;
	options: readonly TracePaneOption[];
	selectedIndex: number;
	values: readonly (number | undefined)[];
}) {
	const layout = buildMetricShareLayout(values);
	if (layout.length === 0) {
		return (
			<div className="flex min-h-48 items-center justify-center text-sm text-(--session-overview-muted)">
				No priced {metric} data available.
			</div>
		);
	}

	const expandedOption =
		expandedIndex === undefined ? undefined : options[expandedIndex];
	return (
		<div className="min-w-[30rem]">
			{expandedOption ? (
				<button
					type="button"
					className="mb-3 text-xs font-medium text-(--session-overview-accent) outline-none focus-visible:outline-2 focus-visible:outline-(--session-overview-accent)"
					onClick={() => onExpand(undefined)}
				>
					Session / Turn {expandedOption.turnNumber ?? "start"}
				</button>
			) : (
				<p className="mb-3 text-xs text-(--session-overview-muted)">
					Session metric share
				</p>
			)}
			{expandedOption ? (
				<EventSpanList option={expandedOption} />
			) : (
				<div className="flex h-24 w-full overflow-hidden rounded-lg border border-(--session-overview-border)">
					{layout.map((segment) => {
						const option = options[segment.index];
						if (!option) {
							return null;
						}
						return (
							<button
								key={option.key}
								type="button"
								title={`${option.turnNumber === undefined ? "Session start" : `Turn ${option.turnNumber}`} · ${formatSessionTurnMetricValue(values[segment.index], metric)}`}
								className={cn(
									"min-w-px border-r border-(--session-overview-surface) bg-[color-mix(in_srgb,var(--session-overview-accent)_55%,var(--session-overview-surface))] outline-none hover:bg-(--session-overview-accent) focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-text)",
									segment.index === selectedIndex &&
										"bg-(--session-overview-accent)",
									matchedIndices &&
										!matchedIndices.has(segment.index) &&
										"opacity-25",
								)}
								style={{ flexBasis: `${segment.share * 100}%` }}
								onClick={() => {
									onReveal(segment.index);
									onExpand(segment.index);
								}}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}
