import type { ReactNode } from "react";
import { useId, useState } from "react";
import type {
	SessionThreadOverviewChartRow,
	SessionThreadOverviewMetric,
} from "./session-thread-overview-chart";
import { buildSessionThreadOverviewMonotonePath } from "./session-thread-overview-chart";
import type { SessionThreadOverviewStripConfig } from "./session-thread-overview-config";
import { buildSessionOverviewLabFixture } from "./session-thread-overview-lab-fixtures";
import { formatBreakCutoffLabel } from "./session-thread-overview-strip-layers";
import {
	formatTimelineTick,
	getBarHeight,
	getCostLineY,
	SESSION_OVERVIEW_METRICS,
	SessionOverviewMetricButton,
	SessionOverviewReadout,
	SessionTurnEventGlyphs,
} from "./session-thread-overview-strip-parts";

const GALLERY_TILE_CLASS_NAME =
	"rounded-lg border border-(--session-overview-border) bg-(--session-overview-surface) p-3";

function createGalleryRow(
	overrides: Partial<SessionThreadOverviewChartRow>,
): SessionThreadOverviewChartRow {
	return {
		cost: 0.42,
		editCount: 0,
		errorCount: 0,
		index: 0,
		inputTokens: 120_000,
		outputTokens: 2_400,
		reasoningCount: 1,
		skillCount: 0,
		subagentCount: 0,
		xEndRatio: 0.5,
		xRatio: 0.5,
		xStartRatio: 0.5,
		...overrides,
	};
}

function GalleryTile({
	children,
	label,
}: {
	children: ReactNode;
	label: string;
}) {
	return (
		<div className={GALLERY_TILE_CLASS_NAME}>
			<h4 className="mb-2 text-[0.6875rem] font-medium tracking-[0.04em] text-(--session-overview-subtle) uppercase">
				{label}
			</h4>
			{children}
		</div>
	);
}

function MetricButtonsTile() {
	const [activeMetric, setActiveMetric] =
		useState<SessionThreadOverviewMetric>("cost");
	const definitions = SESSION_OVERVIEW_METRICS.slice(0, 3);
	return (
		<GalleryTile label="Metric buttons — idle / active / long value">
			<div className="flex flex-wrap items-center gap-1">
				{definitions.map((definition, index) => (
					<SessionOverviewMetricButton
						key={definition.metric}
						active={activeMetric === definition.metric}
						definition={definition}
						onChange={setActiveMetric}
						value={index === 2 ? "1,234,567 tok" : "$12.34"}
					/>
				))}
			</div>
		</GalleryTile>
	);
}

function EventGlyphsTile({
	config,
}: {
	config: SessionThreadOverviewStripConfig;
}) {
	const rows = [
		{
			label: "×1 each kind",
			row: createGalleryRow({ editCount: 1, skillCount: 1, subagentCount: 1 }),
		},
		{ label: "×3 skills", row: createGalleryRow({ skillCount: 3 }) },
		{ label: "overflow ×12", row: createGalleryRow({ skillCount: 12 }) },
	];
	return (
		<GalleryTile label="Event glyphs — kinds, repeats, overflow">
			<div className="grid gap-1.5">
				{rows.map((entry) => (
					<div key={entry.label} className="flex items-center gap-2">
						<svg
							aria-hidden="true"
							className="h-4 w-24 shrink-0"
							viewBox={`40 ${config.eventY - 6} 40 12`}
						>
							<SessionTurnEventGlyphs config={config} row={entry.row} x={60} />
						</svg>
						<span className="text-xs text-(--session-overview-muted)">
							{entry.label}
						</span>
					</div>
				))}
			</div>
		</GalleryTile>
	);
}

