import type { CSSProperties } from "react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { cn } from "@/lib/utils";
import { formatSessionAdalineDuration } from "./session-adaline-model";
import type { SelectedTurnOption } from "./session-selected-turn";
import {
	buildSessionTurnTimelineLayout,
	buildSessionTurnTimelineTicks,
	formatSessionTurnTimelineMetricValue,
	getSessionTurnTimelineHeight,
	getSessionTurnTimelineViewportRange,
	type SessionTurnTimelineBlock,
	type SessionTurnTimelineContextPoint,
	type SessionTurnTimelineThicknessMetric,
} from "./session-turn-timeline";

const timelineDateFormatter = new Intl.DateTimeFormat(undefined, {
	day: "numeric",
	month: "short",
});

const timelineClockFormatter = new Intl.DateTimeFormat(undefined, {
	hour: "2-digit",
	hour12: false,
	minute: "2-digit",
});

const timelineClockWithSecondsFormatter = new Intl.DateTimeFormat(undefined, {
	hour: "2-digit",
	hour12: false,
	minute: "2-digit",
	second: "2-digit",
});

const timelineFullTimestampFormatter = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeStyle: "medium",
});

function getTimelineBlockClassName(block: SessionTurnTimelineBlock) {
	if (block.status === "error") {
		return "border-red-500/70 bg-red-500/75 text-white";
	}

	switch (block.kind) {
		case "member":
			return "border-(--session-overview-text) bg-(--session-overview-text) text-(--session-overview-surface)";
		case "model":
			return "border-[color-mix(in_srgb,var(--session-overview-accent)_38%,var(--session-overview-border))] bg-[color-mix(in_srgb,var(--session-overview-accent)_9%,var(--session-overview-surface))] text-(--session-overview-text)";
		case "reasoning":
			return "border-[color-mix(in_srgb,var(--session-overview-accent)_65%,transparent)] bg-[color-mix(in_srgb,var(--session-overview-accent)_52%,var(--session-overview-surface))] text-(--session-overview-text)";
		case "activity":
			return "border-amber-500/55 bg-amber-400/60 text-(--session-overview-text) dark:bg-amber-400/35";
		case "response":
			return "border-emerald-500/55 bg-emerald-400/60 text-(--session-overview-text) dark:bg-emerald-400/35";
	}
}

function getTimelineBlockStyle(
	block: SessionTurnTimelineBlock,
	timelineHeight: number,
): CSSProperties {
	const minimumHeight =
		block.kind === "member" ? 8 : block.depth === 0 ? 12 : 9;
	const height = Math.max(block.heightRatio * timelineHeight, minimumHeight);
	const top = Math.min(
		Math.max(block.topRatio * timelineHeight, 0),
		Math.max(timelineHeight - height, 0),
	);
	const parentWidth =
		block.thicknessRatio === undefined ? 30 : 24 + block.thicknessRatio * 76;
	const width =
		block.kind === "member"
			? 72
			: block.depth === 0
				? parentWidth
				: Math.max(parentWidth - 16, 14);

	return {
		height,
		left: block.depth === 0 ? "50%" : "58%",
		top,
		transform: "translateX(-50%)",
		width: `${width}%`,
	};
}

