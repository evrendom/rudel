import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAnalyticsTracking } from "@/hooks/useDashboardAnalytics";
import { cn } from "@/lib/utils";

export interface TokenDataPoint {
	messageIndex: number;
	inputTokens: number;
	outputTokens: number;
}

interface TokenUsageChartProps {
	data: TokenDataPoint[];
	totalMessages: number;
	activeMessageIndex: number;
	onClickMessage: (messageIndex: number) => void;
	className?: string;
}

const CHART_HEIGHT = 160;
const AXIS_Y = CHART_HEIGHT / 2;
const BAR_HALF_HEIGHT = AXIS_Y - 4;
const LEFT_MARGIN = 40; // pixels for Y-axis labels

function formatTokenCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
	return String(n);
}

export function TokenUsageChart({
	data,
	totalMessages,
	activeMessageIndex,
	onClickMessage,
	className,
}: TokenUsageChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [chartWidth, setChartWidth] = useState(400);
	const { trackDrilldown } = useAnalyticsTracking();

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) setChartWidth(entry.contentRect.width);
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const drawWidth = chartWidth - LEFT_MARGIN;

	const { maxInput, maxOutput } = useMemo(() => {
		let maxIn = 0;
		let maxOut = 0;
		for (const d of data) {
			if (d.inputTokens > maxIn) maxIn = d.inputTokens;
			if (d.outputTokens > maxOut) maxOut = d.outputTokens;
		}
		return { maxInput: maxIn || 1, maxOutput: maxOut || 1 };
	}, [data]);

	const totalInput = useMemo(
		() => data.reduce((sum, d) => sum + d.inputTokens, 0),
		[data],
	);
	const totalOutput = useMemo(
		() => data.reduce((sum, d) => sum + d.outputTokens, 0),
		[data],
	);

	const handleClick = useCallback(
		(e: React.MouseEvent<SVGSVGElement>) => {
			if (totalMessages === 0) return;

			const svg = e.currentTarget;
			const rect = svg.getBoundingClientRect();
			const px = e.clientX - rect.left - LEFT_MARGIN;
			const fraction = px / drawWidth;

			let closest = data[0];
			let closestDist = Infinity;
			for (const d of data) {
				const dx = Math.abs(d.messageIndex / totalMessages - fraction);
				if (dx < closestDist) {
					closestDist = dx;
					closest = d;
				}
			}
			if (closest) {
				trackDrilldown({
					drilldownMethod: "chart_click",
					sourceComponent: "token_usage_chart",
					targetType: "message",
					targetId: String(closest.messageIndex),
				});
				onClickMessage(closest.messageIndex);
			}
		},
		[data, totalMessages, drawWidth, onClickMessage, trackDrilldown],
	);

	if (data.length === 0) {
		return (
			<div className={cn("text-xs text-muted text-center py-4", className)}>
				No token data
			</div>
		);
	}

	const cursorX =
		LEFT_MARGIN +
		(totalMessages > 0 ? activeMessageIndex / totalMessages : 0) * drawWidth;

	const barWidth = Math.max(2, (drawWidth / totalMessages) * 0.8);

	return (
		<div className={className}>
			<div className="text-xs font-medium text-muted mb-2">Token Usage</div>

			<div className="flex justify-between text-[10px] text-muted mb-1">
				<span>In: {totalInput.toLocaleString()}</span>
				<span>Out: {totalOutput.toLocaleString()}</span>
			</div>

			<div ref={containerRef}>
				{/* biome-ignore lint/a11y/useKeyWithClickEvents: chart click navigation */}
				<svg
					viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
					className="w-full cursor-pointer"
					style={{ height: `${CHART_HEIGHT}px` }}
					onClick={handleClick}
					role="img"
					aria-label="Token usage chart showing input and output tokens per message"
				>
					{/* Y-axis labels */}
					<text
						x={LEFT_MARGIN - 4}
						y={10}
						textAnchor="end"
						className="fill-muted"
						fontSize="9"
					>
						{formatTokenCount(maxInput)}
					</text>
					<text
						x={LEFT_MARGIN - 4}
						y={AXIS_Y + 3}
						textAnchor="end"
						className="fill-muted"
						fontSize="9"
					>
						0
					</text>
					<text
						x={LEFT_MARGIN - 4}
						y={CHART_HEIGHT - 4}
						textAnchor="end"
						className="fill-muted"
						fontSize="9"
					>
						{formatTokenCount(maxOutput)}
					</text>

					{/* Axis line */}
					<line
						x1={LEFT_MARGIN}
						y1={AXIS_Y}
						x2={chartWidth}
						y2={AXIS_Y}
						stroke="currentColor"
						strokeWidth="1"
						className="text-border"
					/>

					{/* Input bars (above axis) */}
					{data.map((d, i) => {
						const x =
							LEFT_MARGIN + (d.messageIndex / totalMessages) * drawWidth;
						const barH = (d.inputTokens / maxInput) * BAR_HALF_HEIGHT;

						return (
							<rect
								// biome-ignore lint/suspicious/noArrayIndexKey: static chart bar data
								key={`in-${i}`}
								x={x - barWidth / 2}
								y={AXIS_Y - barH}
								width={barWidth}
								height={barH}
								className="fill-blue-400/70 hover:fill-blue-500"
								rx="1"
							/>
						);
					})}

					{/* Output bars (below axis) */}
					{data.map((d, i) => {
						const x =
							LEFT_MARGIN + (d.messageIndex / totalMessages) * drawWidth;
						const barH = (d.outputTokens / maxOutput) * BAR_HALF_HEIGHT;

						return (
							<rect
								// biome-ignore lint/suspicious/noArrayIndexKey: static chart bar data
								key={`out-${i}`}
								x={x - barWidth / 2}
								y={AXIS_Y}
								width={barWidth}
								height={barH}
								className="fill-purple-400/70 hover:fill-purple-500"
								rx="1"
							/>
						);
					})}

					{/* Cursor line */}
					<line
						x1={cursorX}
						y1="0"
						x2={cursorX}
						y2={CHART_HEIGHT}
						stroke="currentColor"
						strokeWidth="1"
						className="text-foreground"
						strokeDasharray="4,2"
					/>
				</svg>
			</div>

			{/* Legend */}
			<div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted">
				<div className="flex items-center gap-1">
					<div className="w-2 h-2 rounded-sm bg-blue-400" />
					<span>Input</span>
				</div>
				<div className="flex items-center gap-1">
					<div className="w-2 h-2 rounded-sm bg-purple-400" />
					<span>Output</span>
				</div>
			</div>
		</div>
	);
}