function BarsAndErrorsTile({
	config,
}: {
	config: SessionThreadOverviewStripConfig;
}) {
	const bars = [
		{ label: "sliver", ratio: 0.02, selected: false, withError: true },
		{ label: "median", ratio: 0.45, selected: false, withError: false },
		{ label: "max", ratio: 1, selected: false, withError: true },
		{ label: "selected", ratio: 0.7, selected: true, withError: false },
	];
	return (
		<GalleryTile label="Bars — min height, max, selection, error tick placement">
			<svg
				aria-hidden="true"
				className="h-20 w-full"
				preserveAspectRatio="xMidYMid meet"
				viewBox={`0 0 160 ${config.chartHeight}`}
			>
				<path
					d={`M 4 ${config.axisY} H 156`}
					className="stroke-(--session-overview-border)"
				/>
				{bars.map((bar, index) => {
					const x = 24 + index * 36;
					const barHeight = getBarHeight(bar.ratio, config);
					const errorY =
						config.errorPlacement === "fixed-lane"
							? Math.max(config.axisY - config.maxBarHeight - 6, 3)
							: Math.max(3, config.axisY - barHeight - 4);
					return (
						<g key={bar.label}>
							<rect
								className={
									bar.selected
										? "stroke-(--session-overview-accent)"
										: undefined
								}
								height={barHeight}
								rx="1.5"
								strokeWidth={bar.selected ? 1.5 : 0}
								style={{
									fill: `color-mix(in srgb, var(--session-overview-accent) ${config.barAccentMix}%, var(--session-overview-surface))`,
								}}
								width={8}
								x={x - 4}
								y={config.axisY - barHeight}
							/>
							{bar.withError ? (
								<path
									d={`M ${x - config.errorTickHalfWidth} ${errorY} H ${x + config.errorTickHalfWidth}`}
									className="stroke-red-600 dark:stroke-red-400"
									strokeLinecap="round"
									strokeWidth={config.errorTickStroke}
								/>
							) : null}
							<text
								className="fill-(--session-overview-subtle) text-[0.4rem]"
								textAnchor="middle"
								x={x}
								y={config.chartHeight - 4}
							>
								{bar.label}
							</text>
						</g>
					);
				})}
			</svg>
		</GalleryTile>
	);
}

function IdleBreakTile() {
	return (
		<GalleryTile label="Idle break — cut-off marker and open tooltip">
			<div className="flex items-center gap-4">
				<div className="relative flex h-8 w-24 items-center">
					<div className="absolute inset-x-0 top-1/2 border-t border-(--session-overview-border)" />
					<span className="relative mx-auto bg-(--session-overview-surface) px-0.5 font-mono text-[0.5625rem] font-medium text-(--session-overview-muted) tabular-nums">
						{formatBreakCutoffLabel(12 * 60 * 60 * 1_000)}
					</span>
				</div>
				<span className="rounded-md border border-(--session-overview-border) bg-(--session-overview-surface) px-2 py-1 text-sm whitespace-nowrap text-(--session-overview-text) shadow-sm dark:shadow-none">
					Aug 2 18:32–Aug 3 06:50 · 12h 18m idle
				</span>
			</div>
		</GalleryTile>
	);
}

function TickLabelsTile() {
	const sameDayBase = Date.parse("2026-08-02T10:00:00.000Z");
	const entries = [
		{
			label: "same day",
			value: formatTimelineTick(sameDayBase + 3_600_000, sameDayBase),
		},
		{
			label: "day boundary",
			value: formatTimelineTick(
				Date.parse("2026-08-03T09:15:00.000Z"),
				sameDayBase,
			),
		},
		{
			label: "midnight",
			value: formatTimelineTick(
				Date.parse("2026-08-03T00:00:00.000Z"),
				sameDayBase,
			),
		},
		{ label: "first tick", value: formatTimelineTick(sameDayBase, undefined) },
	];
	return (
		<GalleryTile label="Tick labels — day-aware formats">
			<dl className="grid gap-1">
				{entries.map((entry) => (
					<div key={entry.label} className="flex items-baseline gap-2">
						<dt className="w-24 text-xs text-(--session-overview-subtle)">
							{entry.label}
						</dt>
						<dd className="font-mono text-[0.6875rem] text-(--session-overview-text) tabular-nums">
							{entry.value}
						</dd>
					</div>
				))}
			</dl>
		</GalleryTile>
	);
}

