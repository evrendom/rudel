import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface TokenDataPoint {
	messageIndex: number;
	inputTokens: number;
	outputTokens: number;
}

interface TokenUsageChartProps {
	data: TokenDataPoint[];
	totalMessages: number;
	className?: string;
}

const CHART_HEIGHT = 160;
const AXIS_Y = CHART_HEIGHT / 2;
const BAR_HALF_HEIGHT = AXIS_Y - 6;
const LEFT_MARGIN = 40;
const INPUT_BAR_FILL = "color-mix(in srgb, var(--dashboardy-accent) 82%, white)";
const OUTPUT_BAR_FILL =
	"color-mix(in srgb, var(--dashboardy-chip-foreground) 78%, white)";

function formatTokenCount(n: number): string {
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(1)}M`;
	}
	if (n >= 1_000) {
		return `${(n / 1_000).toFixed(0)}k`;
	}
	return String(n);
}

export function TokenUsageChart({
	data,
	totalMessages,
	className,
}: TokenUsageChartProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [chartWidth, setChartWidth] = useState(400);
	const safeTotalMessages = Math.max(totalMessages, 1);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) {
			return;
		}

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) {
				setChartWidth(entry.contentRect.width);
			}
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	const drawWidth = chartWidth - LEFT_MARGIN;

	const { maxInput, maxOutput } = useMemo(() => {
		let maxIn = 0;
		let maxOut = 0;
		for (const point of data) {
			if (point.inputTokens > maxIn) {
				maxIn = point.inputTokens;
			}
			if (point.outputTokens > maxOut) {
				maxOut = point.outputTokens;
			}
		}
		return { maxInput: maxIn || 1, maxOutput: maxOut || 1 };
	}, [data]);

	const totalInput = useMemo(
		() => data.reduce((sum, point) => sum + point.inputTokens, 0),
		[data],
	);
	const totalOutput = useMemo(
		() => data.reduce((sum, point) => sum + point.outputTokens, 0),
		[data],
	);

	if (data.length === 0) {
		return (
			<div className={cn("grid gap-3", className)}>
				<div className="grid gap-1">
					<p className="text-sm font-medium text-[color:var(--dashboardy-muted)]">
						No token data
					</p>
					<p className="text-sm text-[color:var(--dashboardy-subtle)]">
						This session didn&apos;t record assistant token usage.
					</p>
				</div>
				<div className="rounded-[0.95rem] border border-[color:var(--dashboardy-divider)] bg-[color:var(--dashboardy-subsurface)] px-4 py-6 text-center">
					<p className="text-sm text-[color:var(--dashboardy-muted)]">
						Token totals appear here once assistant responses include usage
						metadata.
					</p>
				</div>
			</div>
		);
	}

	const barWidth = Math.max(2, (drawWidth / safeTotalMessages) * 0.8);

	return (
		<div className={cn("grid gap-4", className)}>
			<div className="grid gap-3 border-b border-[color:var(--dashboardy-divider)] pb-3 sm:grid-cols-2">
				<div className="grid gap-1">
					<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-muted)]">
						Input
					</p>
					<p className="font-mono text-[0.95rem] font-semibold tabular-nums text-[color:var(--dashboardy-heading)]">
						{totalInput.toLocaleString()}
					</p>
				</div>
				<div className="grid gap-1">
					<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-muted)]">
						Output
					</p>
					<p className="font-mono text-[0.95rem] font-semibold tabular-nums text-[color:var(--dashboardy-heading)]">
						{totalOutput.toLocaleString()}
					</p>
				</div>
			</div>

			<div ref={containerRef}>
				<svg
					viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
					className="w-full"
					style={{ height: `${CHART_HEIGHT}px` }}
					role="img"
					aria-label="Token usage chart showing input and output tokens per message"
				>
					<text
						x={LEFT_MARGIN - 4}
						y={12}
						textAnchor="end"
						className="fill-[color:var(--dashboardy-muted)]"
						fontSize="10"
					>
						{formatTokenCount(maxInput)}
					</text>
					<text
						x={LEFT_MARGIN - 4}
						y={AXIS_Y + 4}
						textAnchor="end"
						className="fill-[color:var(--dashboardy-subtle)]"
						fontSize="9"
					>
						0
					</text>
					<text
						x={LEFT_MARGIN - 4}
						y={CHART_HEIGHT - 4}
						textAnchor="end"
						className="fill-[color:var(--dashboardy-muted)]"
						fontSize="10"
					>
						{formatTokenCount(maxOutput)}
					</text>

					<line
						x1={LEFT_MARGIN}
						y1={AXIS_Y}
						x2={chartWidth}
						y2={AXIS_Y}
						stroke="var(--dashboardy-divider)"
						strokeWidth="1"
					/>

					{data.map((point, index) => {
						const x =
							LEFT_MARGIN +
							(point.messageIndex / safeTotalMessages) * drawWidth;
						const barHeight = (point.inputTokens / maxInput) * BAR_HALF_HEIGHT;

						return (
							<rect
								// biome-ignore lint/suspicious/noArrayIndexKey: static chart bar data
								key={`in-${index}`}
								x={x - barWidth / 2}
								y={AXIS_Y - barHeight}
								width={barWidth}
								height={barHeight}
								fill={INPUT_BAR_FILL}
								rx="1"
							/>
						);
					})}

					{data.map((point, index) => {
						const x =
							LEFT_MARGIN +
							(point.messageIndex / safeTotalMessages) * drawWidth;
						const barHeight = (point.outputTokens / maxOutput) * BAR_HALF_HEIGHT;

						return (
							<rect
								// biome-ignore lint/suspicious/noArrayIndexKey: static chart bar data
								key={`out-${index}`}
								x={x - barWidth / 2}
								y={AXIS_Y}
								width={barWidth}
								height={barHeight}
								fill={OUTPUT_BAR_FILL}
								rx="1"
							/>
						);
					})}
				</svg>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<div className="dashboardy-inline-badge flex items-center gap-2 rounded-full border px-3 py-1.5">
					<div className="size-2 rounded-sm [background:color-mix(in_srgb,var(--dashboardy-accent)_82%,white)]" />
					<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-heading)]">
						Input
					</p>
				</div>
				<div className="dashboardy-inline-badge flex items-center gap-2 rounded-full border px-3 py-1.5">
					<div className="size-2 rounded-sm [background:color-mix(in_srgb,var(--dashboardy-chip-foreground)_78%,white)]" />
					<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-heading)]">
						Output
					</p>
				</div>
			</div>
		</div>
	);
}
