import {
	type BarCustomLayerProps,
	type BarTooltipProps,
	ResponsiveBar,
} from "@nivo/bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { DashboardMetricColorFamily } from "@/features/dashboard/data/dashboard-metric-colors";
import {
	getSidebarShellDebugState,
	SIDEBAR_NEWS_ACTIVE_ATTRIBUTE,
} from "@/features/shell/config/sidebar-shell-debug";

export type DashboardPerformanceDatum = {
	id: string;
	axisLabel: string;
	fullLabel: string;
	isPlaceholder: boolean;
	metricValue: number | null;
};

type DashboardPerformanceChartProps = {
	colors: DashboardMetricColorFamily;
	data: DashboardPerformanceDatum[];
	metricLabel: string;
};

type DashboardPerformanceChartRow = {
	id: string;
	axisLabel: string;
	fullLabel: string;
	placeholder: 0 | 1;
	metricValue: number;
	rawMetricValue: number;
};

type PlaceholderTooltipState = {
	datum: DashboardPerformanceDatum;
	left: number;
	top: number;
};

function DashboardPerformanceTooltipContent({
	fullLabel,
	metricLabel,
	metricValue,
}: {
	fullLabel: string;
	metricLabel: string;
	metricValue: number | null;
}) {
	return (
		<div className="grid min-w-40 gap-1.5 rounded-2xl border border-border/60 bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
			<div className="font-medium text-foreground">{fullLabel}</div>
			<div className="flex items-center justify-between gap-3">
				<span className="text-muted-foreground">{metricLabel}</span>
				<span className="font-mono font-semibold tabular-nums text-foreground">
					{metricValue == null ? "No data" : metricValue}
				</span>
			</div>
		</div>
	);
}

function useSidebarNewsCardActive() {
	const [isActive, setIsActive] = useState(false);

	useEffect(() => {
		const preview = document.querySelector(".dashboard-01-preview");
		if (!(preview instanceof HTMLElement)) {
			return;
		}

		const sync = () => {
			setIsActive(
				preview.getAttribute(SIDEBAR_NEWS_ACTIVE_ATTRIBUTE) === "true",
			);
		};

		sync();

		const observer = new MutationObserver(sync);
		observer.observe(preview, {
			attributes: true,
			attributeFilter: [SIDEBAR_NEWS_ACTIVE_ATTRIBUTE],
		});

		return () => observer.disconnect();
	}, []);

	return isActive;
}

