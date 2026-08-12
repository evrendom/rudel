import { useDialKit } from "dialkit";
import type { CSSProperties } from "react";
// biome-ignore lint/style/noRestrictedImports: the scroll simulator advances the selected turn on an interval, which requires an effect.
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type {
	SessionThreadOverviewBarScale,
	SessionThreadOverviewCrosshairMode,
	SessionThreadOverviewErrorPlacement,
	SessionThreadOverviewGlyphEncoding,
	SessionThreadOverviewStripConfig,
} from "./session-thread-overview-config";
import { resolveSessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import {
	buildSessionOverviewLabFixture,
	parseSessionOverviewLabScenario,
	SESSION_OVERVIEW_LAB_SCENARIOS,
} from "./session-thread-overview-lab-fixtures";
import { SessionThreadOverviewLabGallery } from "./session-thread-overview-lab-gallery";
import { SessionThreadOverviewStrip } from "./session-thread-overview-strip";
import { SessionThreadOverviewStripV2 } from "./session-thread-overview-strip-v2";

// Mirrors the triptych root exactly so the strip renders with the same tokens
// it has on the real session routes (session-detail-triptych-view.tsx).
const SESSION_OVERVIEW_VARIABLES_CLASS_NAME =
	"bg-(--session-overview-surface) text-(--session-overview-text) [--session-overview-accent:#266df0] [--session-overview-border:#eeeff1] [--session-overview-hover:#f6f7f7] [--session-overview-muted:rgba(0,0,0,0.63)] [--session-overview-subtle:rgba(0,0,0,0.5)] [--session-overview-surface:#fff] [--session-overview-text:#101112] [font-family:Inter,sans-serif] dark:[--session-overview-border:rgba(255,255,255,0.08)] dark:[--session-overview-hover:rgba(255,255,255,0.05)] dark:[--session-overview-muted:rgba(255,255,255,0.65)] dark:[--session-overview-subtle:rgba(255,255,255,0.5)] dark:[--session-overview-surface:#111827] dark:[--session-overview-text:#f8fafc]";

const STRESS_WIDTHS = [640, 960, 1280] as const;

const PRINCIPLES_CHECKLIST = [
	{
		title: "Bertin match",
		detail:
			"Quantitative facts on position/size only; nominal facts on hue+shape; ordered facts on lightness.",
	},
	{
		title: "Visibility floor",
		detail:
			"No data-bearing mark shrinks below findability — glyphs live in a fixed lane; bars keep a minimum height.",
	},
	{
		title: "One alarm",
		detail:
			"Exactly one saturated attention color (errors); everything else is a muted derivative of the accent.",
	},
	{
		title: "Declared distortion",
		detail:
			"Sqrt scale and idle compression are visually marked; exact values are one hover away.",
	},
	{
		title: "Three reading levels",
		detail:
			"Squint (session shape), scan (bursts), point (single-turn truth) all answer in one act of perception.",
	},
	{
		title: "Inline calibration",
		detail:
			"Typical-cost band, max marker, and labeled end total — the strip carries its own reference points.",
	},
	{
		title: "No false shared axis",
		detail:
			"The cumulative spline can never be misread against bar heights; overlays get their own readouts.",
	},
	{
		title: "Data-ink audit",
		detail:
			"Every stroke survives “erase it — was information lost?”; layer contrast descends from data to chrome.",
	},
	{
		title: "Interaction contract",
		detail:
			"Hover inspects (snapped), click jumps, drag scrubs; strip↔transcript sync is bidirectional and fast.",
	},
	{
		title: "Engineered finish",
		detail:
			"Token-derived colors, hairline strokes, compact number formats, designed dark mode, zero motion at rest.",
	},
] as const;

interface SessionOverviewAccentStyle extends CSSProperties {
	"--session-overview-accent": string;
}

function parseBarScale(value: string): SessionThreadOverviewBarScale {
	return value === "linear" ? "linear" : "sqrt";
}

function parseErrorPlacement(
	value: string,
): SessionThreadOverviewErrorPlacement {
	return value === "fixed-lane" ? "fixed-lane" : "above-bar";
}

function parseGlyphEncoding(value: string): SessionThreadOverviewGlyphEncoding {
	return value === "hue-shape" ? "hue-shape" : "shape-only";
}

function parseCrosshairMode(value: string): SessionThreadOverviewCrosshairMode {
	return value === "snap" ? "snap" : "interpolated";
}

function LabSection({
	children,
	hint,
	title,
}: {
	children: React.ReactNode;
	hint?: string;
	title: string;
}) {
	return (
		<section className="grid gap-3">
			<div className="flex flex-wrap items-baseline gap-2">
				<h3 className="text-sm font-medium text-(--session-overview-text)">
					{title}
				</h3>
				{hint ? (
					<p className="text-xs text-(--session-overview-muted)">{hint}</p>
				) : null}
			</div>
			{children}
		</section>
	);
}

export function SessionThreadOverviewLabPage() {
	const dialValues = useDialKit("Session map lab", {
		scenario: {
			type: "select",
			options: SESSION_OVERVIEW_LAB_SCENARIOS.map((scenario) => ({
				label: scenario.label,
				value: scenario.value,
			})),
			default: "marathon",
		},
		variant: {
			type: "select",
			options: [
				{ label: "Classic (metric bars)", value: "classic" },
				{ label: "Output focus (duration bars)", value: "output-focus" },
			],
			default: "classic",
		},
		frame: {
			accent: { type: "color", default: "#266df0" },
			containerWidth: [1200, 480, 1600, 10],
			dark: false,
			simulateScroll: false,
			viewportSpread: [2, 0, 10, 1],
		},
		experiments: {
			barScale: {
				type: "select",
				options: ["sqrt", "linear"],
				default: "sqrt",
			},
			crosshairMode: {
				type: "select",
				options: ["interpolated", "snap"],
				default: "interpolated",
			},
			errorPlacement: {
				type: "select",
				options: ["above-bar", "fixed-lane"],
				default: "above-bar",
			},
			glyphEncoding: {
				type: "select",
				options: ["shape-only", "hue-shape"],
				default: "shape-only",
			},
			showEndTotal: false,
			showMaxMarker: false,
			showReferenceBand: false,
		},
		layers: {
			_collapsed: true,
			showBreaks: true,
			showCostLine: true,
			showCrosshair: true,
			showErrorTicks: true,
			showEventGlyphs: true,
			showTicks: true,
			showViewportBand: true,
		},
		geometry: {
			_collapsed: true,
			axisY: [50, 20, 70, 1],
			chartHeight: [76, 56, 140, 1],
			costLineBottom: [47, 12, 60, 1],
			costLineTop: [5, 2, 30, 1],
			eventY: [56, 40, 72, 1],
			maxBarHeight: [40, 8, 60, 1],
			minimumViewportWidth: [10, 2, 40, 1],
			plotPadding: [10, 0, 40, 1],
		},
		bars: {
			_collapsed: true,
			barAccentMix: [46, 10, 100, 1],
			barWidthBudget: [560, 100, 2000, 10],
			barWidthMax: [10, 2, 30, 0.5],
			barWidthMin: [3, 1, 10, 0.5],
			minBarHeight: [1.5, 0.5, 6, 0.1],
		},
		timeline: {
			_collapsed: true,
			breakMarginMinutes: [5, 0, 120, 5],
			fixedBreakRatio: [0.008, 0.002, 0.05, 0.001],
			idleGapThresholdMinutes: [30, 5, 240, 5],
			maximumTotalBreakRatio: [0.2, 0.05, 0.5, 0.01],
			minimumTickSpacingRatio: [0.09, 0.02, 0.3, 0.01],
			targetTickCount: [6, 2, 12, 1],
		},
		style: {
			_collapsed: true,
			costLineOpacity: [0.85, 0.2, 1, 0.05],
			costLineWidth: [1.5, 0.5, 4, 0.25],
			editGlyphSize: [3.2, 1.5, 6, 0.1],
			errorTickHalfWidth: [2.5, 1, 6, 0.25],
			errorTickStroke: [2, 1, 4, 0.25],
			skillGlyphRadius: [1.65, 1, 4, 0.05],
			subagentGlyphSize: [3.1, 1.5, 6, 0.1],
		},
	});

	const scenario = parseSessionOverviewLabScenario(dialValues.scenario);
	const variant =
		dialValues.variant === "output-focus" ? "output-focus" : "classic";
	const fixture = useMemo(
		() => buildSessionOverviewLabFixture(scenario),
		[scenario],
	);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const boundedSelectedIndex = Math.min(
		selectedIndex,
		Math.max(fixture.options.length - 1, 0),
	);

	const config: Partial<SessionThreadOverviewStripConfig> = useMemo(
		() => ({
			axisY: dialValues.geometry.axisY,
			barAccentMix: dialValues.bars.barAccentMix,
			barScale: parseBarScale(dialValues.experiments.barScale),
			barWidthBudget: dialValues.bars.barWidthBudget,
			barWidthMax: dialValues.bars.barWidthMax,
			barWidthMin: dialValues.bars.barWidthMin,
			breakMarginMinutes: dialValues.timeline.breakMarginMinutes,
			chartHeight: dialValues.geometry.chartHeight,
			costLineBottom: dialValues.geometry.costLineBottom,
			costLineOpacity: dialValues.style.costLineOpacity,
			costLineTop: dialValues.geometry.costLineTop,
			costLineWidth: dialValues.style.costLineWidth,
			crosshairMode: parseCrosshairMode(dialValues.experiments.crosshairMode),
			editGlyphSize: dialValues.style.editGlyphSize,
			errorPlacement: parseErrorPlacement(
				dialValues.experiments.errorPlacement,
			),
			errorTickHalfWidth: dialValues.style.errorTickHalfWidth,
			errorTickStroke: dialValues.style.errorTickStroke,
			eventY: dialValues.geometry.eventY,
			fixedBreakRatio: dialValues.timeline.fixedBreakRatio,
			glyphEncoding: parseGlyphEncoding(dialValues.experiments.glyphEncoding),
			idleGapThresholdMinutes: dialValues.timeline.idleGapThresholdMinutes,
			maxBarHeight: dialValues.geometry.maxBarHeight,
			maximumTotalBreakRatio: dialValues.timeline.maximumTotalBreakRatio,
			minBarHeight: dialValues.bars.minBarHeight,
			minimumTickSpacingRatio: dialValues.timeline.minimumTickSpacingRatio,
			minimumViewportWidth: dialValues.geometry.minimumViewportWidth,
			plotPadding: dialValues.geometry.plotPadding,
			showBreaks: dialValues.layers.showBreaks,
			showCostLine: dialValues.layers.showCostLine,
			showCrosshair: dialValues.layers.showCrosshair,
			showEndTotal: dialValues.experiments.showEndTotal,
			showErrorTicks: dialValues.layers.showErrorTicks,
			showEventGlyphs: dialValues.layers.showEventGlyphs,
			showMaxMarker: dialValues.experiments.showMaxMarker,
			showReferenceBand: dialValues.experiments.showReferenceBand,
			showTicks: dialValues.layers.showTicks,
			showViewportBand: dialValues.layers.showViewportBand,
			targetTickCount: dialValues.timeline.targetTickCount,
		}),
		[dialValues],
	);
	const resolvedConfig = useMemo(
		() => resolveSessionThreadOverviewStripConfig(config),
		[config],
	);

	const simulateScroll = dialValues.frame.simulateScroll;
	const turnCount = fixture.options.length;
	useEffect(() => {
		if (!simulateScroll || turnCount === 0) {
			return;
		}
		const interval = setInterval(() => {
			setSelectedIndex((current) => (current + 1) % turnCount);
		}, 1_200);
		return () => clearInterval(interval);
	}, [simulateScroll, turnCount]);

	const viewportSpread = Math.round(dialValues.frame.viewportSpread);
	const visibleRange: readonly [number, number] | undefined =
		turnCount === 0
			? undefined
			: [
					Math.max(boundedSelectedIndex - viewportSpread, 0),
					Math.min(boundedSelectedIndex + viewportSpread, turnCount - 1),
				];

	const accentStyle: SessionOverviewAccentStyle = {
		"--session-overview-accent": dialValues.frame.accent,
	};

	return (
		<div className={cn("min-h-screen", dialValues.frame.dark && "dark")}>
			<div
				className={cn("min-h-screen", SESSION_OVERVIEW_VARIABLES_CLASS_NAME)}
				style={accentStyle}
			>
				<div className="mx-auto grid max-w-[1680px] gap-8 px-6 py-6">
					<header className="grid gap-1">
						<h1 className="text-base font-semibold text-(--session-overview-text)">
							Session map lab
						</h1>
						<p className="max-w-3xl text-xs text-(--session-overview-muted)">
							Standalone workbench for the session overview strip. Tune every
							design variable from the DialKit panel, switch data scenarios, and
							score the result against the principles checklist. Plan:
							.context/plans/overview-strip-lab.md · Digest:
							.context/plans/chart-design-principles.md
						</p>
					</header>

					<LabSection
						hint={`${turnCount.toLocaleString()} turns · selected ${boundedSelectedIndex + 1}`}
						title="Live strip"
					>
						<div
							className="max-w-full overflow-x-auto rounded-lg border border-(--session-overview-border)"
							style={{ width: dialValues.frame.containerWidth }}
						>
							{variant === "output-focus" ? (
								<SessionThreadOverviewStripV2
									config={config}
									onSelect={setSelectedIndex}
									options={fixture.options}
									selectedIndex={boundedSelectedIndex}
									visibleRange={visibleRange}
								/>
							) : (
								<SessionThreadOverviewStrip
									config={config}
									onSelect={setSelectedIndex}
									options={fixture.options}
									selectedIndex={boundedSelectedIndex}
									subagents={fixture.subagents}
									visibleRange={visibleRange}
								/>
							)}
						</div>
					</LabSection>

					<LabSection
						hint="same config at fixed widths — check density, tick collisions, badge clamping"
						title="Width stress"
					>
						<div className="grid gap-3">
							{STRESS_WIDTHS.map((width) => (
								<div
									key={width}
									className="max-w-full overflow-x-auto rounded-lg border border-(--session-overview-border)"
									style={{ width }}
								>
									{variant === "output-focus" ? (
										<SessionThreadOverviewStripV2
											config={config}
											onSelect={setSelectedIndex}
											options={fixture.options}
											selectedIndex={boundedSelectedIndex}
											visibleRange={visibleRange}
										/>
									) : (
										<SessionThreadOverviewStrip
											config={config}
											onSelect={setSelectedIndex}
											options={fixture.options}
											selectedIndex={boundedSelectedIndex}
											subagents={fixture.subagents}
											visibleRange={visibleRange}
										/>
									)}
								</div>
							))}
						</div>
					</LabSection>

					<LabSection
						hint="every sub-component isolated, driven by the same config"
						title="Component gallery"
					>
						<SessionThreadOverviewLabGallery config={resolvedConfig} />
					</LabSection>

					<LabSection
						hint="score any iteration against these before promoting it"
						title="Principles checklist"
					>
						<ol className="grid gap-2 md:grid-cols-2">
							{PRINCIPLES_CHECKLIST.map((principle, index) => (
								<li
									key={principle.title}
									className="rounded-lg border border-(--session-overview-border) bg-(--session-overview-surface) p-3"
								>
									<p className="text-xs font-medium text-(--session-overview-text)">
										{index + 1}. {principle.title}
									</p>
									<p className="mt-1 text-xs text-(--session-overview-muted)">
										{principle.detail}
									</p>
								</li>
							))}
						</ol>
					</LabSection>
				</div>
			</div>
		</div>
	);
}