function ReadoutTile({ config }: { config: SessionThreadOverviewStripConfig }) {
	const readoutId = useId();
	const fixtureOption =
		buildSessionOverviewLabFixture("single-turn").options[0];
	if (!fixtureOption) {
		return null;
	}
	const row = createGalleryRow({ errorCount: 1 });
	return (
		<GalleryTile label="Crosshair readout — with error, centered">
			<div className="relative h-16">
				<SessionOverviewReadout
					activeMetric="reasoning"
					config={config}
					option={fixtureOption}
					readoutId={readoutId}
					row={row}
					xRatio={0.5}
				/>
			</div>
		</GalleryTile>
	);
}

function ViewportBandTile() {
	return (
		<GalleryTile label="Viewport band — narrow clamp vs wide, with badge">
			<div className="grid gap-2">
				{[
					{ label: "narrow", width: "4%" },
					{ label: "wide", width: "38%" },
				].map((band) => (
					<div
						key={band.label}
						className="relative h-8 rounded-md bg-(--session-overview-hover)"
					>
						<div
							className="absolute inset-y-1 left-[18%] rounded-[2px] bg-[color-mix(in_srgb,var(--session-overview-accent)_9%,transparent)] outline outline-1 outline-[color-mix(in_srgb,var(--session-overview-accent)_38%,transparent)]"
							style={{ width: band.width }}
						/>
						<span className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-(--session-overview-accent) px-2 py-0.5 font-mono text-[0.625rem] font-medium text-white tabular-nums">
							$2.25 · Turn 14
						</span>
					</div>
				))}
			</div>
		</GalleryTile>
	);
}

function CostSplineTile({
	config,
}: {
	config: SessionThreadOverviewStripConfig;
}) {
	const cumulativeValues = [0, 0.4, 0.4, 0.4, 1.8, 2.1, 2.1, 4.6, 5];
	const maximum = cumulativeValues.at(-1) ?? 1;
	const points = cumulativeValues.map((value, index) => ({
		x: 6 + (index / (cumulativeValues.length - 1)) * 148,
		y: getCostLineY(value, maximum, config),
	}));
	const path = buildSessionThreadOverviewMonotonePath(points);
	const singlePointPath = buildSessionThreadOverviewMonotonePath([
		{ x: 80, y: getCostLineY(1, 1, config) },
	]);
	return (
		<GalleryTile label="Cost spline — flat runs stay flat (monotone), single point">
			<svg
				aria-hidden="true"
				className="h-16 w-full"
				preserveAspectRatio="xMidYMid meet"
				viewBox={`0 0 160 ${config.chartHeight}`}
			>
				<path
					d={`M 4 ${config.axisY} H 156`}
					className="stroke-(--session-overview-border)"
				/>
				<path
					d={path}
					className="fill-none stroke-(--session-overview-accent)"
					strokeLinecap="round"
					strokeWidth={config.costLineWidth}
					style={{ opacity: config.costLineOpacity }}
				/>
				{singlePointPath ? (
					<circle
						className="fill-(--session-overview-accent)"
						cx={80}
						cy={getCostLineY(1, 1, config)}
						r="1.5"
						style={{ opacity: 0.4 }}
					/>
				) : null}
			</svg>
		</GalleryTile>
	);
}

export function SessionThreadOverviewLabGallery({
	config,
}: {
	config: SessionThreadOverviewStripConfig;
}) {
	return (
		<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
			<MetricButtonsTile />
			<EventGlyphsTile config={config} />
			<BarsAndErrorsTile config={config} />
			<IdleBreakTile />
			<TickLabelsTile />
			<ReadoutTile config={config} />
			<ViewportBandTile />
			<CostSplineTile config={config} />
		</div>
	);
}
