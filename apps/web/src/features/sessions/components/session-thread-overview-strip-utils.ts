import {
	DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG,
	type SessionThreadOverviewStripConfig,
} from "./session-thread-overview-config";
import type { SessionOverviewLivelineCallHit } from "./session-thread-overview-liveline-geometry";
import type { SessionTurnTablePaneOption } from "./session-turn-table-pane";

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

export function formatCompactNumber(value: number | undefined) {
	return value === undefined ? "—" : compactNumberFormatter.format(value);
}

export function formatCost(value: number | undefined) {
	return value === undefined ? "$—" : costFormatter.format(value);
}

export function getTurnLabel(option: SessionTurnTablePaneOption) {
	return option.turnNumber === undefined
		? "Session start"
		: `Turn ${option.turnNumber}`;
}

function getChartDomain(config: SessionThreadOverviewStripConfig) {
	const boundedStart = Math.min(Math.max(config.xDomainStartRatio, 0), 1);
	const boundedEnd = Math.min(Math.max(config.xDomainEndRatio, 0), 1);
	return boundedEnd > boundedStart
		? { end: boundedEnd, start: boundedStart }
		: { end: 1, start: 0 };
}
