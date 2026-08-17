import type { VirtualItem } from "@tanstack/react-virtual";
import {
	memo,
	type RefCallback,
	type RefObject,
	useCallback,
	useRef,
	useState,
} from "react";
import { useLatestValueRef } from "@/app/hooks/useLatestValueRef";
import {
	ConversationTraceTreeNode,
	TraceTextDisclosureIcon,
} from "@/components/conversation/ConversationTrace";
import { UserTraceAvatar } from "@/components/conversation/conversation-trace-icons";
import {
	ModelSectionHeader,
	type ModelSectionHeaderData,
} from "@/components/conversation/model-section-header";
import { formatModelDisplayLabel } from "@/features/dashboard/components/dashboard-model-brand";
import type { SessionTranscriptRow } from "./session-transcript-sections";
import { recordTranscriptStickyHeaderOwnerChange } from "./transcript-forensics";

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
	const header = {
		...input.anchor.header,
		continues: input.anchor.headerRowIndex < input.rowCount - 1,
		terminal: input.endRowIndex === input.rowCount - 1,
	} as TranscriptMemberHeaderData | TranscriptModelHeaderData;
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

export function resolveTranscriptStickyHeaderOverlay(input: {
	groups: readonly TranscriptStickyHeaderGroup[];
	headerHeights: Partial<Record<TranscriptStickyHeaderKind, number>>;
	measurements: readonly VirtualItem[];
	scrollTop: number;
}) {
	let low = 0;
	let high = input.groups.length - 1;
	let candidate: TranscriptStickyHeaderGroup | undefined;
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const group = input.groups[middle];
		const start = group
			? input.measurements[group.startRowIndex]?.start
			: undefined;
		if (!(group && start !== undefined)) {
			high = middle - 1;
			continue;
		}
		if (start <= input.scrollTop) {
			candidate = group;
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}
	if (!candidate) {
		return undefined;
	}
	const start = input.measurements[candidate.startRowIndex]?.start;
	const end = input.measurements[candidate.endRowIndex]?.end;
	if (start === undefined || end === undefined || input.scrollTop >= end) {
		return undefined;
	}
	const headerHeight = input.headerHeights[candidate.header.kind] ?? 0;
	return {
		end,
		group: candidate,
		start,
		translateY: Math.min(0, end - input.scrollTop - headerHeight),
	};
}

export function useTranscriptModelHeaderOverlay(input: {
	groups: readonly TranscriptStickyHeaderGroup[];
	onMeasured: () => void;
}) {
	const groupsRef = useLatestValueRef(input.groups);
	const overlayRef = useRef<HTMLDivElement>(null);
	const headerHeightsRef = useRef<
		Partial<Record<TranscriptStickyHeaderKind, number>>
	>({});
	const ownerRef = useRef<TranscriptStickyHeaderGroup | undefined>(undefined);
	const [owner, setOwner] = useState<TranscriptStickyHeaderGroup>();
	const updateOwner = useCallback(
		(nextOwner: TranscriptStickyHeaderGroup | undefined) => {
			const currentOwner = ownerRef.current;
			if (currentOwner?.ownerKey === nextOwner?.ownerKey) {
				return;
			}
			ownerRef.current = nextOwner;
			recordTranscriptStickyHeaderOwnerChange({
				at: performance.now(),
				from: currentOwner?.ownerKey ?? null,
				to: nextOwner?.ownerKey ?? null,
			});
			setOwner(nextOwner);
		},
		[],
	);
	const measureHeader = useCallback(
		(kind: TranscriptStickyHeaderKind, node: HTMLDivElement | null) => {
			if (!(node && headerHeightsRef.current[kind] === undefined)) {
				return;
			}
			const height = node.getBoundingClientRect().height;
			if (height <= 0) {
				return;
			}
			headerHeightsRef.current[kind] = height;
			input.onMeasured();
		},
		[input.onMeasured],
	);
	const memberMeasureRef = useCallback(
		(node: HTMLDivElement | null) => measureHeader("member", node),
		[measureHeader],
	);
	const modelMeasureRef = useCallback(
		(node: HTMLDivElement | null) => measureHeader("model", node),
		[measureHeader],
	);

	const sync = useCallback(
		(input: { measurements: readonly VirtualItem[]; scrollTop: number }) => {
			const overlay = overlayRef.current;
			if (!overlay) {
				return;
			}
			const resolution = resolveTranscriptStickyHeaderOverlay({
				groups: groupsRef.current,
				headerHeights: headerHeightsRef.current,
				measurements: input.measurements,
				scrollTop: input.scrollTop,
			});
			updateOwner(resolution?.group);
			const transform = resolution
				? `translate3d(0, ${resolution.translateY}px, 0)`
				: "";
			if (overlay.style.transform !== transform) {
				overlay.style.transform = transform;
			}
		},
		[groupsRef, updateOwner],
	);
	const memberMeasurementOwner = input.groups.find(
		(group) => group.header.kind === "member",
	);
	const modelMeasurementOwner = input.groups.find(
		(group) => group.header.kind === "model",
	);

	return {
		memberMeasureRef,
		memberMeasurementOwner,
		modelMeasureRef,
		modelMeasurementOwner,
		overlayRef,
		owner,
		sync,
	};
}

