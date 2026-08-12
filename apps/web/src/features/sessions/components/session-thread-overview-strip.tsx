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
	buildSessionThreadOverviewCumulativeCostPoints,
	buildSessionThreadOverviewMonotonePath,
	DEFAULT_SESSION_THREAD_OVERVIEW_METRIC,
	getSessionSubagentActivityIntervals,
	getSessionSubagentCountsByTurn,
	getSessionThreadOverviewIndexAtRatio,
	getSessionThreadOverviewMetricMaximum,
	getSessionThreadOverviewMetricMedian,
	getSessionThreadOverviewMetricRatio,
	getSessionThreadOverviewMetricValue,
	getSessionThreadOverviewViewport,
	type SessionThreadOverviewMetric,
} from "./session-thread-overview-chart";
import {
	getSessionThreadOverviewTimelineSettings,
	resolveSessionThreadOverviewStripConfig,
	type SessionThreadOverviewStripConfig,
} from "./session-thread-overview-config";
import {
	SessionOverviewAxis,
	SessionOverviewBreakButtons,
	SessionOverviewEndTotal,
	SessionOverviewHeader,
	SessionOverviewMaxMarker,
	SessionOverviewReferenceBand,
	SessionOverviewTickLabels,
	SessionOverviewTurnHitTargets,
} from "./session-thread-overview-strip-layers";
import {
	countReasoningBlocks,
	formatMetricValue,
	getBarHeight,
	getChartRatioAtX,
	getChartX,
	getCostLineY,
	getCumulativeCostAtRatio,
	getPlotBounds,
	getTurnLabel,
	type SessionOverviewHover,
	SessionOverviewReadout,
	SessionTurnEventGlyphs,
} from "./session-thread-overview-strip-parts";

