import type {
	SessionThreadOverviewChart,
	SessionThreadOverviewCostPoint,
	SessionThreadOverviewMetric,
} from "./session-thread-overview-chart";
import {
	DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
	type SessionThreadOverviewStripConfig,
} from "./session-thread-overview-config";
import type { SessionOverviewLivelineCallHit } from "./session-thread-overview-liveline-geometry";
import type { SessionTurnOption } from "./session-turn-option";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";

export type SessionOverviewMetricDefinition = {
	label: string;
	metric: SessionThreadOverviewMetric;
	title: string;
};

export type SessionOverviewHover =
	| {
			hit: SessionOverviewLivelineCallHit;
			index: number;
			kind: "call";
			xRatio: number;
	  }
	| {
			activityXRatio: number;
			index: number;
			kind: "activity";
			xRatio: number;
	  }
	| {
			index: number;
			kind: "timeline";
			xRatio: number;
	  };

export type SessionOverviewEventKind = "edit" | "skill" | "subagent";

export const SESSION_OVERVIEW_METRICS: readonly SessionOverviewMetricDefinition[] =
	[
		{ label: "Cost", metric: "cost", title: "Estimated turn cost" },
		{ label: "IN", metric: "input", title: "Recorded input tokens" },
		{ label: "Reasoning", metric: "reasoning", title: "Reasoning blocks" },
		{ label: "Skills", metric: "skills", title: "Skill uses" },
		{ label: "Edits", metric: "edits", title: "Directly edited files" },
		{ label: "Sub-agents", metric: "subagents", title: "Subagents started" },
	];

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 1,
	notation: "compact",
});

const costFormatter = new Intl.NumberFormat("en-US", {
	currency: "USD",
	maximumFractionDigits: 2,
	minimumFractionDigits: 2,
	style: "currency",
});

export function getPlotBounds(config: SessionThreadOverviewStripConfig) {
	return {
		plotLeft: config.plotPadding,
		plotRight: config.chartWidth - config.plotPadding,
	};
}

function getChartDomain(config: SessionThreadOverviewStripConfig) {
	const boundedStart = Math.min(Math.max(config.xDomainStartRatio, 0), 1);
	const boundedEnd = Math.min(Math.max(config.xDomainEndRatio, 0), 1);
	return boundedEnd > boundedStart
		? { end: boundedEnd, start: boundedStart }
		: { end: 1, start: 0 };
}

export function getChartX(
	xRatio: number,
	config: SessionThreadOverviewStripConfig = DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
) {
	const { plotLeft, plotRight } = getPlotBounds(config);
	const boundedRatio = Math.min(Math.max(xRatio, 0), 1);
	const domain = getChartDomain(config);
	const visibleRatio =
		(boundedRatio - domain.start) / (domain.end - domain.start);
	return plotLeft + visibleRatio * (plotRight - plotLeft);
}

export function getChartRatioAtX(
	x: number,
	config: SessionThreadOverviewStripConfig = DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
) {
	const { plotLeft, plotRight } = getPlotBounds(config);
	const domain = getChartDomain(config);
	const visibleRatio = Math.min(
		Math.max((x - plotLeft) / (plotRight - plotLeft), 0),
		1,
	);
	return domain.start + visibleRatio * (domain.end - domain.start);
}

export function getSessionOverviewViewportLayout(
	viewport: { xEndRatio: number; xStartRatio: number } | undefined,
	config: SessionThreadOverviewStripConfig,
) {
	if (!viewport) {
		return { viewportStartX: 0, viewportWidth: 0 };
	}
	const rawStartX = getChartX(viewport.xStartRatio, config);
	const rawEndX = getChartX(viewport.xEndRatio, config);
	const viewportWidth = Math.max(
		rawEndX - rawStartX,
		config.minimumViewportWidth,
	);
	const viewportCenterX = (rawStartX + rawEndX) / 2;
	return {
		viewportStartX: viewportCenterX - viewportWidth / 2,
		viewportWidth,
	};
}

export function getBarHeight(
	metricRatio: number | undefined,
	config: SessionThreadOverviewStripConfig = DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
) {
	return metricRatio === undefined
		? 0
		: Math.max(metricRatio * config.maxBarHeight, config.minBarHeight);
}

export function countReasoningBlocks(option: SessionTurnOption) {
	let count = 0;
	for (const item of option.turn.responseItems) {
		if (item.kind === "agent") {
			count += item.events.filter((event) => event.kind === "reasoning").length;
		}
	}
	return count;
}

export function formatCompactNumber(value: number | undefined) {
	return value === undefined ? "—" : compactNumberFormatter.format(value);
}

export function formatCost(value: number | undefined) {
	return value === undefined ? "$—" : costFormatter.format(value);
}

export function formatMetricValue(
	value: number | undefined,
	metric: SessionThreadOverviewMetric,
) {
	if (metric === "cost") {
		return formatCost(value);
	}
	if (metric === "input") {
		return value === undefined ? "—" : `${formatCompactNumber(value)} tok`;
	}
	return value === undefined ? "—" : value.toLocaleString();
}

export function getMetricTotal(
	chart: SessionThreadOverviewChart,
	metric: SessionThreadOverviewMetric,
) {
	switch (metric) {
		case "cost":
			return chart.totals.cost;
		case "edits":
			return chart.totals.edits;
		case "input":
			return chart.totals.inputTokens;
		case "reasoning":
			return chart.totals.reasoning;
		case "skills":
			return chart.totals.skills;
		case "subagents":
			return chart.totals.subagents;
	}
}

export function formatIdleDuration(durationMs: number) {
	const totalMinutes = Math.max(Math.round(durationMs / (60 * 1_000)), 1);
	const days = Math.floor(totalMinutes / (24 * 60));
	const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
	const minutes = totalMinutes % 60;
	return [
		days > 0 ? `${days}d` : "",
		hours > 0 ? `${hours}h` : "",
		minutes > 0 ? `${minutes}m` : "",
	]
		.filter(Boolean)
		.join(" ");
}

export function getTurnLabel(option: SessionTurnTablePaneOption) {
	return option.turnNumber === undefined
		? "Session start"
		: `Turn ${option.turnNumber}`;
}

export function getCumulativeCostAtRatio(
	points: readonly SessionThreadOverviewCostPoint[],
	xRatio: number,
) {
	let previousX = 0;
	let previousCost = 0;
	for (const point of points) {
		if (xRatio <= point.xRatio) {
			const width = point.xRatio - previousX;
			if (width <= 0) {
				return point.cumulativeCost;
			}
			const progress = Math.min(Math.max((xRatio - previousX) / width, 0), 1);
			return previousCost + (point.cumulativeCost - previousCost) * progress;
		}
		previousX = point.xRatio;
		previousCost = point.cumulativeCost;
	}
	return previousCost;
}

export function getCostLineY(
	cumulativeCost: number,
	maximumCost: number,
	config: SessionThreadOverviewStripConfig = DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
) {
	const ratio = maximumCost <= 0 ? 0 : cumulativeCost / maximumCost;
	return (
		config.costLineBottom - ratio * (config.costLineBottom - config.costLineTop)
	);
}