function SessionTimelineBlock({
	block,
	metric,
	modelLabel,
	onSelect,
	option,
	selected,
	timelineHeight,
}: {
	block: SessionTurnTimelineBlock;
	metric: SessionTurnTimelineThicknessMetric;
	modelLabel: string;
	onSelect: (index: number) => void;
	option: SelectedTurnOption;
	selected: boolean;
	timelineHeight: number;
}) {
	const height = Math.max(
		block.heightRatio * timelineHeight,
		block.kind === "member" ? 8 : block.depth === 0 ? 12 : 9,
	);
	const durationLabel = formatSessionAdalineDuration(block.durationMs);
	const metricLabel = formatSessionTurnTimelineMetricValue(
		block.metricValue,
		metric,
	);
	const turnLabel =
		option.turnNumber === undefined
			? "Session start"
			: `Turn ${option.turnNumber}`;
	const displayLabel = block.kind === "model" ? modelLabel : block.label;
	const title = [
		`${turnLabel} · ${displayLabel}`,
		block.preview,
		block.kind === "member" ? undefined : `Duration ${durationLabel}`,
		block.kind === "model" ? `${metric} ${metricLabel}` : undefined,
	]
		.filter(Boolean)
		.join("\n");

	return (
		<button
			type="button"
			aria-label={`${turnLabel}, ${displayLabel}`}
			aria-pressed={selected}
			className={cn(
				"absolute overflow-hidden rounded-[0.3rem] border text-left outline-none transition-[width] duration-150 ease-out hover:brightness-95 focus-visible:z-30 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent) motion-reduce:transition-none",
				block.depth === 0 ? "z-10" : "z-20 shadow-sm",
				getTimelineBlockClassName(block),
				selected && "ring-1 ring-(--session-overview-accent) ring-offset-1",
				block.estimatedDuration && "border-dashed",
			)}
			data-turn-index={block.turnIndex}
			style={getTimelineBlockStyle(block, timelineHeight)}
			title={title}
			onClick={() => onSelect(block.turnIndex)}
		>
			{height >= 26 ? (
				<span className="block truncate px-1.5 py-1 text-[0.625rem] leading-3 font-medium">
					{displayLabel}
				</span>
			) : null}
		</button>
	);
}

function SessionTimelineLane({
	blocks,
	metric,
	modelLabel,
	onSelect,
	options,
	selectedIndex,
	timelineHeight,
}: {
	blocks: readonly SessionTurnTimelineBlock[];
	metric: SessionTurnTimelineThicknessMetric;
	modelLabel: string;
	onSelect: (index: number) => void;
	options: readonly SelectedTurnOption[];
	selectedIndex: number;
	timelineHeight: number;
}) {
	return (
		<div
			className="relative z-10 min-w-0 border-l border-(--session-overview-border)"
			style={{ height: timelineHeight }}
		>
			{blocks.map((block) => {
				const option = options[block.turnIndex];
				return option ? (
					<SessionTimelineBlock
						key={block.id}
						block={block}
						metric={metric}
						modelLabel={modelLabel}
						onSelect={onSelect}
						option={option}
						selected={block.turnIndex === selectedIndex}
						timelineHeight={timelineHeight}
					/>
				) : null;
			})}
		</div>
	);
}

function buildContextGraphPaths(
	points: readonly SessionTurnTimelineContextPoint[],
) {
	const firstPoint = points[0];
	if (!firstPoint) {
		return { areaPath: "", linePath: "" };
	}

	let areaPath = `M 0 ${firstPoint.offsetRatio * 100} L ${firstPoint.valueRatio * 100} ${firstPoint.offsetRatio * 100}`;
	let linePath = `M ${firstPoint.valueRatio * 100} ${firstPoint.offsetRatio * 100}`;
	let previousValueRatio = firstPoint.valueRatio;

	for (const point of points.slice(1)) {
		const y = point.offsetRatio * 100;
		areaPath += ` L ${previousValueRatio * 100} ${y} L ${point.valueRatio * 100} ${y}`;
		linePath += ` L ${previousValueRatio * 100} ${y} L ${point.valueRatio * 100} ${y}`;
		previousValueRatio = point.valueRatio;
	}

	areaPath += ` L ${previousValueRatio * 100} 100 L 0 100 Z`;
	return { areaPath, linePath };
}