export function DashboardPerformanceChart({
	colors,
	data,
	metricLabel,
}: DashboardPerformanceChartProps) {
	const [searchParams] = useSearchParams();
	const debugState = getSidebarShellDebugState(searchParams);
	const containerRef = useRef<HTMLDivElement>(null);
	const [placeholderTooltip, setPlaceholderTooltip] =
		useState<PlaceholderTooltipState | null>(null);
	const isSidebarNewsCardActive = useSidebarNewsCardActive();
	const shouldDisableInteractiveLayers =
		debugState.tuning.newsDisableChartInteractiveLayersWhileActive &&
		isSidebarNewsCardActive;

	const semanticDataById = useMemo(
		() => new Map(data.map((entry) => [entry.id, entry] as const)),
		[data],
	);

	const chartData = useMemo<DashboardPerformanceChartRow[]>(
		() =>
			data.map((entry) => ({
				id: entry.id,
				axisLabel: entry.axisLabel,
				fullLabel: entry.fullLabel,
				placeholder: entry.isPlaceholder ? 1 : 0,
				metricValue: entry.metricValue ?? 0,
				rawMetricValue: entry.metricValue ?? -1,
			})),
		[data],
	);

	const axisLabelById = useMemo(
		() => new Map(data.map((entry) => [entry.id, entry.axisLabel] as const)),
		[data],
	);

	const hidePlaceholderTooltip = useCallback(() => {
		setPlaceholderTooltip(null);
	}, []);

	const updatePlaceholderTooltip = useCallback(
		(
			event: React.MouseEvent<Element, MouseEvent>,
			barDatum: DashboardPerformanceChartRow,
		) => {
			const bounds = containerRef.current?.getBoundingClientRect();
			const semanticDatum = semanticDataById.get(barDatum.id);

			if (!bounds || !semanticDatum) {
				return;
			}

			setPlaceholderTooltip({
				datum: semanticDatum,
				left: event.clientX - bounds.left,
				top: event.clientY - bounds.top,
			});
		},
		[semanticDataById],
	);

	const placeholderLayer = useCallback(
		({
			bars,
			innerHeight,
		}: BarCustomLayerProps<DashboardPerformanceChartRow>) => {
			const placeholderHeight = Math.min(
				innerHeight,
				Math.max(26, innerHeight * 0.34),
			);

			return (
				<g>
					{bars.map((bar) => {
						if (bar.data.data.placeholder !== 1) {
							return null;
						}

						const horizontalInset = Math.min(10, bar.width * 0.12);
						const rectWidth = Math.max(bar.width - horizontalInset, 10);
						const rectX = bar.x + horizontalInset / 2;
						const baselineY = bar.y + bar.height;
						const rectY = baselineY - placeholderHeight;
						const radius = Math.min(14, rectWidth / 2, placeholderHeight / 2);
						const semanticDatum = semanticDataById.get(bar.data.data.id);

						if (!semanticDatum) {
							return null;
						}

						return (
							<g key={`placeholder-${bar.data.data.id}`}>
								<rect
									x={rectX}
									y={rectY}
									width={rectWidth}
									height={placeholderHeight}
									rx={radius}
									ry={radius}
									fill="var(--muted)"
									fillOpacity={0.7}
									stroke="var(--border)"
									strokeDasharray="7 6"
									strokeWidth={2}
								/>
								{shouldDisableInteractiveLayers ? null : (
									<foreignObject
										x={rectX}
										y={rectY}
										width={rectWidth}
										height={placeholderHeight}
									>
										<button
											type="button"
											className="h-full w-full cursor-default border-0 bg-transparent p-0 opacity-0"
											aria-label={`${semanticDatum.fullLabel}: no data for ${metricLabel}`}
											onMouseEnter={(event) =>
												updatePlaceholderTooltip(event, bar.data.data)
											}
											onMouseMove={(event) =>
												updatePlaceholderTooltip(event, bar.data.data)
											}
											onMouseLeave={hidePlaceholderTooltip}
											onFocus={() =>
												setPlaceholderTooltip({
													datum: semanticDatum,
													left: rectX + rectWidth / 2,
													top: rectY,
												})
											}
											onBlur={hidePlaceholderTooltip}
										/>
									</foreignObject>
								)}
							</g>
						);
					})}
				</g>
			);
		},
		[
			hidePlaceholderTooltip,
			metricLabel,
			semanticDataById,
			shouldDisableInteractiveLayers,
			updatePlaceholderTooltip,
		],
	);

	return (
		<div ref={containerRef} className="relative h-full w-full">
			<ResponsiveBar<DashboardPerformanceChartRow>
				data={chartData}
				keys={["metricValue"]}
				indexBy="id"
				margin={{ top: 8, right: 6, bottom: 32, left: 42 }}
				padding={0.28}
				groupMode="grouped"
				layout="vertical"
				valueScale={{ type: "linear", min: 0, max: 100, nice: false }}
				indexScale={{ type: "band", round: false }}
				animate
				motionConfig="gentle"
				borderRadius={12}
				enableGridY={false}
				enableGridX={false}
				enableLabel={false}
				isInteractive={!shouldDisableInteractiveLayers}
				axisTop={null}
				axisRight={null}
				axisBottom={{
					tickSize: 0,
					tickPadding: 12,
					format: (value) => axisLabelById.get(String(value)) ?? "",
				}}
				axisLeft={{
					tickValues: [0, 20, 40, 60, 80, 100],
					tickSize: 0,
					tickPadding: 12,
				}}
				colors={(datum) =>
					datum.data.placeholder === 1 ? "transparent" : colors.chartMain
				}
				theme={{
					axis: {
						domain: {
							line: {
								strokeWidth: 0,
							},
						},
						ticks: {
							line: {
								strokeWidth: 0,
							},
							text: {
								fill: "#9A9A9A",
								fontFamily: "Nunito",
								fontSize: 13,
								fontStyle: "normal",
								fontWeight: 800,
								letterSpacing: "-0.01em",
								lineHeight: "16px",
							},
						},
					},
					grid: {
						line: {
							strokeWidth: 0,
						},
					},
				}}
				tooltip={
					shouldDisableInteractiveLayers
						? undefined
						: (datum: BarTooltipProps<DashboardPerformanceChartRow>) => (
								<DashboardPerformanceTooltipContent
									fullLabel={datum.data.fullLabel}
									metricLabel={metricLabel}
									metricValue={
										datum.data.placeholder === 1
											? null
											: datum.data.rawMetricValue
									}
								/>
							)
				}
				layers={["axes", placeholderLayer, "bars"]}
				role="img"
				ariaLabel={`${metricLabel} team member performance`}
			/>

			{!shouldDisableInteractiveLayers && placeholderTooltip ? (
				<div
					className="pointer-events-none absolute z-20"
					style={{
						left: placeholderTooltip.left,
						top: placeholderTooltip.top,
						transform: "translate(-50%, calc(-100% - 12px))",
					}}
				>
					<DashboardPerformanceTooltipContent
						fullLabel={placeholderTooltip.datum.fullLabel}
						metricLabel={metricLabel}
						metricValue={placeholderTooltip.datum.metricValue}
					/>
				</div>
			) : null}
		</div>
	);
}
