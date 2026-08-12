export type SessionThreadOverviewBarScale = "linear" | "sqrt";

export type SessionThreadOverviewErrorPlacement = "above-bar" | "fixed-lane";

export type SessionThreadOverviewGlyphEncoding = "hue-shape" | "shape-only";

export type SessionThreadOverviewCrosshairMode = "interpolated" | "snap";

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
		barAccentMix: number;
		barScale: SessionThreadOverviewBarScale;
		barWidthBudget: number;
		barWidthMax: number;
		barWidthMin: number;
		chartHeight: number;
		chartWidth: number;
		costLineBottom: number;
		costLineOpacity: number;
		costLineTop: number;
		costLineWidth: number;
		crosshairMode: SessionThreadOverviewCrosshairMode;
		editGlyphSize: number;
		errorPlacement: SessionThreadOverviewErrorPlacement;
		errorTickHalfWidth: number;
		errorTickStroke: number;
		eventY: number;
		glyphEncoding: SessionThreadOverviewGlyphEncoding;
		maxBarHeight: number;
		minBarHeight: number;
		minimumViewportWidth: number;
		plotPadding: number;
		showBreaks: boolean;
		showCostLine: boolean;
		showCrosshair: boolean;
		showEndTotal: boolean;
		showErrorTicks: boolean;
		showEventGlyphs: boolean;
		showMaxMarker: boolean;
		showReferenceBand: boolean;
		showTicks: boolean;
		showViewportBand: boolean;
		skillGlyphRadius: number;
		subagentGlyphSize: number;
	};

// Defaults mirror the constants the strip shipped with; a strip rendered with
// no config prop must be pixel-identical to the pre-config implementation.
export const DEFAULT_SESSION_THREAD_OVERVIEW_STRIP_CONFIG: SessionThreadOverviewStripConfig =
	{
		axisY: 50,
		barAccentMix: 46,
		breakMarginMinutes: 5,
		barScale: "sqrt",
		barWidthBudget: 560,
		barWidthMax: 10,
		barWidthMin: 3,
		chartHeight: 76,
		chartWidth: 1_000,
		costLineBottom: 47,
		costLineOpacity: 0.85,
		costLineTop: 5,
		costLineWidth: 1.5,
		crosshairMode: "interpolated",
		editGlyphSize: 3.2,
		errorPlacement: "above-bar",
		errorTickHalfWidth: 2.5,
		errorTickStroke: 2,
		eventY: 56,
		fixedBreakRatio: 0.008,
		glyphEncoding: "shape-only",
		idleGapThresholdMinutes: 30,
		maxBarHeight: 40,
		maximumTotalBreakRatio: 0.2,
		minBarHeight: 1.5,
		minimumTickSpacingRatio: 0.09,
		minimumViewportWidth: 10,
		plotPadding: 10,
		showBreaks: true,
		showCostLine: true,
		showCrosshair: true,
		showEndTotal: false,
		showErrorTicks: true,
		showEventGlyphs: true,
		showMaxMarker: false,
		showReferenceBand: false,
		showTicks: true,
		showViewportBand: true,
		skillGlyphRadius: 1.65,
		subagentGlyphSize: 3.1,
		targetTickCount: 6,
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
