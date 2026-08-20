import { type RefObject, useLayoutEffect, useRef } from "react";
import { clampPaneSize } from "@/components/ui/horizontal-resize-utils";
import {
	MAXIMUM_SESSION_TURN_TABLE_PANE_WIDTH_PX,
	MINIMUM_SESSION_TURN_TABLE_PANE_WIDTH_PX,
	SESSION_DETAIL_RESIZE_HANDLE_WIDTH_PX,
} from "./session-detail-pane-sizing";

export const SESSION_WORKSPACE_RESIZE_START_EVENT =
	"rudel:session-workspace-resize-start";
export const SESSION_WORKSPACE_RESIZE_END_EVENT =
	"rudel:session-workspace-resize-end";

const SESSION_DETAIL_RESPONSE_PANE_SELECTOR =
	'[data-slot="session-detail-response-pane"]';

export function useStableTranscriptWidthDuringWorkspaceResize({
	layoutRef,
	onTurnTableWidthChange,
	turnTablePaneWidth,
}: {
	layoutRef: RefObject<HTMLDivElement | null>;
	onTurnTableWidthChange: (width: number) => void;
	turnTablePaneWidth: number;
}) {
	const pendingTurnTableWidthRef = useRef<number | undefined>(undefined);

	useLayoutEffect(() => {
		const layout = layoutRef.current;
		const workspace = layout?.closest<HTMLElement>(
			'[data-slot="session-workspace"]',
		);
		const responsePane = layout?.querySelector<HTMLElement>(
			SESSION_DETAIL_RESPONSE_PANE_SELECTOR,
		);
		if (!layout || !workspace || !responsePane) return;

		let stableTranscriptWidth: number | undefined;

		const handleResizeStart = () => {
			pendingTurnTableWidthRef.current = undefined;
			const measuredWidth = responsePane.getBoundingClientRect().width;
			if (measuredWidth <= 0) return;

			stableTranscriptWidth = measuredWidth;
			layout.style.setProperty(
				"--session-transcript-pane-width",
				`${measuredWidth}px`,
			);
			layout.dataset.workspaceResizing = "true";
		};

		const handleResizeEnd = () => {
			if (stableTranscriptWidth === undefined) return;

			const nextTurnTableWidth = clampPaneSize(
				layout.getBoundingClientRect().width -
					stableTranscriptWidth -
					SESSION_DETAIL_RESIZE_HANDLE_WIDTH_PX,
				MINIMUM_SESSION_TURN_TABLE_PANE_WIDTH_PX,
				MAXIMUM_SESSION_TURN_TABLE_PANE_WIDTH_PX,
			);
			layout.style.setProperty(
				"--session-turn-table-pane-width",
				`${nextTurnTableWidth}px`,
			);
			onTurnTableWidthChange(nextTurnTableWidth);
			pendingTurnTableWidthRef.current = nextTurnTableWidth;
			stableTranscriptWidth = undefined;
		};

		workspace.addEventListener(
			SESSION_WORKSPACE_RESIZE_START_EVENT,
			handleResizeStart,
		);
		workspace.addEventListener(
			SESSION_WORKSPACE_RESIZE_END_EVENT,
			handleResizeEnd,
		);
		return () => {
			workspace.removeEventListener(
				SESSION_WORKSPACE_RESIZE_START_EVENT,
				handleResizeStart,
			);
			workspace.removeEventListener(
				SESSION_WORKSPACE_RESIZE_END_EVENT,
				handleResizeEnd,
			);
			pendingTurnTableWidthRef.current = undefined;
			delete layout.dataset.workspaceResizing;
			layout.style.removeProperty("--session-transcript-pane-width");
		};
	}, [layoutRef, onTurnTableWidthChange]);

	useLayoutEffect(() => {
		const layout = layoutRef.current;
		const pendingTurnTableWidth = pendingTurnTableWidthRef.current;
		if (
			!layout ||
			pendingTurnTableWidth === undefined ||
			Math.abs(turnTablePaneWidth - pendingTurnTableWidth) >= 0.5
		) {
			return;
		}

		pendingTurnTableWidthRef.current = undefined;
		delete layout.dataset.workspaceResizing;
		layout.style.removeProperty("--session-transcript-pane-width");
	}, [layoutRef, turnTablePaneWidth]);
}
