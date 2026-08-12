import { Collapsible } from "@base-ui/react/collapsible";
import { ChevronsDownUp, ChevronsUpDown, type LucideIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SessionTurnWaterfallTraceRow } from "./session-turn-waterfall-trace";
import type { WaterfallBarPosition } from "./session-turn-waterfall-tree-utils";

interface WaterfallBarStyle extends CSSProperties {
	"--waterfall-left": string;
	"--waterfall-width": string;
}

interface WaterfallTreeRowStyle extends CSSProperties {
	"--waterfall-tree-padding": string;
}

type WaterfallTreeCollapse = {
	open: boolean;
};

const WATERFALL_TREE_ROW_HEIGHT = 40;
const WATERFALL_TREE_LEVEL_GAP = 23;
const WATERFALL_TREE_FIRST_X = 18;

function getTraceStatusClassName(
	status: SessionTurnWaterfallTraceRow["status"],
) {
	switch (status) {
		case "error":
			return "bg-red-500";
		case "pending":
			return "bg-amber-500";
		case "success":
			return "bg-emerald-500";
	}
}

function getWaterfallBarStyle(position: WaterfallBarPosition) {
	const left = Math.min(Math.max(position.offsetRatio, 0), 0.99) * 100;
	const width = Math.min(Math.max(position.sizeRatio, 0) * 100, 100 - left);
	const style: WaterfallBarStyle = {
		"--waterfall-left": `${left}%`,
		"--waterfall-width": `max(${width}%, 3px)`,
	};
	return style;
}

function WaterfallLane({
	active,
	error,
	position,
}: {
	active: boolean;
	error: boolean;
	position: WaterfallBarPosition;
}) {
	return (
		<div className="relative h-5 min-w-0 overflow-hidden" aria-hidden="true">
			<div className="absolute top-1/2 h-px w-full -translate-y-1/2 bg-(--session-overview-border)" />
			<div
				className={cn(
					"absolute top-1/2 h-2 -translate-y-1/2 rounded-full left-(--waterfall-left) w-(--waterfall-width)",
					error
						? "bg-red-500"
						: active
							? "bg-(--session-overview-accent)"
							: "bg-(--session-overview-muted)",
					position.estimated &&
						"border border-dashed border-(--session-overview-muted) bg-transparent",
				)}
				style={getWaterfallBarStyle(position)}
			/>
		</div>
	);
}

function WaterfallTreeConnector({
	continues,
	depth,
}: {
	continues: boolean;
	depth: number;
}) {
	const width = 6 + depth * WATERFALL_TREE_LEVEL_GAP;
	const currentX =
		WATERFALL_TREE_FIRST_X + (depth - 1) * WATERFALL_TREE_LEVEL_GAP;
	const elbowY = WATERFALL_TREE_ROW_HEIGHT / 2;
	const ancestorXs = Array.from(
		{ length: Math.max(depth - 1, 0) },
		(_, index) => WATERFALL_TREE_FIRST_X + index * WATERFALL_TREE_LEVEL_GAP,
	);

	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute top-0 left-0 stroke-(--session-overview-border)"
			fill="none"
			height={WATERFALL_TREE_ROW_HEIGHT}
			strokeLinecap="round"
			strokeLinejoin="round"
			viewBox={`0 0 ${width} ${WATERFALL_TREE_ROW_HEIGHT}`}
			width={width}
		>
			{ancestorXs.map((x) => (
				<path key={x} d={`M ${x} 0 V ${WATERFALL_TREE_ROW_HEIGHT}`} />
			))}
			<path d={`M ${currentX} 0 V ${elbowY - 6}`} />
			<path
				d={`M ${currentX} ${elbowY - 6} Q ${currentX} ${elbowY} ${currentX + 6} ${elbowY}`}
			/>
			<path d={`M ${currentX + 6} ${elbowY} H ${width - 1}`} />
			{continues ? (
				<path d={`M ${currentX} ${elbowY} V ${WATERFALL_TREE_ROW_HEIGHT}`} />
			) : null}
		</svg>
	);
}

export function WaterfallTreeRow({
	active,
	collapse,
	continues,
	dataTurnIndex,
	depth,
	error,
	icon: Icon,
	iconNode,
	label,
	onSelect,
	position,
	preview,
	status,
	valueLabel,
}: {
	active: boolean;
	collapse?: WaterfallTreeCollapse;
	continues: boolean;
	dataTurnIndex?: number;
	depth: number;
	error: boolean;
	icon?: LucideIcon;
	iconNode?: ReactNode;
	label: string;
	onSelect: () => void;
	position?: WaterfallBarPosition;
	preview: string;
	status: SessionTurnWaterfallTraceRow["status"];
	valueLabel?: string;
}) {
	const width = 6 + depth * WATERFALL_TREE_LEVEL_GAP;
	const rowStyle: WaterfallTreeRowStyle = {
		"--waterfall-tree-padding": `${width}px`,
	};

	return (
		<div className="relative min-w-0">
			<WaterfallTreeConnector continues={continues} depth={depth} />
			<button
				type="button"
				aria-pressed={active}
				className={cn(
					"grid h-10 w-full min-w-0 grid-cols-[minmax(0,1fr)_10rem_1.75rem] items-center gap-3 pr-1 pl-(--waterfall-tree-padding) text-left outline-none hover:bg-(--session-overview-hover) focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-(--session-overview-accent)",
					active &&
						"bg-[color-mix(in_srgb,var(--session-overview-accent)_10%,var(--session-overview-surface))]",
				)}
				data-turn-index={dataTurnIndex}
				style={rowStyle}
				onClick={onSelect}
			>
				<div className="flex min-w-0 items-center gap-2">
					{iconNode ??
						(Icon ? (
							<Icon className="size-3.5 shrink-0 stroke-(--session-overview-muted)" />
						) : null)}
					<span
						aria-hidden="true"
						className={cn(
							"size-1.5 shrink-0 rounded-full",
							getTraceStatusClassName(status),
						)}
					/>
					<div className="flex min-w-0 items-baseline gap-2">
						<p className="shrink-0 truncate text-xs font-medium text-(--session-overview-text)">
							{label}
						</p>
						<p
							className="min-w-0 truncate text-xs text-(--session-overview-subtle)"
							title={preview}
						>
							{preview}
						</p>
					</div>
				</div>
				<div className="min-w-0">
					{position ? (
						<>
							<p className="text-right text-xs text-(--session-overview-muted) tabular-nums">
								{valueLabel}
							</p>
							<WaterfallLane
								active={active}
								error={error}
								position={position}
							/>
						</>
					) : null}
				</div>
				<span aria-hidden="true" />
			</button>
			{collapse ? (
				<Collapsible.Trigger
					aria-label={collapse.open ? "Collapse" : "Expand"}
					className="absolute top-1.5 right-1 z-10 flex size-7 shrink-0 items-center justify-center text-(--session-overview-subtle) outline-none hover:text-(--session-overview-text) focus-visible:outline-2 focus-visible:outline-(--session-overview-accent)"
					title={collapse.open ? "Collapse" : "Expand"}
				>
					{collapse.open ? (
						<ChevronsDownUp className="size-3" />
					) : (
						<ChevronsUpDown className="size-3" />
					)}
					<span
						aria-hidden="true"
						className="pointer-fine:hidden absolute top-1/2 left-1/2 size-11 -translate-1/2"
					/>
				</Collapsible.Trigger>
			) : null}
		</div>
	);
}
