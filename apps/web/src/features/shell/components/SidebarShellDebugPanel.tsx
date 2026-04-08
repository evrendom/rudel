"use client";

import * as React from "react";
import { useSearchParams } from "react-router-dom";
import {
	getDefaultSidebarShellTuningState,
	getSidebarShellDebugSearchParams,
	type SidebarShellBooleanTuningKey,
	type SidebarShellDebugState,
	type SidebarShellDebugUpdate,
	type SidebarShellNumericTuningKey,
	type SidebarShellStringTuningKey,
	type SidebarShellTuningState,
} from "@/features/shell/config/sidebar-shell-debug";
import { cn } from "@/lib/utils";

type SidebarShellTrace = {
	gapWidth: string;
	containerWidth: string;
	innerWidth: string;
	insetWidth: string;
	firstNavRowWidth: string;
	firstNavIconLaneWidth: string;
	firstNavLabelWidth: string;
	workspaceRowWidth: string;
	userRowWidth: string;
};

type NumericControl = {
	key: SidebarShellNumericTuningKey;
	label: string;
	min: number;
	max: number;
	step: number;
	unit?: "rem" | "number";
};

type ColorControl = {
	key: SidebarShellStringTuningKey;
	label: string;
	placeholder?: string;
};

type ToggleControl = {
	key: SidebarShellBooleanTuningKey;
	label: string;
	description: string;
};

type TargetMeta = {
	label: string;
	className: string;
};

const numericSections: Array<{
	title: string;
	controls: NumericControl[];
}> = [
	{
		title: "Shell",
		controls: [
			{
				key: "collapsedWidth",
				label: "Collapsed width",
				min: 2.5,
				max: 5,
				step: 0.125,
			},
			{
				key: "expandedWidth",
				label: "Expanded width",
				min: 10,
				max: 18,
				step: 0.25,
			},
		],
	},
	{
		title: "Sections",
		controls: [
			{
				key: "sectionMarginTop",
				label: "Top margin",
				min: 0,
				max: 1.5,
				step: 0.0625,
			},
			{
				key: "railInsetLeft",
				label: "Rail inset left",
				min: 0,
				max: 1,
				step: 0.0625,
			},
			{
				key: "railInsetRight",
				label: "Rail inset right",
				min: 0,
				max: 1,
				step: 0.0625,
			},
			{
				key: "collapsedSectionPaddingX",
				label: "Collapsed top left/right",
				min: 0,
				max: 1,
				step: 0.0625,
			},
			{
				key: "expandedSectionPaddingX",
				label: "Expanded top left/right",
				min: 0,
				max: 1,
				step: 0.0625,
			},
			{
				key: "collapsedFooterPaddingX",
				label: "Collapsed bottom left/right",
				min: 0,
				max: 1,
				step: 0.0625,
			},
			{
				key: "expandedFooterPaddingX",
				label: "Expanded bottom left/right",
				min: 0,
				max: 1,
				step: 0.0625,
			},
			{
				key: "expandedFooterPaddingBottom",
				label: "Expanded bottom Y",
				min: 0,
				max: 1.5,
				step: 0.0625,
			},
			{
				key: "collapsedStackGap",
				label: "Collapsed gap",
				min: 0,
				max: 1,
				step: 0.0625,
			},
			{
				key: "expandedStackGap",
				label: "Expanded gap",
				min: 0,
				max: 1,
				step: 0.0625,
			},
		],
	},
	{
		title: "Rows",
		controls: [
			{
				key: "rowHeight",
				label: "Row height",
				min: 1.75,
				max: 3,
				step: 0.0625,
			},
			{
				key: "rowRadius",
				label: "Row radius",
				min: 0,
				max: 1.25,
				step: 0.0625,
			},
			{
				key: "collapsedRowPaddingLeft",
				label: "Collapsed hover left of icon",
				min: 0,
				max: 1,
				step: 0.0625,
			},
			{
				key: "collapsedRowPaddingRight",
				label: "Collapsed hover right of icon",
				min: 0,
				max: 1,
				step: 0.0625,
			},
			{
				key: "rowPaddingLeft",
				label: "Expanded row padding left",
				min: 0,
				max: 1.5,
				step: 0.0625,
			},
			{
				key: "rowPaddingRight",
				label: "Expanded row padding right",
				min: 0,
				max: 1.5,
				step: 0.0625,
			},
			{
				key: "rowGap",
				label: "Row gap",
				min: 0,
				max: 1.5,
				step: 0.0625,
			},
			{
				key: "iconLaneSize",
				label: "Icon lane",
				min: 1.75,
				max: 3,
				step: 0.0625,
			},
			{
				key: "iconSize",
				label: "Icon size",
				min: 0.875,
				max: 1.75,
				step: 0.0625,
			},
			{
				key: "avatarSize",
				label: "Avatar size",
				min: 1,
				max: 2,
				step: 0.0625,
			},
			{
				key: "labelFontSize",
				label: "Label size",
				min: 0.75,
				max: 1.125,
				step: 0.0625,
			},
			{
				key: "shortcutFontSize",
				label: "Shortcut size",
				min: 0.5,
				max: 0.875,
				step: 0.03125,
			},
		],
	},
	{
		title: "News Modal",
		controls: [
			{
				key: "newsCardTriggerZ",
				label: "Card z-index",
				min: 0,
				max: 300,
				step: 1,
				unit: "number",
			},
			{
				key: "newsBackdropZ",
				label: "Backdrop z-index",
				min: 0,
				max: 300,
				step: 1,
				unit: "number",
			},
			{
				key: "newsPopupZ",
				label: "Popup z-index",
				min: 0,
				max: 300,
				step: 1,
				unit: "number",
			},
			{
				key: "newsActiveSidebarZ",
				label: "Active sidebar z-index",
				min: 0,
				max: 300,
				step: 1,
				unit: "number",
			},
		],
	},
];

