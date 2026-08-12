import { type PointerEvent, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { SessionTurnMetric } from "./session-turn-metric";
import {
	buildSessionTurnMinimapRows,
	getMinimapIndexAtY,
} from "./session-turn-minimap-layout";
import type { SessionTurnTableOption } from "./session-turn-table";

export function SessionTurnMinimap({
	activeIndex,
	matchedIndices,
	metric,
	onReveal,
	options,
	visibleRange,
}: {
	activeIndex: number;
	matchedIndices: ReadonlySet<number> | undefined;
	metric: SessionTurnMetric;
	onReveal: (index: number) => void;
	options: readonly SessionTurnTableOption[];
	visibleRange: readonly [number, number] | undefined;
}) {
	const rows = useMemo(
		() => buildSessionTurnMinimapRows(options, metric, matchedIndices),
		[matchedIndices, metric, options],
	);
	const rowCount = Math.max(rows.length, 1);

	function revealAtPointer(event: PointerEvent<HTMLDivElement>) {
		const bounds = event.currentTarget.getBoundingClientRect();
		onReveal(
			getMinimapIndexAtY(
				event.clientY - bounds.top,
				bounds.height,
				rows.length,
			),
		);
	}

	return (
		<div
			role="slider"
			aria-label="Session turn minimap"
			aria-valuemax={Math.max(rows.length - 1, 0)}
			aria-valuemin={0}
			aria-valuenow={activeIndex}
			className="flex w-14 shrink-0 cursor-ns-resize touch-none border-l border-(--session-overview-border) bg-(--session-overview-surface) px-1.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--session-overview-accent)"
			tabIndex={0}
			onKeyDown={(event) => {
				if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
					return;
				}
				event.preventDefault();
				onReveal(
					Math.min(
						Math.max(activeIndex + (event.key === "ArrowDown" ? 1 : -1), 0),
						Math.max(rows.length - 1, 0),
					),
				);
			}}
			onPointerDown={(event) => {
				event.currentTarget.setPointerCapture(event.pointerId);
				revealAtPointer(event);
			}}
			onPointerMove={(event) => {
				if (event.currentTarget.hasPointerCapture(event.pointerId)) {
					revealAtPointer(event);
				}
			}}
		>
			<svg
				aria-hidden="true"
				className="pointer-events-none h-full min-h-20 w-full"
				preserveAspectRatio="none"
				viewBox={`0 0 100 ${rowCount}`}
			>
				<title>Turn activity — {metric}</title>
				{rows.map((row) => (
					<g key={row.index} className={cn(!row.matched && "opacity-25")}>
						<rect
							fill="var(--session-overview-muted)"
							height="0.62"
							rx="0.2"
							width={Math.max(row.ratio * 70, 3)}
							x="2"
							y={row.index + 0.19}
						/>
						{[
							{ active: row.skill, label: "Skill", x: 76 },
							{ active: row.error, label: "Error", x: 82 },
							{ active: row.edits, label: "Edit", x: 88 },
							{ active: row.compaction, label: "Compaction", x: 94 },
							{ active: row.slashCommand, label: "Command", x: 100 },
						].map((glyph) =>
							glyph.active ? (
								<circle
									key={glyph.label}
									cx={glyph.x}
									cy={row.index + 0.5}
									fill="var(--session-overview-accent)"
									r="1.7"
								>
									<title>{glyph.label}</title>
								</circle>
							) : null,
						)}
					</g>
				))}
				{visibleRange ? (
					<rect
						fill="none"
						height={Math.max(visibleRange[1] - visibleRange[0] + 1, 0.75)}
						pointerEvents="none"
						rx="0.5"
						stroke="var(--session-overview-accent)"
						strokeWidth="1.5"
						vectorEffect="non-scaling-stroke"
						width="100"
						x="0"
						y={visibleRange[0]}
					/>
				) : null}
			</svg>
		</div>
	);
}