function TranscriptStickyHeaderVisual({
	owner,
}: {
	owner: TranscriptStickyHeaderGroup;
}) {
	return (
		<ConversationTraceTreeNode
			continues={owner.header.continues}
			depth={1}
			descends={owner.header.kind === "model"}
			rowHeight={owner.header.renderHeight}
		>
			<div
				className="flex min-h-10 min-w-0 items-center gap-2 pr-3"
				style={
					owner.header.renderHeight
						? { minHeight: owner.header.renderHeight }
						: undefined
				}
			>
				{owner.header.kind === "member" ? (
					<>
						<UserTraceAvatar
							expanded={false}
							expandable={false}
							imageUrl={owner.header.userImageUrl}
						/>
						<div className="group flex min-w-0 items-center gap-0 text-left">
							<h3
								className="min-w-0 shrink-0 truncate text-xs font-medium text-(--session-overview-text)"
								data-trace-user-label
							>
								{owner.header.userLabel}
							</h3>
							<TraceTextDisclosureIcon expanded={false} />
						</div>
					</>
				) : (
					<div className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left">
						<ModelSectionHeader data={owner.header} expanded />
					</div>
				)}
			</div>
		</ConversationTraceTreeNode>
	);
}

function HeaderMeasurement({
	measureRef,
	owner,
}: {
	measureRef: RefCallback<HTMLDivElement>;
	owner: TranscriptStickyHeaderGroup | undefined;
}) {
	return owner ? (
		<div
			ref={measureRef}
			aria-hidden="true"
			className="invisible absolute inset-x-0 top-0"
			data-transcript-sticky-header-measure={owner.header.kind}
		>
			<TranscriptStickyHeaderVisual owner={owner} />
		</div>
	) : null;
}

export const TranscriptStickyHeaderOverlay = memo(
	function TranscriptStickyHeaderOverlay({
		memberMeasureRef,
		memberMeasurementOwner,
		modelMeasureRef,
		modelMeasurementOwner,
		overlayRef,
		owner,
	}: {
		memberMeasureRef: RefCallback<HTMLDivElement>;
		memberMeasurementOwner: TranscriptStickyHeaderGroup | undefined;
		modelMeasureRef: RefCallback<HTMLDivElement>;
		modelMeasurementOwner: TranscriptStickyHeaderGroup | undefined;
		overlayRef: RefObject<HTMLDivElement | null>;
		owner: TranscriptStickyHeaderGroup | undefined;
	}) {
		return (
			<div
				ref={overlayRef}
				aria-hidden="true"
				className={`pointer-events-none sticky top-0 z-40 w-full min-w-0 bg-(--session-overview-surface) ${owner ? "visible" : "invisible"}`}
				data-transcript-sticky-header-kind={owner?.header.kind}
				data-transcript-sticky-header-owner={owner?.turnId}
				data-transcript-sticky-header-overlay
				data-transcript-sticky-header-terminal={
					owner?.header.terminal || undefined
				}
			>
				{owner ? <TranscriptStickyHeaderVisual owner={owner} /> : null}
				<HeaderMeasurement
					measureRef={memberMeasureRef}
					owner={memberMeasurementOwner}
				/>
				<HeaderMeasurement
					measureRef={modelMeasureRef}
					owner={modelMeasurementOwner}
				/>
			</div>
		);
	},
);
