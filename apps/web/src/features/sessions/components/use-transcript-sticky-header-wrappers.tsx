import type { VirtualItem } from "@tanstack/react-virtual";
import { memo, useCallback, useRef, useState } from "react";
import {
	ConversationTraceTreeItem,
	TraceTextDisclosureIcon,
} from "@/components/conversation/ConversationTrace";
import type { TraceEvent } from "@/components/conversation/conversation-trace";
import { TraceLayersIcon } from "@/components/conversation/conversation-trace-hugeicons";
import {
	TraceDisclosureIcon,
	UserTraceAvatar,
} from "@/components/conversation/conversation-trace-icons";
import { useTraceExpansionState } from "@/components/conversation/expandable-trace-row";
import {
	ModelSectionHeader,
	type ModelSectionHeaderData,
} from "@/components/conversation/model-section-header";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import type { SessionTranscriptRow } from "./session-transcript-sections";

type TranscriptStickyHeaderKind = "member" | "model";

type TranscriptStickyHeaderGeometry = {
	continues: boolean;
	renderHeight?: number;
	terminal: boolean;
};

export type TranscriptMemberHeaderData = TranscriptStickyHeaderGeometry & {
	kind: "member";
	userImageUrl: string | undefined;
	userLabel: string;
};

export type TranscriptModelHeaderData = ModelSectionHeaderData &
	TranscriptStickyHeaderGeometry & {
		events: readonly TraceEvent[] | undefined;
		fold?: Pick<
			Extract<SessionTranscriptRow, { kind: "turn-fold" }>,
			"expanded" | "hidden"
		>;
		kind: "model";
	};

export function TranscriptFoldSummaryControl({
	expanded,
	hidden,
	onToggle,
	stickyTurnId,
	turnId,
}: {
	expanded: boolean;
	hidden: Extract<SessionTranscriptRow, { kind: "turn-fold" }>["hidden"];
	onToggle: () => void;
	stickyTurnId: string | undefined;
	turnId: string | undefined;
}) {
	const metrics = [
		{ count: hidden.reasoning, label: "Reasoning" },
		{ count: hidden.messages, label: "Messages" },
		{ count: hidden.skills, label: "Skills" },
		{ count: hidden.subagents, label: "Subagents" },
		{ count: hidden.filesRead, label: "Files Read" },
		{ count: hidden.filesWritten, label: "written" },
		{ count: hidden.filesEdited, label: "edited" },
	];
	const action = expanded ? "collapse" : "show";
	const metricLabel = metrics
		.map(({ count, label }) => `${count.toLocaleString()} ${label}`)
		.join(", ");
	return (
		<button
			aria-expanded={expanded}
			aria-label={`${action} earlier model activity: ${metricLabel}`}
			className="group group/fold pointer-events-auto relative flex h-8 max-w-full min-w-0 select-none items-center gap-1.5 rounded-md py-1 pr-1.5 pl-1 text-left text-[0.6875rem]/[1.0625rem] text-(--session-overview-muted) outline-none focus-visible:outline-2 focus-visible:outline-(--session-overview-accent)"
			data-transcript-fold-turn-id={turnId}
			data-transcript-sticky-fold-turn-id={stickyTurnId}
			data-trace-hover-row
			onClick={onToggle}
			title={`${action} earlier model activity`}
			type="button"
		>
			<span
				aria-hidden="true"
				className="pointer-events-none absolute top-1/2 left-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
			/>
			<TraceDisclosureIcon
				expanded={expanded}
				expandable
				icon={TraceLayersIcon}
			/>
			<span
				className="hidden min-w-0 items-center gap-0.75 tabular-nums @[33rem]/model-header:flex"
				data-transcript-fold-summary-tags
			>
				{metrics.map(({ count, label }) => (
					<span
						key={label}
						className="inline-flex h-5 shrink-0 items-center gap-[0.21875rem] rounded-[0.3125rem] bg-white px-1.75 font-medium text-black/[0.875] shadow-[inset_0_0_0_0.425px_transparent,0_0_0_0.425px_#0000000f,0_0.85px_0.85px_-0.85px_#0000001a,0_0.85px_1.7px_0_#0000000d] select-none dark:bg-white/[0.071] dark:text-white/[0.929] dark:shadow-[inset_0_0_0_0.425px_#ffffff12,0_0_0_0.425px_transparent,0_0.85px_0.85px_-0.85px_transparent,0_0.85px_1.7px_0_transparent]"
						data-transcript-fold-summary-tag
					>
						{count.toLocaleString()} {label}
					</span>
				))}
			</span>
		</button>
	);
}