function SessionTimelineContextGraph({
	contextPoints,
	onSelect,
	selectedIndex,
	timelineHeight,
}: {
	contextPoints: readonly SessionTurnTimelineContextPoint[];
	onSelect: (index: number) => void;
	selectedIndex: number;
	timelineHeight: number;
}) {
	const paths = buildContextGraphPaths(contextPoints);

	return (
		<div
			className="relative z-10 min-w-0 overflow-hidden border-l border-(--session-overview-border)"
			style={{ height: timelineHeight }}
		>
			{paths.areaPath ? (
				<svg
					aria-hidden="true"
					className="absolute inset-0 size-full overflow-visible"
					preserveAspectRatio="none"
					viewBox="0 0 100 100"
				>
					<path
						d={paths.areaPath}
						className="fill-[color-mix(in_srgb,var(--session-overview-accent)_14%,transparent)]"
					/>
					<path
						d={paths.linePath}
						className="fill-none stroke-(--session-overview-accent)"
						strokeWidth="1.5"
						vectorEffect="non-scaling-stroke"
					/>
				</svg>
			) : null}
			{contextPoints.map((point) => (
				<button
					key={`${point.turnIndex}:${point.offsetRatio}`}
					type="button"
					aria-label={`Turn context, ${point.value.toLocaleString()} input tokens`}
					aria-pressed={point.turnIndex === selectedIndex}
					className={cn(
						"absolute z-20 size-2 -translate-1/2 rounded-full border border-(--session-overview-surface) bg-(--session-overview-accent) outline-none ring-1 ring-(--session-overview-accent) focus-visible:size-3",
						point.turnIndex === selectedIndex &&
							"size-3 bg-red-500 ring-red-500",
					)}
					style={{
						left: `${point.valueRatio * 100}%`,
						top: `${point.offsetRatio * 100}%`,
					}}
					title={`${point.value.toLocaleString()} input tokens`}
					onClick={() => onSelect(point.turnIndex)}
				/>
			))}
		</div>
	);
}

