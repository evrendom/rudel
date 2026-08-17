export const CONVERSATION_TRACE_TREE_LEVEL_GAP = 23;
const CONVERSATION_TRACE_TREE_FIRST_X = 16;
export const INTERFERE_MARKER_SIZE = 16;
const INTERFERE_RAIL_GAP = 4;
export const INTERFERE_RAIL_OFFSET =
	INTERFERE_MARKER_SIZE / 2 + INTERFERE_RAIL_GAP;
export const INTERFERE_DOT_RADIUS = 2;
export const INTERFERE_DOT_SIZE = INTERFERE_DOT_RADIUS * 2;
const INTERFERE_DOT_HORIZONTAL_LINE_OFFSET =
	INTERFERE_DOT_RADIUS + INTERFERE_RAIL_GAP;
export const INTERFERE_DOT_VERTICAL_LINE_OFFSET =
	INTERFERE_DOT_RADIUS + INTERFERE_RAIL_GAP;

export type ConversationTraceTreeConnectorStyle =
	| "curved"
	| "interfere"
	| "interfere-branch"
	| "interfere-branch-dots"
	| "interfere-branch-dots-no-horizontal";

export function getConversationTraceTreeBranchPath({
	continues,
	currentX,
	elbowY,
	style,
	width,
}: {
	continues: boolean;
	currentX: number;
	elbowY: number;
	style: ConversationTraceTreeConnectorStyle;
	width: number;
}) {
	if (style === "interfere") {
		return continues
			? undefined
			: `M ${currentX} 0 V ${Math.max(elbowY - INTERFERE_RAIL_OFFSET, 0)}`;
	}
	if (style === "interfere-branch") {
		return continues
			? `M ${currentX} ${elbowY} H ${width - 1}`
			: `M ${currentX} 0 V ${elbowY} H ${width - 1}`;
	}
	if (style === "interfere-branch-dots-no-horizontal") {
		return continues
			? undefined
			: `M ${currentX} 0 V ${elbowY - INTERFERE_DOT_VERTICAL_LINE_OFFSET}`;
	}
	if (style === "interfere-branch-dots") {
		const horizontalPath = `M ${currentX + INTERFERE_DOT_HORIZONTAL_LINE_OFFSET} ${elbowY} H ${width - 1}`;
		return continues
			? horizontalPath
			: `M ${currentX} 0 V ${elbowY - INTERFERE_DOT_VERTICAL_LINE_OFFSET} ${horizontalPath}`;
	}
	return continues
		? `M ${currentX} ${elbowY - 6} Q ${currentX} ${elbowY} ${currentX + 6} ${elbowY} H ${width - 1}`
		: `M ${currentX} 0 V ${elbowY - 6} Q ${currentX} ${elbowY} ${currentX + 6} ${elbowY} H ${width - 1}`;
}

export function getConversationTraceTreeX(
	depth: number,
	style: ConversationTraceTreeConnectorStyle = "curved",
) {
	if (style === "interfere") {
		return (
			6 + depth * CONVERSATION_TRACE_TREE_LEVEL_GAP + INTERFERE_MARKER_SIZE / 2
		);
	}
	return (
		CONVERSATION_TRACE_TREE_FIRST_X +
		(depth - 1) * CONVERSATION_TRACE_TREE_LEVEL_GAP
	);
}
