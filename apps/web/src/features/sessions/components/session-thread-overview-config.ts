export type SessionThreadOverviewTimelineSettings = {
	breakMarginMinutes: number;
	fixedBreakRatio: number;
	idleGapThresholdMinutes: number;
	maximumTotalBreakRatio: number;
	minimumTickSpacingRatio: number;
	targetTickCount: number;
};

export type SessionThreadOverviewStripConfig =
	SessionThreadOverviewTimelineSettings & {
		axisY: number;
		chartHeight: number;
		chartWidth: number;
		eventY: number;
		minimumViewportWidth: number;
		plotPadding: number;
		showCrosshair: boolean;
		showTicks: boolean;
		showViewportBand: boolean;
		xDomainEndRatio: number;
		xDomainStartRatio: number;
	};

export const DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG: SessionThreadOverviewStripConfig =
	{
		axisY: 50,
		breakMarginMinutes: 5,
		chartHeight: 76,
		chartWidth: 1_000,
		eventY: 56,
		fixedBreakRatio: 0.008,
		idleGapThresholdMinutes: 30,
		maximumTotalBreakRatio: 0.2,
		minimumTickSpacingRatio: 0.09,
		minimumViewportWidth: 10,
		plotPadding: 10,
		showCrosshair: true,
		showTicks: true,
		showViewportBand: true,
		targetTickCount: 6,
		xDomainEndRatio: 1,
		xDomainStartRatio: 0,
	};

export function resolveSessionThreadOverviewStripConfig(
	overrides: Partial<SessionThreadOverviewStripConfig> | undefined,
): SessionThreadOverviewStripConfig {
	return overrides
		? { ...DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG, ...overrides }
		: DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG;
}

export function getSessionThreadOverviewTimelineSettings(
	config: SessionThreadOverviewStripConfig,
): SessionThreadOverviewTimelineSettings {
	return {
		breakMarginMinutes: config.breakMarginMinutes,
		fixedBreakRatio: config.fixedBreakRatio,
		idleGapThresholdMinutes: config.idleGapThresholdMinutes,
		maximumTotalBreakRatio: config.maximumTotalBreakRatio,
		minimumTickSpacingRatio: config.minimumTickSpacingRatio,
		targetTickCount: config.targetTickCount,
	};
}