const REM_IN_PX = 16;

const colorControls: ColorControl[] = [
	{ key: "rowIdleBg", label: "Idle fill", placeholder: "transparent" },
	{
		key: "rowHoverBg",
		label: "Hover fill",
		placeholder: "var(--dashboard-01-rail-hover)",
	},
	{ key: "rowActiveBg", label: "Active fill", placeholder: "white" },
	{
		key: "rowFg",
		label: "Base text/icon",
		placeholder: "var(--dashboard-01-rail-icon)",
	},
	{
		key: "rowActiveFg",
		label: "Active text/icon",
		placeholder: "var(--dashboard-01-rail-icon-active)",
	},
];

const toggleControls: ToggleControl[] = [
	{
		key: "newsPromoteSidebar",
		label: "Promote sidebar while active",
		description:
			"Raises the sidebar container only while the news card modal or morph is active.",
	},
	{
		key: "newsSidebarOverflowVisible",
		label: "Sidebar overflow visible while active",
		description:
			"Disables sidebar clipping only while the news card modal or morph is active.",
	},
	{
		key: "newsUseSharedLayout",
		label: "Use shared layout morph",
		description:
			"Runs the open and close transition through Motion's shared layoutId handoff.",
	},
	{
		key: "newsUseMeasuredClose",
		label: "Use measured close overlay",
		description:
			"On close, measures the popup and card and animates a fixed clone back to the sidebar.",
	},
	{
		key: "newsUsePlainFixedPopup",
		label: "Use plain fixed popup",
		description:
			"Bypasses Base UI's Popup primitive and renders the open state as a plain fixed portal layer.",
	},
	{
		key: "newsHidePerformanceChartWhileActive",
		label: "Hide performance chart while active",
		description:
			"Temporarily hides the dashboard performance chart while the news card modal or morph is active.",
	},
	{
		key: "newsDisableChartInteractiveLayersWhileActive",
		label: "Disable chart tooltip layers while active",
		description:
			"Turns off the chart tooltip and foreignObject hover layer while the news card modal or morph is active.",
	},
	{
		key: "newsPromoteModalCompositorLayer",
		label: "Promote modal compositor layer",
		description:
			"Adds aggressive compositor hints to the modal popup and close clone while the news card animates.",
	},
];

function formatPx(value?: number) {
	return typeof value === "number" && Number.isFinite(value)
		? `${value.toFixed(1)}px`
		: "n/a";
}

