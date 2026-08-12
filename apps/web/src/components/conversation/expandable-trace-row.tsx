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
	"flex min-h-10 w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left text-[0.8125rem] hover:bg-[color:var(--dashboardy-subsurface-strong)] focus-visible:outline-none focus-visible:bg-[color:var(--dashboardy-subsurface-strong)]";

const deltaClassName =
	"shrink-0 tabular-nums text-[0.75rem] text-[color:var(--dashboardy-muted)]";

const expandedBodyClassName = "bg-[color:var(--dashboardy-surface)] px-3 py-3";

export type TraceFocusRequest = { anchorId: string; requestId: number };

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

function usePreviewTruncation(
	fullPreviewText: string | undefined,
	setOpen: Dispatch<SetStateAction<boolean>>,
) {
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

			if (!semanticallyTruncated && !previewIsClipped) {
				setOpen(false);
			}
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
	}, [fullPreviewText, semanticallyTruncated, setOpen]);

	return {
		rowRef,
		truncated: semanticallyTruncated || visuallyTruncated,
	};
}

export function ExpandableTraceRow({
	children,
	body,
	delta,
	className,
	fullPreviewText,
	anchorId,
	focus,
	trailing,
}: {
	children: ReactNode | ((expanded: boolean, expandable: boolean) => ReactNode);
	body?: ReactNode;
	delta?: string;
	className?: string;
	fullPreviewText: string | undefined;
	anchorId?: string;
	focus?: TraceFocusRequest;
	trailing?: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const panelId = useId();
	const hasBody = body !== undefined && body !== null;
	const { rowRef, truncated } = usePreviewTruncation(fullPreviewText, setOpen);
	const expandable = hasBody && (fullPreviewText === undefined || truncated);
	const expanded = expandable && open;

	useTraceFocus(anchorId, focus, setOpen);

	const rowContent =
		typeof children === "function" ? children(expanded, expandable) : children;

	return (
		<div
			ref={rowRef}
			id={anchorId}
			className={cn(
				"min-w-0 scroll-mt-6 bg-[color:var(--conversation-trace-row-surface,var(--dashboardy-surface))]",
				className,
			)}
		>
			{expandable ? (
				<button
					type="button"
					onClick={() => setOpen(!open)}
					aria-expanded={expanded}
					aria-controls={panelId}
					className={cn(
						traceRowClassName,
						"group",
						expanded &&
							"sticky top-(--conversation-trace-sticky-offset) z-10 border-b border-[color:var(--dashboardy-divider)] bg-[color:var(--dashboardy-surface-opaque)]",
					)}
				>
					{rowContent}
					{trailing}
					{delta ? <span className={deltaClassName}>{delta}</span> : null}
				</button>
			) : (
				<div className={cn(traceRowClassName, "hover:bg-transparent")}>
					{rowContent}
					{trailing}
					{delta ? <span className={deltaClassName}>{delta}</span> : null}
				</div>
			)}
			{expanded ? (
				<div id={panelId} className={expandedBodyClassName}>
					{body}
				</div>
			) : null}
		</div>
	);
}
