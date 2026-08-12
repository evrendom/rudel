import {
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import type { SelectedTurnOption } from "./session-selected-turn";
import {
	buildSessionThreadOverviewChart,
	getSessionThreadOverviewIndexAtRatio,
	getSessionThreadOverviewMetricRatio,
	getSessionThreadOverviewViewport,
} from "./session-thread-overview-chart";
import {
	getSessionThreadOverviewTimelineSettings,
	resolveSessionThreadOverviewStripConfig,
	type SessionThreadOverviewStripConfig,
} from "./session-thread-overview-config";
import {
	SessionOverviewAxis,
	SessionOverviewBreakButtons,
	SessionOverviewTurnHitTargets,
} from "./session-thread-overview-strip-layers";
import {
	formatTimelineMoment,
	getBarHeight,
	getChartRatioAtX,
	getChartX,
	getPlotBounds,
	getTurnLabel,
	type SessionOverviewHover,
} from "./session-thread-overview-strip-parts";
import {
	formatElapsedSinceStart,
	formatTimelineMomentWithSeconds,
	getDurationBarGeometry,
	getInputMaximum,
	getInputStairY,
	getOutputMaximum,
	getTurnMarkKinds,
	type SessionOverviewTurnMarkKind,
} from "./session-thread-overview-strip-v2-model";

const TURN_MARK_WIDTH = 1.4;
const TURN_MARK_SPACING = 2.6;

const TURN_MARK_CLASS_NAMES: Record<SessionOverviewTurnMarkKind, string> = {
	edit: "fill-emerald-600 dark:fill-emerald-400",
	error: "fill-red-600 dark:fill-red-400",
	skill: "fill-(--session-overview-text)",
};

// Output-focused variant: bars encode output tokens with width = response
// duration on the timescale, input tokens render as a stepped translucent
// area, and skills/errors/edits are full-height per-turn strips. Reasoning
// and subagents are intentionally not encoded.
export function SessionThreadOverviewStripV2({
	config,
	headerTrailing,
	onSelect,
	options,
	selectedIndex,
	visibleRange,
}: {
	config?: Partial<SessionThreadOverviewStripConfig>;
	headerTrailing?: ReactNode;
	onSelect: (index: number) => void;
	options: readonly SelectedTurnOption[];
	selectedIndex: number;
	visibleRange: readonly [number, number] | undefined;
}) {
	const readoutId = useId();
	const chartPlotRef = useRef<HTMLDivElement>(null);
	// Variant defaults: with the bottom time labels gone the axis sits lower,
	// so the clip area uses nearly the full plot height. Callers can still
	// override via the config prop.
	const resolvedConfig = useMemo(
		() =>
			resolveSessionThreadOverviewStripConfig({
				axisY: 70,
				eventY: 65,
				...config,
			}),
		[config],
	);
	const { plotLeft, plotRight } = getPlotBounds(resolvedConfig);
	const chartOptions = useMemo(
		() =>
			options.map((option) => ({
				...option,
				reasoningCount: 0,
				subagentCount: 0,
			})),
		[options],
	);
	const chart = useMemo(
		() =>
			buildSessionThreadOverviewChart(
				chartOptions,
				[],
				getSessionThreadOverviewTimelineSettings(resolvedConfig),
			),
		[chartOptions, resolvedConfig],
	);
	const [hover, setHover] = useState<SessionOverviewHover | undefined>();
	const [focusedIndex, setFocusedIndex] = useState<number | undefined>();
	const outputMaximum = useMemo(
		() => getOutputMaximum(chart.rows),
		[chart.rows],
	);
	const inputMaximum = useMemo(() => getInputMaximum(chart.rows), [chart.rows]);
	const selectedRow = chart.rows.find((row) => row.index === selectedIndex);
	const selectedOption = options[selectedIndex];
	const reportedViewport = getSessionThreadOverviewViewport(
		chart.rows,
		visibleRange,
	);
	const viewport =
		reportedViewport ??
		(selectedRow
			? {
					xEndRatio: selectedRow.xRatio,
					xStartRatio: selectedRow.xRatio,
				}
			: undefined);
	const rawViewportStartX = viewport
		? getChartX(viewport.xStartRatio, resolvedConfig)
		: 0;
	const rawViewportEndX = viewport
		? getChartX(viewport.xEndRatio, resolvedConfig)
		: 0;
	const viewportCenterX = (rawViewportStartX + rawViewportEndX) / 2;
	const viewportWidth = viewport
		? Math.max(
				rawViewportEndX - rawViewportStartX,
				resolvedConfig.minimumViewportWidth,
			)
		: 0;
	const viewportStartX = Math.min(
		Math.max(viewportCenterX - viewportWidth / 2, plotLeft),
		plotRight - viewportWidth,
	);
	const readout =
		hover ??
		(focusedIndex === undefined
			? undefined
			: (() => {
					const focusedRow = chart.rows.find(
						(row) => row.index === focusedIndex,
					);
					return focusedRow
						? { index: focusedRow.index, xRatio: focusedRow.xRatio }
						: undefined;
				})());
	const hoverTimestamp = hover ? chart.unprojectRatio(hover.xRatio) : undefined;
	const hoverElapsedMs =
		hoverTimestamp !== undefined && chart.axisStartTimestamp !== undefined
			? hoverTimestamp - chart.axisStartTimestamp
			: undefined;

	function getPointerRatio(event: PointerEvent<HTMLDivElement>) {
		const bounds = chartPlotRef.current?.getBoundingClientRect();
		if (!bounds || bounds.width <= 0) {
			return undefined;
		}
		return getChartRatioAtX(
			((event.clientX - bounds.left) / bounds.width) *
				resolvedConfig.chartWidth,
			resolvedConfig,
		);
	}

	function updateHoverAtPointer(event: PointerEvent<HTMLDivElement>) {
		if (!resolvedConfig.showCrosshair) {
			return;
		}
		const xRatio = getPointerRatio(event);
		if (xRatio === undefined) {
			return;
		}
		const index = getSessionThreadOverviewIndexAtRatio(chart.rows, xRatio);
		if (index !== undefined) {
			setHover({ index, xRatio });
		}
	}

	function scrubAtPointer(event: PointerEvent<HTMLDivElement>) {
		const xRatio = getPointerRatio(event);
		if (xRatio === undefined) {
			return;
		}
		const index = getSessionThreadOverviewIndexAtRatio(chart.rows, xRatio);
		if (index !== undefined) {
			onSelect(index);
		}
	}

	function handleViewportKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
			return;
		}
		event.preventDefault();
		onSelect(
			Math.min(
				Math.max(selectedIndex + (event.key === "ArrowRight" ? 1 : -1), 0),
				Math.max(chart.rows.length - 1, 0),
			),
		);
	}

	return (
		<section
			aria-label="Session activity map (output focus)"
			className="@container h-28 shrink-0 border-b border-(--session-overview-border) bg-(--session-overview-surface)"
		>
			<div
				id={readoutId}
				className="relative h-6 shrink-0 border-b border-(--session-overview-border)"
			>
				<div className="absolute inset-y-0 left-3 right-3">
					{chart.axisStartTimestamp !== undefined ? (
						<span
							className={cn(
								"absolute top-1/2 left-0 -translate-y-1/2 font-mono text-[0.5625rem] whitespace-nowrap text-(--session-overview-subtle) tabular-nums transition-opacity duration-150 motion-reduce:transition-none",
								hover && "opacity-0",
							)}
						>
							{formatTimelineMoment(chart.axisStartTimestamp)}
						</span>
					) : null}
					{chart.axisEndTimestamp !== undefined ? (
						<span
							className={cn(
								"absolute top-1/2 right-0 -translate-y-1/2 font-mono text-[0.5625rem] whitespace-nowrap text-(--session-overview-subtle) tabular-nums transition-opacity duration-150 motion-reduce:transition-none",
								hover && "opacity-0",
							)}
						>
							{formatTimelineMoment(chart.axisEndTimestamp)}
						</span>
					) : null}
					{hover && hoverTimestamp !== undefined ? (
						<div
							aria-hidden="true"
							className="pointer-events-none absolute top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 bg-(--session-overview-surface) px-1 font-mono text-[0.5625rem] font-medium whitespace-nowrap text-(--session-overview-text) tabular-nums"
							style={{
								left: `${(Math.min(Math.max(getChartX(hover.xRatio, resolvedConfig), 70), resolvedConfig.chartWidth - 70) / resolvedConfig.chartWidth) * 100}%`,
							}}
						>
							{formatTimelineMomentWithSeconds(hoverTimestamp)}
							{hoverElapsedMs !== undefined ? (
								<span className="text-(--session-overview-muted)">
									{" "}
									{formatElapsedSinceStart(hoverElapsedMs)}
								</span>
							) : null}
						</div>
					) : null}
				</div>
				{headerTrailing ? (
					<div className="absolute inset-y-0 left-1/2 z-30 flex -translate-x-1/2 items-center">
						{headerTrailing}
					</div>
				) : null}
			</div>

			<div
				className="relative h-[5.5rem] min-w-0 overflow-hidden"
				onPointerLeave={() => setHover(undefined)}
				onPointerMove={updateHoverAtPointer}
			>
				<div ref={chartPlotRef} className="absolute inset-y-0 left-3 right-3">
					<svg
						aria-hidden="true"
						className="h-full w-full"
						preserveAspectRatio="none"
						viewBox={`0 0 ${resolvedConfig.chartWidth} ${resolvedConfig.chartHeight}`}
					>
						{resolvedConfig.showViewportBand && viewport ? (
							<rect
								className="fill-[color-mix(in_srgb,var(--session-overview-accent)_9%,transparent)] stroke-[color-mix(in_srgb,var(--session-overview-accent)_38%,transparent)]"
								height={resolvedConfig.eventY + 5}
								rx="2"
								strokeWidth="1"
								vectorEffect="non-scaling-stroke"
								width={viewportWidth}
								x={viewportStartX}
								y="2"
							/>
						) : null}

						<SessionOverviewAxis
							config={resolvedConfig}
							ticks={resolvedConfig.showTicks ? chart.ticks : []}
						/>

						{chart.rows.map((row) => {
							const geometry = getDurationBarGeometry(row, resolvedConfig);
							const clipTop = 2;
							const clipHeight = resolvedConfig.axisY - clipTop;
							const inputY = getInputStairY(
								row.inputTokens,
								inputMaximum,
								resolvedConfig,
							);
							const barHeight = getBarHeight(
								getSessionThreadOverviewMetricRatio(
									row,
									"output",
									outputMaximum,
									resolvedConfig.barScale,
								),
								resolvedConfig,
							);
							const selected = row.index === selectedIndex;
							return (
								<g key={row.index}>
									<rect
										className={cn(
											"fill-[color-mix(in_srgb,var(--session-overview-accent)_7%,var(--session-overview-surface))]",
											selected
												? "stroke-(--session-overview-accent)"
												: "stroke-(--session-overview-border)",
										)}
										height={clipHeight}
										rx="1.5"
										strokeWidth={selected ? 1.5 : 1}
										vectorEffect="non-scaling-stroke"
										width={geometry.width}
										x={geometry.x}
										y={clipTop}
									/>
									{row.inputTokens !== undefined &&
									inputY < resolvedConfig.axisY ? (
										<>
											<rect
												className="fill-orange-500/15 dark:fill-orange-400/15"
												height={resolvedConfig.axisY - inputY}
												width={geometry.width}
												x={geometry.x}
												y={inputY}
											/>
											<path
												d={`M ${geometry.x} ${inputY} H ${geometry.x + geometry.width}`}
												className="stroke-orange-500/70 dark:stroke-orange-400/70"
												strokeWidth="1"
												vectorEffect="non-scaling-stroke"
											/>
										</>
									) : null}
									{barHeight > 0 ? (
										<>
											<rect
												className="fill-[color-mix(in_srgb,var(--session-overview-accent)_14%,transparent)]"
												height={barHeight}
												width={geometry.width}
												x={geometry.x}
												y={resolvedConfig.axisY - barHeight}
											/>
											<path
												d={`M ${geometry.x} ${resolvedConfig.axisY - barHeight} H ${geometry.x + geometry.width}`}
												className="stroke-[color-mix(in_srgb,var(--session-overview-accent)_55%,transparent)]"
												strokeWidth="1"
												vectorEffect="non-scaling-stroke"
											/>
										</>
									) : null}
									{getTurnMarkKinds(row)
										.filter((kind) =>
											kind === "error"
												? resolvedConfig.showErrorTicks
												: resolvedConfig.showEventGlyphs,
										)
										.map((kind, markIndex, kinds) => {
											const centerX = geometry.x + geometry.width / 2;
											const offset =
												(markIndex - (kinds.length - 1) / 2) *
												TURN_MARK_SPACING;
											return (
												<rect
													key={kind}
													className={TURN_MARK_CLASS_NAMES[kind]}
													height={resolvedConfig.axisY - 2}
													width={TURN_MARK_WIDTH}
													x={centerX + offset - TURN_MARK_WIDTH / 2}
													y={2}
												/>
											);
										})}
								</g>
							);
						})}

						{selectedRow ? (
							<path
								d={`M ${getChartX(selectedRow.xRatio, resolvedConfig)} 2 V ${resolvedConfig.eventY + 5}`}
								className="stroke-(--session-overview-accent) opacity-45"
								strokeDasharray="2 2"
								strokeWidth="1.25"
								vectorEffect="non-scaling-stroke"
							/>
						) : null}

						{resolvedConfig.showCrosshair && readout ? (
							<path
								d={`M ${getChartX(readout.xRatio, resolvedConfig)} 2 V ${resolvedConfig.eventY + 5}`}
								className="stroke-[color-mix(in_srgb,var(--session-overview-text)_28%,transparent)]"
								vectorEffect="non-scaling-stroke"
							/>
						) : null}
					</svg>

					<SessionOverviewTurnHitTargets
						config={resolvedConfig}
						onFocusIndexChange={setFocusedIndex}
						onSelect={onSelect}
						options={options}
						readoutId={readoutId}
						readoutIndex={readout?.index}
						rows={chart.rows}
						selectedIndex={selectedIndex}
					/>

					{resolvedConfig.showViewportBand && viewport ? (
						<div
							role="slider"
							aria-label="Visible transcript range"
							aria-valuemax={Math.max(chart.rows.length - 1, 0)}
							aria-valuemin={0}
							aria-valuenow={selectedIndex}
							aria-valuetext={
								selectedOption ? getTurnLabel(selectedOption) : "Session start"
							}
							className="absolute top-0.5 bottom-3.5 z-20 cursor-ew-resize touch-none rounded-[2px] outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)"
							style={{
								left: `${(viewportStartX / resolvedConfig.chartWidth) * 100}%`,
								width: `${(viewportWidth / resolvedConfig.chartWidth) * 100}%`,
							}}
							tabIndex={0}
							onKeyDown={handleViewportKeyDown}
							onPointerDown={(event) => {
								event.preventDefault();
								event.currentTarget.setPointerCapture(event.pointerId);
								scrubAtPointer(event);
							}}
							onPointerMove={(event) => {
								if (event.currentTarget.hasPointerCapture(event.pointerId)) {
									scrubAtPointer(event);
								}
							}}
						/>
					) : null}

					{resolvedConfig.showBreaks ? (
						<SessionOverviewBreakButtons
							breaks={chart.breaks}
							config={resolvedConfig}
						/>
					) : null}
				</div>
			</div>
		</section>
	);
}