function getTargetMeta(key: keyof SidebarShellTuningState): TargetMeta {
	switch (key) {
		case "collapsedWidth":
		case "expandedWidth":
		case "railInsetLeft":
		case "railInsetRight":
			return {
				label: "Container",
				className:
					"bg-violet-500/12 text-violet-700 ring-1 ring-violet-500/30 dark:text-violet-300",
			};
		case "iconLaneSize":
		case "iconSize":
		case "avatarSize":
			return {
				label: "Icon",
				className:
					"bg-sky-500/12 text-sky-700 ring-1 ring-sky-500/30 dark:text-sky-300",
			};
		case "labelFontSize":
		case "shortcutFontSize":
			return {
				label: "Label",
				className:
					"bg-rose-500/12 text-rose-700 ring-1 ring-rose-500/30 dark:text-rose-300",
			};
		case "newsCardTriggerZ":
		case "newsBackdropZ":
		case "newsPopupZ":
		case "newsActiveSidebarZ":
		case "newsPromoteSidebar":
		case "newsSidebarOverflowVisible":
			return {
				label: "Layer",
				className:
					"bg-emerald-500/12 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300",
			};
		case "newsUseSharedLayout":
		case "newsUseMeasuredClose":
		case "newsUsePlainFixedPopup":
		case "newsHidePerformanceChartWhileActive":
		case "newsDisableChartInteractiveLayersWhileActive":
		case "newsPromoteModalCompositorLayer":
			return {
				label: "Experiment",
				className:
					"bg-cyan-500/12 text-cyan-700 ring-1 ring-cyan-500/30 dark:text-cyan-300",
			};
		default:
			return {
				label: "Row",
				className:
					"bg-amber-500/12 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300",
			};
	}
}

function NumberField({
	key,
	label,
	value,
	min,
	max,
	step,
	unit,
	onChange,
}: NumericControl & {
	value: number;
	onChange: (nextValue: number) => void;
}) {
	const target = getTargetMeta(key);
	const usesRawValue = unit === "number";
	const sliderValue = usesRawValue ? value : value * REM_IN_PX;
	const sliderMin = usesRawValue ? min : min * REM_IN_PX;
	const sliderMax = usesRawValue ? max : max * REM_IN_PX;
	const sliderStep = usesRawValue ? step : step * REM_IN_PX;
	const displayPrecision = Number.isInteger(sliderStep) ? 0 : 1;
	const displayValue = usesRawValue
		? sliderValue.toFixed(displayPrecision)
		: `${sliderValue.toFixed(displayPrecision)} px`;

	return (
		<label className="grid gap-1.5">
			<div className="flex items-center justify-between gap-3 text-[11px] font-medium text-foreground/80">
				<div className="flex items-center gap-2">
					<span>{label}</span>
					<span
						className={cn(
							"rounded-full px-2 py-0.5 font-medium uppercase tracking-[0.12em]",
							target.className,
						)}
					>
						{target.label}
					</span>
				</div>
				<span className="font-mono text-foreground/60">{displayValue}</span>
			</div>
			<input
				type="range"
				min={sliderMin}
				max={sliderMax}
				step={sliderStep}
				value={sliderValue}
				onChange={(event) =>
					onChange(
						usesRawValue
							? Number.parseFloat(event.target.value)
							: Number.parseFloat(event.target.value) / REM_IN_PX,
					)
				}
				className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
			/>
		</label>
	);
}

function TextField({
	key,
	label,
	value,
	placeholder,
	onChange,
}: ColorControl & {
	value: string;
	onChange: (nextValue: string) => void;
}) {
	const target = getTargetMeta(key);

	return (
		<label className="grid gap-1.5">
			<div className="flex items-center gap-2 text-[11px] font-medium text-foreground/80">
				<span>{label}</span>
				<span
					className={cn(
						"rounded-full px-2 py-0.5 font-medium uppercase tracking-[0.12em]",
						target.className,
					)}
				>
					{target.label}
				</span>
			</div>
			<input
				type="text"
				value={value}
				placeholder={placeholder}
				onChange={(event) => onChange(event.target.value)}
				className="h-8 rounded-md border border-border/70 bg-background px-2 font-mono text-[11px] text-foreground outline-none ring-0 placeholder:text-muted-foreground"
			/>
		</label>
	);
}

function ToggleField({
	control,
	value,
	onChange,
}: {
	control: ToggleControl;
	value: boolean;
	onChange: (nextValue: boolean) => void;
}) {
	const target = getTargetMeta(control.key);

	return (
		<div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/40 p-3">
			<div>
				<div className="flex items-center gap-2">
					<p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
						{control.label}
					</p>
					<span
						className={cn(
							"rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]",
							target.className,
						)}
					>
						{target.label}
					</span>
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					{control.description}
				</p>
			</div>
			<button
				type="button"
				onClick={() => onChange(!value)}
				className={cn(
					"rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
					value
						? "bg-foreground text-background"
						: "bg-background text-foreground ring-1 ring-border",
				)}
			>
				{value ? "On" : "Off"}
			</button>
		</div>
	);
}

