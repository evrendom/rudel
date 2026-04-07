import {
	type BarCustomLayerProps,
	type BarTooltipProps,
	ResponsiveBar,
} from "@nivo/bar";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMountEffect } from "@/app/hooks/useMountEffect";
import {
	getSidebarShellDebugState,
	SIDEBAR_NEWS_ACTIVE_ATTRIBUTE,
} from "@/features/shell/config/sidebar-shell-debug";

type SeriesKey = "commits" | "sessions";

const chartSeries = [
	{
		color: "var(--dashboard-01-tone-orange)",
		key: "commits" as const,
		label: "Committed sessions",
	},
	{
		color: "var(--dashboard-01-tone-blue)",
		key: "sessions" as const,
		label: "All sessions",
	},
] as const;

const ZERO_BAR_STUB_HEIGHT = 6;

export type DashboardPerformanceDatum = {
	axisLabel: string;
	commits: number;
	fullLabel: string;
	id: string;
	imageUrl?: string;
	sessions: number;
};

type DashboardPerformanceChartProps = {
	data: DashboardPerformanceDatum[];
};

type DashboardPerformanceChartRow = DashboardPerformanceDatum;

function getAvatarInitials(fullLabel: string) {
	const fallbackToken = fullLabel.includes("@")
		? (fullLabel.split("@")[0] ?? fullLabel)
		: fullLabel;
	const parts = fallbackToken.split(/\s+/).filter(Boolean);

	if (parts.length === 0) {
		return "AI";
	}

	if (parts.length === 1) {
		return parts[0]?.slice(0, 2).toUpperCase() ?? "AI";
	}

	return `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function useSidebarNewsCardActive() {
	const [isActive, setIsActive] = useState(false);

	useMountEffect(() => {
		const preview = document.querySelector(".dashboard-01-preview");
		if (!(preview instanceof HTMLElement)) {
			return;
		}

		const sync = () => {
			setIsActive(
				preview.getAttribute(SIDEBAR_NEWS_ACTIVE_ATTRIBUTE) === "true",
			);
		};

		sync();

		const observer = new MutationObserver(sync);
		observer.observe(preview, {
			attributes: true,
			attributeFilter: [SIDEBAR_NEWS_ACTIVE_ATTRIBUTE],
		});

		return () => observer.disconnect();
	});

	return isActive;
}

function DashboardPerformanceTooltipContent({
	activeKey,
	commits,
	fullLabel,
	sessions,
}: {
	activeKey: SeriesKey;
	commits: number;
	fullLabel: string;
	sessions: number;
}) {
	return (
		<div className="grid min-w-44 gap-2 rounded-2xl border border-border/60 bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
			<div className="font-medium text-foreground">{fullLabel}</div>
			<div className="grid gap-1">
				{chartSeries.map((series) => {
					const value = series.key === "commits" ? commits : sessions;
					const isActive = activeKey === series.key;

					return (
						<div
							key={series.key}
							className="flex items-center justify-between gap-3"
						>
							<div className="flex items-center gap-2">
								<span
									className="size-2.5 rounded-full"
									style={{ backgroundColor: series.color }}
								/>
								<span
									className={
										isActive ? "text-foreground" : "text-muted-foreground"
									}
								>
									{series.label}
								</span>
							</div>
							<span className="font-mono font-semibold tabular-nums text-foreground">
								{value}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}

export function DashboardPerformanceChart({
	data,
}: DashboardPerformanceChartProps) {
	const [searchParams] = useSearchParams();
	const debugState = getSidebarShellDebugState(searchParams);
	const isSidebarNewsCardActive = useSidebarNewsCardActive();
	const shouldDisableInteractiveLayers =
		debugState.tuning.newsDisableChartInteractiveLayersWhileActive &&
		isSidebarNewsCardActive;

	const semanticDataById = useMemo(
		() => new Map(data.map((entry) => [entry.id, entry] as const)),
		[data],
	);
	const maxMetricValue = useMemo(
		() =>
			data.reduce(
				(maxValue, entry) => Math.max(maxValue, entry.commits, entry.sessions),
				0,
			),
		[data],
	);
	const avatarLabelLayer = useCallback(
		({
			bars,
			innerHeight,
		}: BarCustomLayerProps<DashboardPerformanceChartRow>) => {
			if (bars.length === 0) {
				return null;
			}

			const labelGroups = new Map<
				string,
				{
					datum: DashboardPerformanceDatum;
					left: number;
					right: number;
				}
			>();

			for (const bar of bars) {
				const datum = semanticDataById.get(bar.data.data.id);

				if (!datum) {
					continue;
				}

				const nextLeft = bar.x;
				const nextRight = bar.x + bar.width;
				const currentGroup = labelGroups.get(datum.id);

				labelGroups.set(datum.id, {
					datum,
					left: currentGroup ? Math.min(currentGroup.left, nextLeft) : nextLeft,
					right: currentGroup
						? Math.max(currentGroup.right, nextRight)
						: nextRight,
				});
			}

			const semanticBars = Array.from(labelGroups.values()).sort(
				(left, right) => left.left - right.left,
			);

			if (semanticBars.length === 0) {
				return null;
			}

			const steps = semanticBars
				.slice(1)
				.flatMap((entry, index) => {
					const previousEntry = semanticBars[index];

					if (!previousEntry) {
						return [];
					}

					return [entry.left - previousEntry.left];
				})
				.filter((step) => step > 0);
			const averageStep =
				steps.length > 0
					? steps.reduce((total, step) => total + step, 0) / steps.length
					: 120;
			const labelWidth = Math.max(110, Math.min(averageStep - 6, 180));
			const labelY = innerHeight + 8;

			return (
				<g>
					{semanticBars.map(({ datum, left, right }) => {
						const centerX = (left + right) / 2;

						return (
							<foreignObject
								key={`avatar-label-${datum.id}`}
								x={centerX - labelWidth / 2}
								y={labelY}
								width={labelWidth}
								height={34}
								requiredExtensions="http://www.w3.org/1999/xhtml"
							>
								<div className="flex h-full w-full items-center justify-center">
									<div className="inline-flex min-w-0 max-w-full items-center justify-center gap-2 px-1">
										<div className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/60 bg-[color:var(--dashboardy-surface)] shadow-sm">
											{datum.imageUrl ? (
												<img
													src={datum.imageUrl}
													alt={datum.fullLabel}
													className="size-full object-cover"
												/>
											) : (
												<span className="text-[10px] font-semibold text-[color:var(--dashboardy-heading)]">
													{getAvatarInitials(datum.fullLabel)}
												</span>
											)}
										</div>
										<span className="min-w-0 max-w-full truncate text-left text-[11px] font-semibold leading-4 text-[color:var(--dashboardy-subheading)]">
											{datum.axisLabel}
										</span>
									</div>
								</div>
							</foreignObject>
						);
					})}
				</g>
			);
		},
		[semanticDataById],
	);
	const zeroBarStubLayer = useCallback(
		({ bars }: BarCustomLayerProps<DashboardPerformanceChartRow>) => {
			const zeroValueBars = bars.filter((bar) => (bar.data.value ?? 0) === 0);

			if (zeroValueBars.length === 0) {
				return null;
			}

			return (
				<g>
					{zeroValueBars.map((bar) => (
						<rect
							key={`zero-bar-${bar.key}`}
							x={bar.x}
							y={Math.max(bar.y - ZERO_BAR_STUB_HEIGHT, 0)}
							width={bar.width}
							height={ZERO_BAR_STUB_HEIGHT}
							rx={Math.min(4, bar.width / 2)}
							fill="var(--dashboardy-subtle)"
							fillOpacity={0.35}
						/>
					))}
				</g>
			);
		},
		[],
	);

	return (
		<div className="relative h-full w-full">
			<ResponsiveBar<DashboardPerformanceChartRow>
				data={data}
				keys={chartSeries.map((series) => series.key)}
				indexBy="id"
				margin={{ top: 8, right: 8, bottom: 42, left: 42 }}
				padding={0.28}
				innerPadding={6}
				groupMode="grouped"
				layout="vertical"
				valueScale={{ type: "linear", min: 0, max: "auto", nice: true }}
				indexScale={{ type: "band", round: false }}
				animate
				motionConfig="gentle"
				borderRadius={12}
				enableGridY={false}
				enableGridX={false}
				enableLabel={false}
				isInteractive={!shouldDisableInteractiveLayers}
				axisTop={null}
				axisRight={null}
				axisBottom={null}
				axisLeft={{
					tickValues: maxMetricValue > 0 ? 5 : [0],
					tickSize: 0,
					tickPadding: 12,
					format: (value) => `${Math.round(value)}`,
				}}
				colors={(datum) =>
					chartSeries.find((series) => series.key === datum.id)?.color ??
					"var(--dashboard-01-tone-blue)"
				}
				theme={{
					axis: {
						domain: {
							line: {
								strokeWidth: 0,
							},
						},
						ticks: {
							line: {
								strokeWidth: 0,
							},
							text: {
								fill: "#9A9A9A",
								fontFamily: "Nunito",
								fontSize: 13,
								fontStyle: "normal",
								fontWeight: 800,
								letterSpacing: "-0.01em",
								lineHeight: "16px",
							},
						},
					},
					grid: {
						line: {
							strokeWidth: 0,
						},
					},
				}}
				tooltip={
					shouldDisableInteractiveLayers
						? undefined
						: (datum: BarTooltipProps<DashboardPerformanceChartRow>) => (
								<DashboardPerformanceTooltipContent
									activeKey={String(datum.id) as SeriesKey}
									commits={datum.data.commits}
									fullLabel={datum.data.fullLabel}
									sessions={datum.data.sessions}
								/>
							)
				}
				layers={["axes", "bars", zeroBarStubLayer, avatarLabelLayer]}
				role="img"
				ariaLabel="Developer commits and sessions comparison"
			/>
		</div>
	);
}
