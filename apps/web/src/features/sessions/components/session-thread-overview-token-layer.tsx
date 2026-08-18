import { useMemo } from "react";
import type { SessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import {
	buildLivelineSignal,
	type SessionOverviewLivelineSignal,
} from "./session-thread-overview-liveline-geometry";
import type { SessionOverviewCallSeries } from "./session-thread-overview-model";
import {
	getChartX,
	getPlotBounds,
} from "./session-thread-overview-strip-utils";
import type { SessionThreadOverviewBreak } from "./session-thread-overview-timeline";

type LivelineTone = "accent" | "context";

type LivelineSeriesLayer = {
	gradientId: string;
	signal: SessionOverviewLivelineSignal;
	tone: LivelineTone;
};

function ContextUtilizationGradients({
	gradientId,
	signal,
}: Pick<LivelineSeriesLayer, "gradientId" | "signal">) {
	return (
		<>
			<linearGradient
				id={gradientId}
				gradientUnits="userSpaceOnUse"
				x1="0"
				x2="0"
				y1={signal.baselineY}
				y2={signal.topY}
			>
				<stop
					className="[stop-color:oklch(0.68_0.16_151)] [stop-opacity:0.3] dark:[stop-color:oklch(0.78_0.15_151)] dark:[stop-opacity:0.26]"
					offset="0%"
				/>
				<stop
					className="[stop-color:oklch(0.72_0.16_133)] [stop-opacity:0.34] dark:[stop-color:oklch(0.8_0.15_133)] dark:[stop-opacity:0.3]"
					offset="34%"
				/>
				<stop
					className="[stop-color:oklch(0.79_0.16_91)] [stop-opacity:0.39] dark:[stop-color:oklch(0.83_0.15_91)] dark:[stop-opacity:0.35]"
					offset="61%"
				/>
				<stop
					className="[stop-color:oklch(0.72_0.19_52)] [stop-opacity:0.45] dark:[stop-color:oklch(0.78_0.18_52)] dark:[stop-opacity:0.4]"
					offset="82%"
				/>
				<stop
					className="[stop-color:oklch(0.62_0.23_25)] [stop-opacity:0.52] dark:[stop-color:oklch(0.72_0.21_25)] dark:[stop-opacity:0.46]"
					offset="100%"
				/>
			</linearGradient>
			<linearGradient
				id={`${gradientId}-stroke`}
				gradientUnits="userSpaceOnUse"
				x1="0"
				x2="0"
				y1={signal.baselineY}
				y2={signal.topY}
			>
				<stop
					className="[stop-color:oklch(0.58_0.17_151)] dark:[stop-color:oklch(0.78_0.15_151)]"
					offset="0%"
				/>
				<stop
					className="[stop-color:oklch(0.64_0.17_133)] dark:[stop-color:oklch(0.8_0.15_133)]"
					offset="34%"
				/>
				<stop
					className="[stop-color:oklch(0.7_0.17_91)] dark:[stop-color:oklch(0.83_0.15_91)]"
					offset="61%"
				/>
				<stop
					className="[stop-color:oklch(0.64_0.2_52)] dark:[stop-color:oklch(0.78_0.18_52)]"
					offset="82%"
				/>
				<stop
					className="[stop-color:oklch(0.56_0.24_25)] dark:[stop-color:oklch(0.72_0.21_25)]"
					offset="100%"
				/>
			</linearGradient>
		</>
	);
}

function LivelineGradient({ gradientId, signal, tone }: LivelineSeriesLayer) {
	if (tone === "context") {
		return (
			<ContextUtilizationGradients gradientId={gradientId} signal={signal} />
		);
	}

	return (
		<linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
			<stop
				className="[stop-color:var(--session-overview-accent)] [stop-opacity:0.08] dark:[stop-opacity:0.12]"
				offset="0%"
			/>
			<stop
				className="[stop-color:var(--session-overview-accent)]"
				offset="100%"
				stopOpacity="0"
			/>
		</linearGradient>
	);
}

function LivelineCurve({ gradientId, signal, tone }: LivelineSeriesLayer) {
	return (
		<>
			{signal.areaPath ? (
				<path d={signal.areaPath} fill={`url(#${gradientId})`} />
			) : null}
			{signal.linePath ? (
				<path
					className={
						tone === "accent" ? "stroke-(--session-overview-accent)" : undefined
					}
					d={signal.linePath}
					fill="none"
					stroke={tone === "context" ? `url(#${gradientId}-stroke)` : undefined}
					strokeLinecap="round"
					strokeLinejoin="round"
					strokeWidth="2.5"
					vectorEffect="non-scaling-stroke"
				/>
			) : null}
		</>
	);
}

function LivelineBreakBridges({
	breaks,
	config,
	layer,
}: {
	breaks: readonly SessionThreadOverviewBreak[];
	config: SessionThreadOverviewStripConfig;
	layer: LivelineSeriesLayer;
}) {
	const { plotLeft, plotRight } = getPlotBounds(config);
	return breaks.flatMap((gap) => {
		const visibleStartRatio = Math.max(
			gap.xStartRatio,
			config.xDomainStartRatio,
		);
		const visibleEndRatio = Math.min(gap.xEndRatio, config.xDomainEndRatio);
		if (visibleEndRatio <= visibleStartRatio) {
			return [];
		}

		const rawStartX = getChartX(visibleStartRatio, config);
		const rawEndX = getChartX(visibleEndRatio, config);
		const centerX = (rawStartX + rawEndX) / 2;
		const halfWidth = Math.max((rawEndX - rawStartX) / 2, 6);
		const startX = Math.max(centerX - halfWidth, plotLeft);
		const endX = Math.min(centerX + halfWidth, plotRight);
		if (endX <= startX) {
			return [];
		}
		const path = `M ${startX} ${layer.signal.baselineY} H ${endX}`;

		return [
			<g key={`${layer.gradientId}-${gap.key}`} data-liveline-break-bridge>
				<path
					d={path}
					stroke="var(--session-overview-chart-surface)"
					strokeLinecap="round"
					strokeWidth="5"
					vectorEffect="non-scaling-stroke"
				/>
				<path
					className={
						layer.tone === "accent"
							? "stroke-(--session-overview-accent)"
							: undefined
					}
					d={path}
					fill="none"
					stroke={
						layer.tone === "context"
							? `url(#${layer.gradientId}-stroke)`
							: undefined
					}
					strokeDasharray="2 3"
					strokeLinecap="round"
					strokeWidth="2.5"
					vectorEffect="non-scaling-stroke"
				/>
			</g>,
		];
	});
}

export function SessionThreadOverviewTokenLayer({
	breaks,
	config,
	gradientId,
	plotLeft,
	plotRight,
	series,
}: {
	breaks: readonly SessionThreadOverviewBreak[];
	config: SessionThreadOverviewStripConfig;
	gradientId: string;
	plotLeft: number;
	plotRight: number;
	series: SessionOverviewCallSeries;
}) {
	const signals = useMemo(
		(): readonly LivelineSeriesLayer[] => [
			{
				gradientId: `${gradientId}-input`,
				signal: buildLivelineSignal(series, config),
				tone: "context",
			},
		],
		[config, gradientId, series],
	);
	const gridYs =
		signals[0]?.signal.gridYs ??
		[0.25, 0.5, 0.75].map((ratio) => config.axisY - (config.axisY - 5) * ratio);

	return (
		<g>
			<defs>
				{signals.map((layer) => (
					<LivelineGradient key={layer.gradientId} {...layer} />
				))}
			</defs>
			{gridYs.map((y) => (
				<path
					key={y}
					className="stroke-[color-mix(in_srgb,var(--session-overview-text)_6%,transparent)]"
					d={`M ${plotLeft} ${y} H ${plotRight}`}
					strokeWidth="1"
					vectorEffect="non-scaling-stroke"
				/>
			))}
			{signals.map((layer) => (
				<LivelineCurve key={layer.gradientId} {...layer} />
			))}
			{signals.map((layer) => (
				<LivelineBreakBridges
					key={`${layer.gradientId}-breaks`}
					breaks={breaks}
					config={config}
					layer={layer}
				/>
			))}
		</g>
	);
}