export function SidebarShellDebugPanel({
	debugState,
}: {
	debugState: SidebarShellDebugState;
}) {
	const [searchParams, setSearchParams] = useSearchParams();
	const [trace, setTrace] = React.useState<SidebarShellTrace | null>(null);

	const updateDebugState = React.useCallback(
		(nextState: SidebarShellDebugUpdate) => {
			setSearchParams(
				getSidebarShellDebugSearchParams(searchParams, nextState),
				{
					replace: true,
				},
			);
		},
		[searchParams, setSearchParams],
	);

	React.useEffect(() => {
		if (!debugState.enabled) {
			setTrace(null);
			return;
		}

		let frameId = 0;
		const readTrace = () => {
			const activeLayer = document.querySelector<HTMLElement>(
				'[data-sidebar-layer-active="true"]',
			);
			const gap = document.querySelector<HTMLElement>(
				'[data-slot="sidebar-gap"]',
			);
			const container = document.querySelector<HTMLElement>(
				'[data-slot="sidebar-container"]',
			);
			const inner = document.querySelector<HTMLElement>(
				'[data-slot="sidebar-inner"]',
			);
			const inset = document.querySelector<HTMLElement>(
				'[data-slot="sidebar-inset"]',
			);
			const firstNavRow =
				activeLayer?.querySelector<HTMLElement>("[data-sidebar-nav-row]") ??
				document.querySelector<HTMLElement>("[data-sidebar-nav-row]");
			const firstNavIconLane =
				activeLayer?.querySelector<HTMLElement>(
					"[data-sidebar-nav-icon-lane]",
				) ??
				document.querySelector<HTMLElement>("[data-sidebar-nav-icon-lane]");
			const firstNavLabel =
				activeLayer?.querySelector<HTMLElement>("[data-sidebar-nav-label]") ??
				document.querySelector<HTMLElement>("[data-sidebar-nav-label]");
			const workspaceRow =
				activeLayer?.querySelector<HTMLElement>(
					"[data-sidebar-workspace-row]",
				) ??
				document.querySelector<HTMLElement>("[data-sidebar-workspace-row]");
			const userRow =
				activeLayer?.querySelector<HTMLElement>("[data-sidebar-user-row]") ??
				document.querySelector<HTMLElement>("[data-sidebar-user-row]");

			setTrace({
				gapWidth: formatPx(gap?.getBoundingClientRect().width),
				containerWidth: formatPx(container?.getBoundingClientRect().width),
				innerWidth: formatPx(inner?.getBoundingClientRect().width),
				insetWidth: formatPx(inset?.getBoundingClientRect().width),
				firstNavRowWidth: formatPx(firstNavRow?.getBoundingClientRect().width),
				firstNavIconLaneWidth: formatPx(
					firstNavIconLane?.getBoundingClientRect().width,
				),
				firstNavLabelWidth: formatPx(
					firstNavLabel?.getBoundingClientRect().width,
				),
				workspaceRowWidth: formatPx(
					workspaceRow?.getBoundingClientRect().width,
				),
				userRowWidth: formatPx(userRow?.getBoundingClientRect().width),
			});

			frameId = window.requestAnimationFrame(readTrace);
		};

		frameId = window.requestAnimationFrame(readTrace);
		return () => window.cancelAnimationFrame(frameId);
	}, [debugState.enabled]);

	if (!debugState.enabled) {
		return (
			<button
				type="button"
				onClick={() => updateDebugState({ enabled: true })}
				className="pointer-events-auto fixed right-4 top-4 z-[120] rounded-full border border-foreground/15 bg-background/92 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-foreground shadow-lg ring-1 ring-foreground/10 backdrop-blur-md transition-colors hover:bg-background"
			>
				Open Shell HUD
			</button>
		);
	}

	return (
		<div className="pointer-events-none fixed right-4 top-4 z-[120] flex h-[calc(100vh-2rem)] w-[26rem] max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-2xl border border-foreground/15 bg-background/96 p-3 text-sm shadow-2xl ring-1 ring-foreground/10 backdrop-blur-md">
			<div className="pointer-events-auto flex items-start justify-between gap-3">
				<div>
					<p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
						Shell HUD
					</p>
					<p className="mt-1 text-sm text-foreground">
						Live controls for the local sidebar island and news modal layering.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						onClick={() =>
							updateDebugState({ tuning: getDefaultSidebarShellTuningState() })
						}
					>
						Reset
					</button>
					<button
						type="button"
						className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						onClick={() => updateDebugState({ enabled: false })}
					>
						Close
					</button>
				</div>
			</div>
			<div className="pointer-events-auto flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/40 p-3">
				<div>
					<p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
						Debug Borders
					</p>
					<p className="mt-1 text-xs text-muted-foreground">
						Toggle the paint map without losing measurements or tuning.
					</p>
				</div>
				<button
					type="button"
					onClick={() =>
						updateDebugState({ showBorders: !debugState.showBorders })
					}
					className={cn(
						"rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
						debugState.showBorders
							? "bg-foreground text-background"
							: "bg-background text-foreground ring-1 ring-border",
					)}
				>
					{debugState.showBorders ? "On" : "Off"}
				</button>
			</div>
			<div className="pointer-events-auto flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/40 p-3">
				<div>
					<div className="flex items-center gap-2">
						<p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
							Always Show Labels
						</p>
						<span className="rounded-full bg-rose-500/12 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-rose-700 ring-1 ring-rose-500/30 dark:text-rose-300">
							Label
						</span>
					</div>
					<p className="mt-1 text-xs text-muted-foreground">
						Keep labels rendered and let the shell clip them instead of the row.
					</p>
				</div>
				<button
					type="button"
					onClick={() =>
						updateDebugState({
							alwaysShowLabels: !debugState.alwaysShowLabels,
						})
					}
					className={cn(
						"rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
						debugState.alwaysShowLabels
							? "bg-foreground text-background"
							: "bg-background text-foreground ring-1 ring-border",
					)}
				>
					{debugState.alwaysShowLabels ? "On" : "Off"}
				</button>
			</div>
			<div className="pointer-events-auto min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
				<div className="grid gap-3 rounded-xl border border-border/70 bg-muted/40 p-3">
					<p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
						News Modal Toggles
					</p>
					{toggleControls.map((control) => (
						<ToggleField
							key={control.key}
							control={control}
							value={debugState.tuning[control.key]}
							onChange={(nextValue) =>
								updateDebugState({
									tuning: {
										[control.key]: nextValue,
									} as Partial<SidebarShellTuningState>,
								})
							}
						/>
					))}
				</div>
				{numericSections.map((section) => (
					<div
						key={section.title}
						className="grid gap-3 rounded-xl border border-border/70 bg-muted/40 p-3"
					>
						<p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
							{section.title}
						</p>
						{section.controls.map((control) => {
							const { key, ...fieldProps } = control;
							return (
								<NumberField
									key={key}
									{...fieldProps}
									value={debugState.tuning[key] as number}
									onChange={(nextValue) =>
										updateDebugState({
											tuning: {
												[key]: nextValue,
											} as Partial<SidebarShellTuningState>,
										})
									}
								/>
							);
						})}
					</div>
				))}
				<div className="grid gap-3 rounded-xl border border-border/70 bg-muted/40 p-3">
					<p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
						Fills
					</p>
					{colorControls.map((control) => {
						const { key, ...fieldProps } = control;
						return (
							<TextField
								key={key}
								{...fieldProps}
								value={debugState.tuning[key] as string}
								onChange={(nextValue) =>
									updateDebugState({
										tuning: {
											[key]: nextValue,
										} as Partial<SidebarShellTuningState>,
									})
								}
							/>
						);
					})}
				</div>
				{trace ? (
					<div className="grid gap-1 rounded-xl border border-border/70 bg-muted/40 p-3 font-mono text-[11px] leading-5 text-foreground/80">
						<div>gap.width: {trace.gapWidth}</div>
						<div>container.width: {trace.containerWidth}</div>
						<div>inner.width: {trace.innerWidth}</div>
						<div>inset.width: {trace.insetWidth}</div>
						<div>nav.row.width: {trace.firstNavRowWidth}</div>
						<div>nav.icon.width: {trace.firstNavIconLaneWidth}</div>
						<div>nav.label.width: {trace.firstNavLabelWidth}</div>
						<div>workspace.width: {trace.workspaceRowWidth}</div>
						<div>user.width: {trace.userRowWidth}</div>
					</div>
				) : null}
			</div>
		</div>
	);
}