export function SessionThreadOverviewStrip({
	config,
	headerTrailing,
	onSelect,
	options,
	selectedIndex,
	subagents,
	visibleRange,
}: {
	config?: Partial<SessionThreadOverviewStripConfig>;
	headerTrailing?: ReactNode;
	onSelect: (index: number) => void;
	options: readonly SelectedTurnOption[];
	selectedIndex: number;
	subagents: Readonly<Record<string, string>>;
	visibleRange: readonly [number, number] | undefined;
}) {
	const readoutId = useId();
	const chartPlotRef = useRef<HTMLDivElement>(null);
	const resolvedConfig = useMemo(
		() => resolveSessionThreadOverviewStripConfig(config),
		[config],
	);
	const { plotLeft, plotRight } = getPlotBounds(resolvedConfig);
	const subagentCounts = useMemo(
		() => getSessionSubagentCountsByTurn(options, subagents),
		[options, subagents],
	);
	const subagentIntervals = useMemo(
		() => getSessionSubagentActivityIntervals(subagents),
		[subagents],
	);
	const chartOptions = useMemo(
		() =>
			options.map((option, index) => ({
				...option,
				reasoningCount: countReasoningBlocks(option),
				subagentCount: subagentCounts[index] ?? 0,
			})),
		[options, subagentCounts],
	);
	const chart = useMemo(
		() =>
			buildSessionThreadOverviewChart(
				chartOptions,
				subagentIntervals,
				getSessionThreadOverviewTimelineSettings(resolvedConfig),
			),
		[chartOptions, resolvedConfig, subagentIntervals],
	);
	const [activeMetric, setActiveMetric] = useState<SessionThreadOverviewMetric>(
		DEFAULT_SESSION_THREAD_OVERVIEW_METRIC,
	);
	const [hover, setHover] = useState<SessionOverviewHover | undefined>();
	const [focusedIndex, setFocusedIndex] = useState<number | undefined>();
	const maximumMetricValue = getSessionThreadOverviewMetricMaximum(
		chart.rows,
		activeMetric,
	);
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
	const cumulativeCostPoints = useMemo(
		() => buildSessionThreadOverviewCumulativeCostPoints(chart.rows),
		[chart.rows],
	);
	const cumulativeCostMaximum =
		cumulativeCostPoints.at(-1)?.cumulativeCost ?? 0;
	const cumulativeCostPath = useMemo(() => {
		if (cumulativeCostMaximum <= 0) {
			return "";
		}
		return buildSessionThreadOverviewMonotonePath([
			{ x: plotLeft, y: resolvedConfig.costLineBottom },
			...cumulativeCostPoints.map((point) => ({
				x: getChartX(point.xRatio, resolvedConfig),
				y: getCostLineY(
					point.cumulativeCost,
					cumulativeCostMaximum,
					resolvedConfig,
				),
			})),
		]);
	}, [cumulativeCostMaximum, cumulativeCostPoints, plotLeft, resolvedConfig]);
	const focusedRow =
		focusedIndex === undefined
			? undefined
			: chart.rows.find((row) => row.index === focusedIndex);
	const readout =
		hover ??
		(focusedRow
			? { index: focusedRow.index, xRatio: focusedRow.xRatio }
			: undefined);
	const readoutRow = readout
		? chart.rows.find((row) => row.index === readout.index)
		: undefined;
	const readoutOption = readout ? options[readout.index] : undefined;
	const crosshairXRatio =
		readout === undefined
			? undefined
			: resolvedConfig.crosshairMode === "snap"
				? (readoutRow?.xRatio ?? readout.xRatio)
				: readout.xRatio;
	const crosshairCost =
		crosshairXRatio === undefined
			? 0
			: resolvedConfig.crosshairMode === "snap"
				? (cumulativeCostPoints.find((point) => point.index === readout?.index)
						?.cumulativeCost ?? 0)
				: getCumulativeCostAtRatio(cumulativeCostPoints, crosshairXRatio);
	const medianMetricValue = resolvedConfig.showReferenceBand
		? getSessionThreadOverviewMetricMedian(chart.rows, activeMetric)
		: undefined;
	const medianBarHeight =
		medianMetricValue === undefined || maximumMetricValue <= 0
			? undefined
			: getBarHeight(
					resolvedConfig.barScale === "sqrt"
						? Math.sqrt(medianMetricValue / maximumMetricValue)
						: medianMetricValue / maximumMetricValue,
					resolvedConfig,
				);
	const maximumRow = resolvedConfig.showMaxMarker
		? chart.rows.find(
				(row) =>
					getSessionThreadOverviewMetricValue(row, activeMetric) ===
						maximumMetricValue && maximumMetricValue > 0,
			)
		: undefined;
	const tokenBarWidth = Math.min(
		Math.max(
			resolvedConfig.barWidthBudget / Math.max(chart.rows.length, 1),
			resolvedConfig.barWidthMin,
		),
		resolvedConfig.barWidthMax,
	);

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
			aria-label="Session activity map"
			className="@container h-28 shrink-0 border-b border-(--session-overview-border) bg-(--session-overview-surface)"
		>
			<SessionOverviewHeader
				activeMetric={activeMetric}
				chart={chart}
				onMetricChange={setActiveMetric}
				trailing={headerTrailing}
			/>

			<div
				className="relative h-[4.75rem] min-w-0 overflow-hidden"
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

						{medianBarHeight !== undefined ? (
							<SessionOverviewReferenceBand
								barHeight={medianBarHeight}
								config={resolvedConfig}
							/>
						) : null}

						{chart.rows.map((row) => {
							const x = getChartX(row.xRatio, resolvedConfig);
							const barHeight = getBarHeight(
								getSessionThreadOverviewMetricRatio(
									row,
									activeMetric,
									maximumMetricValue,
									resolvedConfig.barScale,
								),
								resolvedConfig,
							);
							const selected = row.index === selectedIndex;
							const errorY =
								resolvedConfig.errorPlacement === "fixed-lane"
									? Math.max(
											resolvedConfig.axisY - resolvedConfig.maxBarHeight - 6,
											3,
										)
									: Math.max(3, resolvedConfig.axisY - barHeight - 4);
							return (
								<g key={row.index}>
									{barHeight > 0 ? (
										<rect
											className={cn(
												selected && "stroke-(--session-overview-accent)",
											)}
											height={barHeight}
											rx="1.5"
											strokeWidth={selected ? 1.5 : 0}
											style={{
												fill: `color-mix(in srgb, var(--session-overview-accent) ${resolvedConfig.barAccentMix}%, var(--session-overview-surface))`,
											}}
											vectorEffect="non-scaling-stroke"
											width={tokenBarWidth}
											x={x - tokenBarWidth / 2}
											y={resolvedConfig.axisY - barHeight}
										/>
									) : null}
									{resolvedConfig.showErrorTicks && row.errorCount > 0 ? (
										<path
											d={`M ${x - resolvedConfig.errorTickHalfWidth} ${errorY} H ${x + resolvedConfig.errorTickHalfWidth}`}
											className="stroke-red-600 dark:stroke-red-400"
											strokeLinecap="round"
											strokeWidth={resolvedConfig.errorTickStroke}
											vectorEffect="non-scaling-stroke"
										/>
									) : null}
									{resolvedConfig.showEventGlyphs ? (
										<SessionTurnEventGlyphs
											config={resolvedConfig}
											row={row}
											x={x}
										/>
									) : null}
								</g>
							);
						})}

						{maximumRow ? (
							<SessionOverviewMaxMarker
								barHeight={getBarHeight(
									getSessionThreadOverviewMetricRatio(
										maximumRow,
										activeMetric,
										maximumMetricValue,
										resolvedConfig.barScale,
									),
									resolvedConfig,
								)}
								config={resolvedConfig}
								label={formatMetricValue(maximumMetricValue, activeMetric)}
								x={getChartX(maximumRow.xRatio, resolvedConfig)}
							/>
						) : null}

						{resolvedConfig.showCostLine && cumulativeCostPath ? (
							<path
								d={cumulativeCostPath}
								className="fill-none stroke-(--session-overview-accent)"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={resolvedConfig.costLineWidth}
								style={{ opacity: resolvedConfig.costLineOpacity }}
								vectorEffect="non-scaling-stroke"
							/>
						) : null}

						{resolvedConfig.showEndTotal &&
						resolvedConfig.showCostLine &&
						cumulativeCostMaximum > 0 ? (
							<SessionOverviewEndTotal
								config={resolvedConfig}
								total={cumulativeCostMaximum}
							/>
						) : null}

						{selectedRow ? (
							<path
								d={`M ${getChartX(selectedRow.xRatio, resolvedConfig)} 2 V ${resolvedConfig.eventY + 5}`}
								className="stroke-(--session-overview-accent) opacity-45"
								strokeDasharray="2 2"
								strokeWidth="1.25"
								vectorEffect="non-scaling-stroke"
							/>
						) : null}

						{resolvedConfig.showCrosshair &&
						readout &&
						crosshairXRatio !== undefined ? (
							<>
								<path
									d={`M ${getChartX(crosshairXRatio, resolvedConfig)} 2 V ${resolvedConfig.eventY + 5}`}
									className="stroke-[color-mix(in_srgb,var(--session-overview-text)_28%,transparent)]"
									vectorEffect="non-scaling-stroke"
								/>
								{resolvedConfig.showCostLine && cumulativeCostMaximum > 0 ? (
									<circle
										className="fill-(--session-overview-accent) stroke-(--session-overview-surface)"
										cx={getChartX(crosshairXRatio, resolvedConfig)}
										cy={getCostLineY(
											crosshairCost,
											cumulativeCostMaximum,
											resolvedConfig,
										)}
										r="2.75"
										strokeWidth="1.25"
										vectorEffect="non-scaling-stroke"
									/>
								) : null}
							</>
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

					{resolvedConfig.showCrosshair &&
					readout &&
					readoutRow &&
					readoutOption ? (
						<SessionOverviewReadout
							activeMetric={activeMetric}
							config={resolvedConfig}
							option={readoutOption}
							readoutId={readoutId}
							row={readoutRow}
							xRatio={readout.xRatio}
						/>
					) : null}

					{resolvedConfig.showTicks ? (
						<SessionOverviewTickLabels
							config={resolvedConfig}
							ticks={chart.ticks}
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