export type TranscriptStickyHeaderGroup = {
	endRowIndex: number;
	header: TranscriptMemberHeaderData | TranscriptModelHeaderData;
	headerRowIndex: number;
	ownerKey: string;
	startRowIndex: number;
	turnId: string;
};

export type TranscriptStickyHeaderPlacement = {
	extent: number;
	group: TranscriptStickyHeaderGroup;
	start: number;
};

type TranscriptStickyHeaderAnchor = {
	header:
		| Omit<TranscriptMemberHeaderData, "continues" | "terminal">
		| Omit<TranscriptModelHeaderData, "continues" | "terminal">;
	headerRowIndex: number;
	turnId: string;
};

function createMemberHeaderAnchor(input: {
	headerRowIndex: number;
	renderHeight: number | undefined;
	turnId: string;
	userImageUrl: string | undefined;
	userLabel: string;
}): TranscriptStickyHeaderAnchor {
	return {
		header: {
			kind: "member",
			renderHeight: input.renderHeight,
			userImageUrl: input.userImageUrl,
			userLabel: input.userLabel,
		},
		headerRowIndex: input.headerRowIndex,
		turnId: input.turnId,
	};
}

function finalizeStickyHeaderAnchor(input: {
	anchor: TranscriptStickyHeaderAnchor;
	endRowIndex: number;
	rowCount: number;
	startRowIndex: number;
}): TranscriptStickyHeaderGroup {
	const geometry = {
		continues: input.anchor.headerRowIndex < input.rowCount - 1,
		terminal: input.endRowIndex === input.rowCount - 1,
	};
	const header: TranscriptMemberHeaderData | TranscriptModelHeaderData = {
		...input.anchor.header,
		...geometry,
	};
	return {
		endRowIndex: input.endRowIndex,
		header,
		headerRowIndex: input.anchor.headerRowIndex,
		ownerKey: [
			input.anchor.turnId,
			header.kind,
			input.anchor.headerRowIndex,
			header.kind === "model" ? header.agentModel : header.userImageUrl,
			header.kind === "model" ? header.agentLabel : header.userLabel,
			header.kind === "model" ? header.modelSetting : undefined,
			header.kind === "model" ? header.planMode : false,
			header.kind === "model" ? header.fold?.expanded : undefined,
			header.continues,
			header.terminal,
			header.renderHeight,
		].join(":"),
		startRowIndex: input.startRowIndex,
		turnId: input.anchor.turnId,
	};
}

