import {
	Fragment,
	type KeyboardEvent,
	useCallback,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import { cn } from "@/lib/utils";
import { buildSessionAdalineSpans } from "./session-adaline-model";
import type { SelectedTurnOption } from "./session-selected-turn";
import { SessionTurnTablePane } from "./session-turn-table-pane";
import type { SessionTurnTimelineThicknessMetric } from "./session-turn-timeline";
import { SessionTurnTimelineView } from "./session-turn-timeline-view";
import {
	buildSessionTurnWaterfallLayout,
	formatSessionTurnWaterfallMetricValue,
	type SessionTurnWaterfallMetric,
} from "./session-turn-waterfall";
import { buildSessionTurnWaterfallTrace } from "./session-turn-waterfall-trace";
import { SessionTurnWaterfallTreeTurn } from "./session-turn-waterfall-tree";

type SessionLedgerView = "ledger" | "timeline" | "waterfall";

const SESSION_LEDGER_VIEWS: readonly {
	label: string;
	value: SessionLedgerView;
}[] = [
	{ label: "Ledger", value: "ledger" },
	{ label: "Waterfall", value: "waterfall" },
	{ label: "Timeline", value: "timeline" },
];

const SESSION_WATERFALL_METRICS: readonly {
	label: string;
	value: SessionTurnWaterfallMetric;
}[] = [
	{ label: "Time", value: "time" },
	{ label: "Context", value: "context" },
	{ label: "Cost", value: "cost" },
];

const SESSION_TIMELINE_THICKNESS_METRICS: readonly {
	label: string;
	value: SessionTurnTimelineThicknessMetric;
}[] = [
	{ label: "Tokens", value: "tokens" },
	{ label: "Cost", value: "cost" },
	{ label: "Tools", value: "tools" },
];

function getAdjacentValue<TValue extends string>(
	values: readonly TValue[],
	current: TValue,
	direction: -1 | 1,
) {
	const currentIndex = values.indexOf(current);
	const nextIndex = (currentIndex + direction + values.length) % values.length;
	return values[nextIndex] ?? current;
}

function SessionLedgerViewTabs({
	activeView,
	onChange,
	panelId,
	tabIdPrefix,
}: {
	activeView: SessionLedgerView;
	onChange: (view: SessionLedgerView) => void;
	panelId: string;
	tabIdPrefix: string;
}) {
	function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
			return;
		}

		event.preventDefault();
		const nextView = getAdjacentValue(
			SESSION_LEDGER_VIEWS.map((view) => view.value),
			activeView,
			event.key === "ArrowRight" ? 1 : -1,
		);
		onChange(nextView);
		event.currentTarget
			.querySelector<HTMLButtonElement>(`[data-ledger-view="${nextView}"]`)
			?.focus();
	}

	return (
		<div
			role="tablist"
			aria-label="Session ledger view"
			className="flex min-w-0 items-center gap-1 overflow-x-auto"
			onKeyDown={handleKeyDown}
		>
			{SESSION_LEDGER_VIEWS.map((view) => {
				const selected = view.value === activeView;
				return (
					<button
						key={view.value}
						type="button"
						role="tab"
						id={`${tabIdPrefix}-${view.value}`}
						aria-controls={panelId}
						aria-selected={selected}
						className={cn(
							"relative h-8 shrink-0 rounded-md px-3 text-sm font-medium tracking-[-0.01em] outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)",
							selected
								? "bg-(--session-overview-hover) text-(--session-overview-text)"
								: "text-(--session-overview-muted) hover:text-(--session-overview-text)",
						)}
						data-ledger-view={view.value}
						tabIndex={selected ? 0 : -1}
						onClick={() => onChange(view.value)}
					>
						{view.label}
						<span
							aria-hidden="true"
							className="pointer-fine:hidden absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2"
						/>
					</button>
				);
			})}
		</div>
	);
}

