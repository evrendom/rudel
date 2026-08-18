import type { VirtualItem } from "@tanstack/react-virtual";
import { memo, useCallback, useRef, useState } from "react";
import {
	ConversationTraceTreeNode,
	TraceTextDisclosureIcon,
} from "@/components/conversation/ConversationTrace";
import { UserTraceAvatar } from "@/components/conversation/conversation-trace-icons";
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
		kind: "model";
	};

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
			header.kind === "model" ? header.planMode : false,
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
		if (row.kind === "section" && row.section.payload.isFirst) {
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
					kind: "model",
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

function arePlacementsEqual(
	left: readonly TranscriptStickyHeaderPlacement[],
	right: readonly TranscriptStickyHeaderPlacement[],
) {
	return (
		left.length === right.length &&
		left.every((placement, index) => {
			const candidate = right[index];
			return (
				candidate?.group.ownerKey === placement.group.ownerKey &&
				candidate.start === placement.start &&
				candidate.extent === placement.extent
			);
		})
	);
}

export function useTranscriptStickyHeaderWrappers(input: {
	groups: readonly TranscriptStickyHeaderGroup[];
}) {
	const placementsRef = useRef<readonly TranscriptStickyHeaderPlacement[]>([]);
	const [placements, setPlacements] = useState<
		readonly TranscriptStickyHeaderPlacement[]
	>([]);
	const sync = useCallback(
		(inputValue: {
			measurements: readonly VirtualItem[];
			virtualItems: readonly VirtualItem[];
		}) => {
			const next = placeTranscriptStickyHeaderGroups({
				groups: input.groups,
				...inputValue,
			});
			if (arePlacementsEqual(placementsRef.current, next)) {
				return;
			}
			placementsRef.current = next;
			setPlacements(next);
		},
		[input.groups],
	);
	return { placements, sync };
}

function TranscriptStickyHeaderVisual({
	group,
}: {
	group: TranscriptStickyHeaderGroup;
}) {
	const { open: memberExpanded } = useTraceExpansionState(
		`${group.turnId}:member:heading`,
	);
	return (
		<ConversationTraceTreeNode
			continues={group.header.continues}
			depth={1}
			descends={group.header.kind === "model"}
			rowHeight={group.header.renderHeight}
		>
			<div
				className="flex min-h-10 min-w-0 items-center gap-2 pr-3"
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
					<div className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left">
						<ModelSectionHeader data={group.header} expanded />
					</div>
				)}
			</div>
		</ConversationTraceTreeNode>
	);
}

export const TranscriptStickyHeaderWrappers = memo(
	function TranscriptStickyHeaderWrappers({
		placements,
	}: {
		placements: readonly TranscriptStickyHeaderPlacement[];
	}) {
		return placements.map((placement) => (
			<div
				key={placement.group.ownerKey}
				className="pointer-events-none absolute left-0 z-40 w-full min-w-0"
				data-transcript-sticky-header-wrapper={placement.group.ownerKey}
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
					<TranscriptStickyHeaderVisual group={placement.group} />
				</div>
			</div>
		));
	},
);