export function deriveTranscriptStickyHeaderGroups(input: {
	agentModel: string | undefined;
	headerHeights?: Partial<Record<TranscriptStickyHeaderKind, number>>;
	rows: readonly SessionTranscriptRow[];
	userImageUrl: string | undefined;
	userLabel: string;
}) {
	if (input.rows.length === 0) {
		return [];
	}
	const anchors: TranscriptStickyHeaderAnchor[] = [];
	for (const [index, row] of input.rows.entries()) {
		if (row.kind === "member") {
			anchors.push(
				createMemberHeaderAnchor({
					headerRowIndex: index,
					renderHeight: input.headerHeights?.member,
					turnId: row.turnId,
					userImageUrl: input.userImageUrl,
					userLabel: input.userLabel,
				}),
			);
			continue;
		}
		if (row.kind === "turn-fold") {
			const agentModel = row.agentModel ?? input.agentModel;
			anchors.push({
				header: {
					agentLabel: agentModel
						? formatModelDisplayLabel(agentModel)
						: "Agent",
					agentModel,
					events: row.allEvents,
					fold: { expanded: row.expanded, hidden: row.hidden },
					kind: "model",
					...(row.modelSetting ? { modelSetting: row.modelSetting } : {}),
					planMode: row.planMode,
					renderHeight: input.headerHeights?.model,
				},
				headerRowIndex: index,
				turnId: row.turnId,
			});
			continue;
		}
		if (row.kind === "section" && row.isFirst) {
			const traceSection = row.section.payload.traceSection;
			const agentModel =
				(traceSection.kind === "agent"
					? traceSection.usage?.model
					: undefined) ?? input.agentModel;
			anchors.push({
				header: {
					agentLabel: agentModel
						? formatModelDisplayLabel(agentModel)
						: "Agent",
					agentModel,
					events: row.section.payload.allEvents.events,
					kind: "model",
					...(row.section.payload.modelSetting
						? { modelSetting: row.section.payload.modelSetting }
						: {}),
					planMode: row.section.payload.planMode,
					renderHeight: input.headerHeights?.model,
				},
				headerRowIndex: index,
				turnId: row.turnId,
			});
			continue;
		}
		if (
			(row.kind === "turn-pending" ||
				row.kind === "turn-error" ||
				row.kind === "no-response") &&
			anchors.at(-1)?.turnId !== row.turnId
		) {
			anchors.push(
				createMemberHeaderAnchor({
					headerRowIndex: index,
					renderHeight: input.headerHeights?.member,
					turnId: row.turnId,
					userImageUrl: input.userImageUrl,
					userLabel: input.userLabel,
				}),
			);
		}
	}
	if (anchors.length === 0) {
		const firstRow = input.rows[0];
		anchors.push(
			createMemberHeaderAnchor({
				headerRowIndex: 0,
				renderHeight: input.headerHeights?.member,
				turnId:
					firstRow && "turnId" in firstRow ? firstRow.turnId : "transcript",
				userImageUrl: input.userImageUrl,
				userLabel: input.userLabel,
			}),
		);
	}
	return anchors.map((anchor, index) => {
		const nextAnchor = anchors[index + 1];
		return finalizeStickyHeaderAnchor({
			anchor,
			endRowIndex: nextAnchor
				? nextAnchor.headerRowIndex - 1
				: input.rows.length - 1,
			rowCount: input.rows.length,
			startRowIndex: index === 0 ? 0 : anchor.headerRowIndex,
		});
	});
}

export function placeTranscriptStickyHeaderGroups(input: {
	groups: readonly TranscriptStickyHeaderGroup[];
	measurements: readonly VirtualItem[];
	virtualItems: readonly VirtualItem[];
}) {
	const firstVirtualIndex = input.virtualItems[0]?.index;
	const lastVirtualIndex = input.virtualItems.at(-1)?.index;
	if (firstVirtualIndex === undefined || lastVirtualIndex === undefined) {
		return [];
	}
	return input.groups.flatMap((group) => {
		if (
			group.endRowIndex < firstVirtualIndex ||
			group.headerRowIndex > lastVirtualIndex
		) {
			return [];
		}
		const start = input.measurements[group.headerRowIndex]?.start;
		const end = input.measurements[group.endRowIndex]?.end;
		if (start === undefined || end === undefined || end <= start) {
			return [];
		}
		return [{ extent: end - start, group, start }];
	});
}

function haveSamePlacementMembership(
	left: readonly TranscriptStickyHeaderPlacement[],
	right: readonly TranscriptStickyHeaderPlacement[],
) {
	return (
		left.length === right.length &&
		left.every(
			(placement, index) =>
				right[index]?.group.ownerKey === placement.group.ownerKey,
		)
	);
}

function applyStickyHeaderPlacement(
	element: HTMLElement,
	placement: TranscriptStickyHeaderPlacement,
) {
	const height = `${placement.extent}px`;
	const top = `${placement.start}px`;
	if (element.style.height !== height) {
		element.style.height = height;
	}
	if (element.style.top !== top) {
		element.style.top = top;
	}
}