export function SessionTurnTimelineView({
	metric,
	model,
	onSelect,
	options,
	selectedIndex,
	userLabel,
	visibleTurnRange,
}: {
	metric: SessionTurnTimelineThicknessMetric;
	model: string | undefined;
	onSelect: (index: number) => void;
	options: readonly SelectedTurnOption[];
	selectedIndex: number;
	userLabel: string;
	visibleTurnRange: readonly [number, number];
}) {
	const scrollContainerRef = useRef<HTMLDivElement>(null);
	const layout = useMemo(
		() => buildSessionTurnTimelineLayout(options, metric),
		[metric, options],
	);
	const timelineHeight = getSessionTurnTimelineHeight(layout.totalDurationMs);
	const tickLayout = useMemo(
		() =>
			layout.startMs === undefined || layout.endMs === undefined
				? { intervalMs: 60_000, ticks: [] }
				: buildSessionTurnTimelineTicks(
						layout.startMs,
						layout.endMs,
						timelineHeight,
					),
		[layout.endMs, layout.startMs, timelineHeight],
	);
	const viewportRange = getSessionTurnTimelineViewportRange(
		layout.blocks,
		visibleTurnRange,
	);
	const focusRange = getSessionTurnTimelineViewportRange(layout.blocks, [
		selectedIndex,
		selectedIndex,
	]);
	const memberBlocks = layout.blocks.filter((block) => block.lane === "member");
	const modelBlocks = layout.blocks.filter((block) => block.lane === "model");
	const modelLabel = model ? formatModelDisplayLabel(model) : "Model";
	const contextMaximumLabel = formatSessionTurnTimelineMetricValue(
		layout.contextMaximum,
		"tokens",
	);

	useLayoutEffect(() => {
		const scrollContainer = scrollContainerRef.current;
		if (!scrollContainer || !viewportRange) {
			return;
		}

		const rangeTop = viewportRange.startRatio * timelineHeight;
		const rangeBottom = viewportRange.endRatio * timelineHeight;
		const visibleTop = scrollContainer.scrollTop + 40;
		const visibleBottom =
			scrollContainer.scrollTop + scrollContainer.clientHeight;
		if (rangeTop >= visibleTop && rangeBottom <= visibleBottom) {
			return;
		}

		const rangeCenter = (rangeTop + rangeBottom) / 2;
		scrollContainer.scrollTo({
			behavior: "auto",
			top: Math.max(rangeCenter - scrollContainer.clientHeight / 2, 0),
		});
	}, [timelineHeight, viewportRange]);

	if (layout.startMs === undefined || layout.endMs === undefined) {
		return (
			<div className="flex min-h-60 flex-1 items-center justify-center p-8 text-center text-sm text-(--session-overview-muted)">
				No timestamped trace events available
			</div>
		);
	}

	return (
		<div
			ref={scrollContainerRef}
			className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-none"
		>
			<div className="relative min-w-[34rem]">
				<div className="sticky top-0 z-30 grid h-10 grid-cols-[4.5rem_repeat(3,minmax(0,1fr))] items-stretch border-b border-(--session-overview-border) bg-(--session-overview-surface)">
					<div className="flex items-center justify-end border-r border-(--session-overview-border) pr-2 text-[0.6875rem] font-medium text-(--session-overview-subtle) tabular-nums">
						{timelineDateFormatter.format(layout.startMs)}
					</div>
					<div className="flex min-w-0 items-center justify-center border-r border-(--session-overview-border) px-1 text-[0.6875rem] font-medium text-(--session-overview-muted)">
						<span className="truncate">{userLabel}</span>
					</div>
					<div className="grid min-w-0 place-content-center border-r border-(--session-overview-border) px-1 text-center">
						<span className="truncate text-[0.6875rem] font-medium text-(--session-overview-muted)">
							{modelLabel}
						</span>
						<span className="truncate text-[0.5625rem] text-(--session-overview-subtle)">
							Reason · tools · response
						</span>
					</div>
					<div className="grid min-w-0 place-content-center px-1 text-center">
						<span className="text-[0.6875rem] font-medium text-(--session-overview-muted)">
							Context
						</span>
						<span className="text-[0.5625rem] text-(--session-overview-subtle) tabular-nums">
							max {contextMaximumLabel}
						</span>
					</div>
				</div>

				<div
					className="relative grid grid-cols-[4.5rem_repeat(3,minmax(0,1fr))]"
					style={{ height: timelineHeight }}
				>
					<div className="relative z-20 bg-(--session-overview-surface)">
						{tickLayout.ticks.map((tick) => (
							<time
								key={tick.timestampMs}
								className="absolute right-2 -translate-y-1/2 text-[0.625rem] leading-none text-(--session-overview-subtle) tabular-nums"
								dateTime={new Date(tick.timestampMs).toISOString()}
								style={{ top: `${tick.offsetRatio * 100}%` }}
								title={timelineFullTimestampFormatter.format(tick.timestampMs)}
							>
								{tickLayout.intervalMs < 60_000
									? timelineClockWithSecondsFormatter.format(tick.timestampMs)
									: timelineClockFormatter.format(tick.timestampMs)}
							</time>
						))}
					</div>

					<div className="pointer-events-none absolute inset-y-0 left-[4.5rem] right-0 z-0">
						{tickLayout.ticks.map((tick) => (
							<div
								key={tick.timestampMs}
								className="absolute inset-x-0 border-t border-(--session-overview-border)"
								style={{ top: `${tick.offsetRatio * 100}%` }}
							/>
						))}
					</div>

					{viewportRange ? (
						<div
							aria-hidden="true"
							className="pointer-events-none absolute left-[4.5rem] right-0 z-[5] min-h-2 border-y border-red-500/25 bg-red-500/10 transition-[top,height] duration-150 ease-out motion-reduce:transition-none"
							style={{
								height: `max(${Math.max(viewportRange.endRatio - viewportRange.startRatio, 0) * 100}%, 8px)`,
								top: `${viewportRange.startRatio * 100}%`,
							}}
						/>
					) : null}
					{focusRange ? (
						<div
							aria-hidden="true"
							className="pointer-events-none absolute left-[4.5rem] right-0 z-20 border-t border-red-500/70 transition-[top] duration-150 ease-out motion-reduce:transition-none"
							style={{ top: `${focusRange.startRatio * 100}%` }}
						/>
					) : null}

					<SessionTimelineLane
						blocks={memberBlocks}
						metric={metric}
						modelLabel={modelLabel}
						onSelect={onSelect}
						options={options}
						selectedIndex={selectedIndex}
						timelineHeight={timelineHeight}
					/>
					<SessionTimelineLane
						blocks={modelBlocks}
						metric={metric}
						modelLabel={modelLabel}
						onSelect={onSelect}
						options={options}
						selectedIndex={selectedIndex}
						timelineHeight={timelineHeight}
					/>
					<SessionTimelineContextGraph
						contextPoints={layout.contextPoints}
						onSelect={onSelect}
						selectedIndex={selectedIndex}
						timelineHeight={timelineHeight}
					/>
				</div>
			</div>
		</div>
	);
}
