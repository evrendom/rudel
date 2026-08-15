import * as React from "react";
import {
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useId,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import { compactPreview } from "./conversation-trace";

// min-h-10 matches CONVERSATION_TRACE_TREE_ROW_HEIGHT (40px): the tree's
// connector elbows and depth-derived sticky slots both assume this height,
// so shorter rows would leave see-through gaps between stacked sticky levels.
export const traceRowClassName =
	"flex min-h-10 w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-[0.8125rem]";

export const traceInteractiveRowClassName = "focus-visible:outline-none";

const timestampClassName =
	"shrink-0 tabular-nums text-[0.75rem] text-[color:var(--dashboardy-muted)]";

// Keep the expanded content below the sticky row's masking boundary. The 4px
// top inset preserves Interfere's header-to-body gap and leaves rounded code
// cards fully visible instead of tucking their top edge beneath the row.
const expandedBodyClassName = "pt-1 pr-3 pb-2.5 pl-3";

export type TraceFocusRequest = { anchorId: string; requestId: number };

// A tree item supplies this slot so an expanded body can render below its
// fixed-height node. Outside the tree, ExpandableTraceRow keeps its normal
// inline body layout.
export const TraceTreeRowBodySlotContext = React.createContext<
	Dispatch<SetStateAction<ReactNode | undefined>> | undefined
>(undefined);

export function useTraceFocus(
	anchorId: string | undefined,
	focus: TraceFocusRequest | undefined,
	setOpen: Dispatch<SetStateAction<boolean>>,
) {
	const requestId =
		anchorId !== undefined && focus?.anchorId === anchorId
			? focus.requestId
			: undefined;

	React.useEffect(() => {
		if (requestId !== undefined) {
			setOpen(true);
		}
	}, [requestId, setOpen]);
}

function usePreviewTruncation(fullPreviewText: string | undefined) {
	const rowRef = useRef<HTMLDivElement>(null);
	const [visuallyTruncated, setVisuallyTruncated] = useState(false);
	const semanticallyTruncated =
		fullPreviewText !== undefined &&
		compactPreview(fullPreviewText) !==
			compactPreview(fullPreviewText, Number.POSITIVE_INFINITY);

	React.useEffect(() => {
		const row = rowRef.current;
		if (!row) {
			return;
		}

		const measure = () => {
			if (fullPreviewText === undefined) {
				setVisuallyTruncated(false);
				return;
			}

			const preview = row.querySelector<HTMLElement>("[data-trace-preview]");
			const previewIsClipped =
				preview !== null && preview.scrollWidth > preview.clientWidth + 1;
			setVisuallyTruncated(previewIsClipped);
		};
		const resizeObserver = new ResizeObserver(measure);
		const mutationObserver = new MutationObserver(measure);

		resizeObserver.observe(row);
		mutationObserver.observe(row, {
			childList: true,
			characterData: true,
			subtree: true,
		});
		measure();

		return () => {
			resizeObserver.disconnect();
			mutationObserver.disconnect();
		};
	}, [fullPreviewText]);

	return {
		rowRef,
		truncated: semanticallyTruncated || visuallyTruncated,
	};
}

export function ExpandableTraceRow({
	children,
	body,
	className,
	fullPreviewText,
	anchorId,
	focus,
	timestamp,
	trailing,
	treeBodyClassName,
}: {
	children: ReactNode | ((expanded: boolean, expandable: boolean) => ReactNode);
	body?: ReactNode;
	className?: string;
	fullPreviewText: string | undefined;
	anchorId?: string;
	focus?: TraceFocusRequest;
	timestamp?: string;
	trailing?: ReactNode;
	treeBodyClassName?: string;
}) {
	const [open, setOpen] = useState(false);
	const panelId = useId();
	const setTreeRowBody = React.useContext(TraceTreeRowBodySlotContext);
	const hasBody = body !== undefined && body !== null;
	const { rowRef, truncated } = usePreviewTruncation(fullPreviewText);
	const expandable = hasBody && (fullPreviewText === undefined || truncated);
	const expanded = expandable && open;
	const expandedBody = expanded ? (
		<div
			id={panelId}
			className={cn(expandedBodyClassName, treeBodyClassName)}
			data-trace-expanded-content
		>
			{body}
		</div>
	) : undefined;

	useTraceFocus(anchorId, focus, setOpen);
	React.useLayoutEffect(() => {
		if (!setTreeRowBody) {
			return;
		}

		setTreeRowBody(expandedBody);
		return () => setTreeRowBody(undefined);
	}, [expandedBody, setTreeRowBody]);

	const rowContent =
		typeof children === "function" ? children(expanded, expandable) : children;

	return (
		<div ref={rowRef} id={anchorId} className="min-w-0 scroll-mt-6">
			{expandable ? (
				<button
					type="button"
					data-trace-hover-row
					data-trace-row-header
					onClick={() => setOpen(!open)}
					aria-expanded={expanded}
					aria-controls={panelId}
					className={cn(
						traceRowClassName,
						"group focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)]",
						className,
					)}
				>
					{rowContent}
					{trailing}
					{timestamp ? (
						<span className={timestampClassName} data-trace-timestamp>
							{timestamp}
						</span>
					) : null}
				</button>
			) : (
				<div data-trace-row-header className={cn(traceRowClassName, className)}>
					{rowContent}
					{trailing}
					{timestamp ? (
						<span className={timestampClassName} data-trace-timestamp>
							{timestamp}
						</span>
					) : null}
				</div>
			)}
			{setTreeRowBody === undefined ? expandedBody : null}
		</div>
	);
}