export function useTranscriptStickyHeaderWrappers(input: {
	groups: readonly TranscriptStickyHeaderGroup[];
}) {
	const placementsRef = useRef<readonly TranscriptStickyHeaderPlacement[]>([]);
	const wrapperElementsRef = useRef(new Map<string, HTMLElement>());
	const [placements, setPlacements] = useState<
		readonly TranscriptStickyHeaderPlacement[]
	>([]);
	const registerWrapper = useCallback(
		(ownerKey: string, element: HTMLDivElement | null) => {
			if (!element) {
				wrapperElementsRef.current.delete(ownerKey);
				return;
			}
			wrapperElementsRef.current.set(ownerKey, element);
			const placement = placementsRef.current.find(
				(candidate) => candidate.group.ownerKey === ownerKey,
			);
			if (placement) {
				applyStickyHeaderPlacement(element, placement);
			}
		},
		[],
	);
	const sync = useCallback(
		(inputValue: {
			measurements: readonly VirtualItem[];
			virtualItems: readonly VirtualItem[];
		}) => {
			const next = placeTranscriptStickyHeaderGroups({
				groups: input.groups,
				...inputValue,
			});
			const current = placementsRef.current;
			if (haveSamePlacementMembership(current, next)) {
				if (
					current.some(
						(placement, index) => placement.group !== next[index]?.group,
					)
				) {
					placementsRef.current = next;
					setPlacements(next);
					return;
				}
				for (const [index, placement] of current.entries()) {
					const nextPlacement = next[index];
					if (!nextPlacement) {
						continue;
					}
					if (
						placement.extent === nextPlacement.extent &&
						placement.start === nextPlacement.start
					) {
						continue;
					}
					placement.extent = nextPlacement.extent;
					placement.start = nextPlacement.start;
					const element = wrapperElementsRef.current.get(
						placement.group.ownerKey,
					);
					if (element) {
						applyStickyHeaderPlacement(element, placement);
					}
				}
				return;
			}
			placementsRef.current = next;
			setPlacements(next);
		},
		[input.groups],
	);
	return { placements, registerWrapper, sync };
}

function TranscriptStickyHeaderVisual({
	group,
	onToggleFold,
}: {
	group: TranscriptStickyHeaderGroup;
	onToggleFold: ((turnId: string) => void) | undefined;
}) {
	const { open: memberExpanded } = useTraceExpansionState(
		`${group.turnId}:member:heading`,
	);
	return (
		<ConversationTraceTreeItem
			childRailExitLength={group.header.kind === "model" ? 2 : 0}
			continues={group.header.continues}
			depth={1}
			descends={group.header.kind === "model"}
			rowHeight={group.header.renderHeight}
		>
			<div
				className="@container/model-header flex min-h-10 min-w-0 items-center gap-2 pr-3"
				style={
					group.header.renderHeight
						? { minHeight: group.header.renderHeight }
						: undefined
				}
			>
				{group.header.kind === "member" ? (
					<>
						<UserTraceAvatar
							expanded={false}
							expandable={false}
							imageUrl={group.header.userImageUrl}
						/>
						<div className="group flex min-w-0 items-center gap-0 text-left">
							<h3
								className="min-w-0 shrink-0 truncate text-xs font-medium text-(--session-overview-text)"
								data-trace-user-label
							>
								{group.header.userLabel}
							</h3>
							<TraceTextDisclosureIcon expanded={memberExpanded} />
						</div>
					</>
				) : (
					<>
						<div className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left">
							<ModelSectionHeader
								data={group.header}
								expanded
								expandable={false}
							/>
						</div>
						{group.header.fold ? (
							<TranscriptFoldSummaryControl
								expanded={group.header.fold.expanded}
								hidden={group.header.fold.hidden}
								onToggle={() => onToggleFold?.(group.turnId)}
								stickyTurnId={group.turnId}
								turnId={undefined}
							/>
						) : null}
					</>
				)}
			</div>
		</ConversationTraceTreeItem>
	);
}

export const TranscriptStickyHeaderWrappers = memo(
	function TranscriptStickyHeaderWrappers({
		onToggleFold,
		placements,
		registerWrapper,
	}: {
		onToggleFold: ((turnId: string) => void) | undefined;
		placements: readonly TranscriptStickyHeaderPlacement[];
		registerWrapper: (ownerKey: string, element: HTMLDivElement | null) => void;
	}) {
		return placements.map((placement) => (
			<div
				key={placement.group.ownerKey}
				className="pointer-events-none absolute left-0 z-40 w-full min-w-0"
				data-transcript-sticky-header-wrapper={placement.group.ownerKey}
				ref={(element) => registerWrapper(placement.group.ownerKey, element)}
				style={{ height: placement.extent, top: placement.start }}
			>
				<div
					aria-hidden="true"
					className="pointer-events-none sticky top-0 w-full min-w-0 bg-(--session-overview-surface)"
					data-transcript-sticky-header
					data-transcript-sticky-header-kind={placement.group.header.kind}
					data-transcript-sticky-header-owner={placement.group.turnId}
					data-transcript-sticky-header-terminal={
						placement.group.header.terminal || undefined
					}
				>
					<TranscriptStickyHeaderVisual
						group={placement.group}
						onToggleFold={onToggleFold}
					/>
				</div>
			</div>
		));
	},
);