function SessionWaterfallMetricTabs({
	metric,
	onChange,
}: {
	metric: SessionTurnWaterfallMetric;
	onChange: (metric: SessionTurnWaterfallMetric) => void;
}) {
	function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
			return;
		}

		event.preventDefault();
		const nextMetric = getAdjacentValue(
			SESSION_WATERFALL_METRICS.map((option) => option.value),
			metric,
			event.key === "ArrowRight" ? 1 : -1,
		);
		onChange(nextMetric);
		event.currentTarget
			.querySelector<HTMLButtonElement>(
				`[data-waterfall-metric="${nextMetric}"]`,
			)
			?.focus();
	}

	return (
		<div
			role="tablist"
			aria-label="Waterfall metric"
			className="flex shrink-0 items-center rounded-md bg-(--session-overview-hover) p-0.5"
			onKeyDown={handleKeyDown}
		>
			{SESSION_WATERFALL_METRICS.map((option) => {
				const selected = option.value === metric;
				return (
					<button
						key={option.value}
						type="button"
						role="tab"
						aria-selected={selected}
						className={cn(
							"h-7 rounded-sm px-2.5 text-xs font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)",
							selected
								? "bg-(--session-overview-surface) text-(--session-overview-text)"
								: "text-(--session-overview-muted) hover:text-(--session-overview-text)",
						)}
						data-waterfall-metric={option.value}
						tabIndex={selected ? 0 : -1}
						onClick={() => onChange(option.value)}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}

function SessionTimelineThicknessTabs({
	metric,
	onChange,
}: {
	metric: SessionTurnTimelineThicknessMetric;
	onChange: (metric: SessionTurnTimelineThicknessMetric) => void;
}) {
	function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
		if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
			return;
		}

		event.preventDefault();
		const nextMetric = getAdjacentValue(
			SESSION_TIMELINE_THICKNESS_METRICS.map((option) => option.value),
			metric,
			event.key === "ArrowRight" ? 1 : -1,
		);
		onChange(nextMetric);
		event.currentTarget
			.querySelector<HTMLButtonElement>(
				`[data-timeline-metric="${nextMetric}"]`,
			)
			?.focus();
	}

	return (
		<div
			role="tablist"
			aria-label="Timeline thickness metric"
			className="flex shrink-0 items-center rounded-md bg-(--session-overview-hover) p-0.5"
			onKeyDown={handleKeyDown}
		>
			{SESSION_TIMELINE_THICKNESS_METRICS.map((option) => {
				const selected = option.value === metric;
				return (
					<button
						key={option.value}
						type="button"
						role="tab"
						aria-selected={selected}
						className={cn(
							"h-7 rounded-sm px-2.5 text-xs font-medium outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--session-overview-accent)",
							selected
								? "bg-(--session-overview-surface) text-(--session-overview-text)"
								: "text-(--session-overview-muted) hover:text-(--session-overview-text)",
						)}
						data-timeline-metric={option.value}
						tabIndex={selected ? 0 : -1}
						onClick={() => onChange(option.value)}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}

function SessionTurnWaterfall({
	metric,
	model,
	onSelect,
	options,
	selectedIndex,
	userImageUrl,
	userLabel,
}: {
	metric: SessionTurnWaterfallMetric;
	model: string | undefined;
	onSelect: (index: number) => void;
	options: readonly SelectedTurnOption[];
	selectedIndex: number;
	userImageUrl: string | undefined;
	userLabel: string;
}) {
	const onSelectRef = useRef(onSelect);
	onSelectRef.current = onSelect;
	const stableOnSelect = useCallback((index: number) => {
		onSelectRef.current(index);
	}, []);
	const layout = useMemo(
		() => buildSessionTurnWaterfallLayout(options, metric),
		[metric, options],
	);
	const traces = useMemo(
		() =>
			options.map((option) =>
				buildSessionTurnWaterfallTrace(
					buildSessionAdalineSpans(option),
					option.metrics.skills,
				),
			),
		[options],
	);
	const maximumLabel = formatSessionTurnWaterfallMetricValue(
		layout.maximum,
		metric,
	);
	const metricDescription =
		metric === "time"
			? "Session trace"
			: metric === "context"
				? "Context tokens by turn"
				: "Estimated cost by turn";
	const modelLabel = model ? formatModelDisplayLabel(model) : "Agent";

	return (
		<div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-none">
			<div className="sticky top-0 z-20 grid min-h-10 grid-cols-[minmax(0,1fr)_10rem_1.75rem] items-center gap-3 border-b border-(--session-overview-border) bg-(--session-overview-surface) px-3">
				<p className="truncate text-xs text-(--session-overview-muted)">
					{metricDescription}
				</p>
				<div className="flex min-w-0 items-center justify-between gap-3 text-xs text-(--session-overview-subtle) tabular-nums">
					<p>0</p>
					<p>{maximumLabel}</p>
				</div>
			</div>

			<ol className="list-none">
				{layout.rows.map((turnPosition, rowIndex) => {
					const option = options[turnPosition.index];
					if (!option) {
						return null;
					}

					return (
						<Fragment key={option.key}>
							{option.compactionsBefore.map((compaction) => (
								<li
									key={compaction.key}
									className="border-b border-amber-200/70 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 dark:border-amber-400/15 dark:bg-amber-400/10 dark:text-amber-300"
								>
									Compaction
								</li>
							))}
							<SessionTurnWaterfallTreeTurn
								branches={traces[turnPosition.index] ?? []}
								hasNext={rowIndex < layout.rows.length - 1}
								metric={metric}
								model={model}
								modelLabel={modelLabel}
								onSelect={stableOnSelect}
								option={option}
								selected={turnPosition.index === selectedIndex}
								turnPosition={turnPosition}
								userImageUrl={userImageUrl}
								userLabel={userLabel}
								valueLabel={formatSessionTurnWaterfallMetricValue(
									turnPosition.value,
									metric,
								)}
							/>
						</Fragment>
					);
				})}
			</ol>
		</div>
	);
}

export function SessionLedgerWaterfallPane({
	model,
	onSelect,
	options,
	selectedIndex,
	userImageUrl,
	userLabel,
	visibleTurnRange,
}: {
	model: string | undefined;
	onSelect: (index: number) => void;
	options: readonly SelectedTurnOption[];
	selectedIndex: number;
	userImageUrl: string | undefined;
	userLabel: string;
	visibleTurnRange: readonly [number, number];
}) {
	const panelId = useId();
	const tabIdPrefix = useId();
	const [activeView, setActiveView] = useState<SessionLedgerView>("ledger");
	const [metric, setMetric] = useState<SessionTurnWaterfallMetric>("time");
	const [timelineMetric, setTimelineMetric] =
		useState<SessionTurnTimelineThicknessMetric>("tokens");

	return (
		<>
			<header className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-(--session-overview-border) bg-(--session-overview-surface) px-3">
				<SessionLedgerViewTabs
					activeView={activeView}
					onChange={setActiveView}
					panelId={panelId}
					tabIdPrefix={tabIdPrefix}
				/>
				{activeView === "waterfall" ? (
					<SessionWaterfallMetricTabs metric={metric} onChange={setMetric} />
				) : activeView === "timeline" ? (
					<SessionTimelineThicknessTabs
						metric={timelineMetric}
						onChange={setTimelineMetric}
					/>
				) : null}
			</header>

			<div
				role="tabpanel"
				id={panelId}
				aria-labelledby={`${tabIdPrefix}-${activeView}`}
				className="flex min-h-0 min-w-0 flex-1 flex-col"
			>
				{activeView === "ledger" ? (
					<SessionTurnTablePane
						collapseControlsId={undefined}
						model={model}
						onCollapse={undefined}
						onSelect={onSelect}
						options={options}
						selectedIndex={selectedIndex}
						showMessageRows={false}
						userImageUrl={userImageUrl}
						userLabel={userLabel}
					/>
				) : activeView === "waterfall" ? (
					<SessionTurnWaterfall
						metric={metric}
						model={model}
						onSelect={onSelect}
						options={options}
						selectedIndex={selectedIndex}
						userImageUrl={userImageUrl}
						userLabel={userLabel}
					/>
				) : (
					<SessionTurnTimelineView
						metric={timelineMetric}
						model={model}
						onSelect={onSelect}
						options={options}
						selectedIndex={selectedIndex}
						userLabel={userLabel}
						visibleTurnRange={visibleTurnRange}
					/>
				)}
			</div>
		</>
	);
}
