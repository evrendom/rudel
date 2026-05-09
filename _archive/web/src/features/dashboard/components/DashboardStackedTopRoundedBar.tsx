"use client";

import { Rectangle } from "recharts";
import type { DashboardHighlightSource } from "@/features/dashboard/components/dashboard-highlight-state";

type SeriesKey = "committed" | "stub" | "uncommitted";

type StackedBarPayload = {
	committed: number;
	id?: string;
	stub?: number;
	uncommitted: number;
};

export function DashboardStackedTopRoundedBar({
	activeId,
	activeSource,
	dataKey,
	fill,
	height,
	payload,
	radius = 4,
	width,
	x,
	y,
}: {
	activeId?: string | null;
	activeSource?: DashboardHighlightSource;
	dataKey?: SeriesKey;
	fill?: string;
	height?: number;
	payload?: StackedBarPayload;
	radius?: number;
	width?: number;
	x?: number;
	y?: number;
}) {
	if (
		typeof x !== "number" ||
		typeof y !== "number" ||
		typeof width !== "number" ||
		typeof height !== "number" ||
		!payload ||
		!dataKey ||
		height <= 0
	) {
		return null;
	}

	const isTopSegment =
		dataKey === "stub"
			? (payload.stub ?? 0) > 0
			: dataKey === "uncommitted"
				? payload.uncommitted > 0
				: payload.committed > 0 &&
					payload.uncommitted <= 0 &&
					(payload.stub ?? 0) <= 0;
	const isHighlighted = activeId != null && payload.id === activeId;
	const hasExternalHighlight = activeId != null;
	const highlightStroke =
		"color-mix(in srgb, var(--dashboardy-heading) 22%, transparent)";
	const barOpacity =
		hasExternalHighlight && !isHighlighted
			? activeSource === "table"
				? 0.16
				: 0.26
			: 1;
	const showStroke = isHighlighted && isTopSegment;

	return (
		<Rectangle
			x={x}
			y={y}
			width={width}
			height={height}
			fill={fill}
			radius={isTopSegment ? [radius, radius, 0, 0] : 0}
			stroke={highlightStroke}
			strokeWidth={showStroke ? 1 : 0}
			style={{
				opacity: barOpacity,
				strokeOpacity: showStroke ? 1 : 0,
				transition:
					"opacity 300ms cubic-bezier(0.23, 1, 0.32, 1), stroke-opacity 300ms cubic-bezier(0.23, 1, 0.32, 1)",
			}}
		/>
	);
}
