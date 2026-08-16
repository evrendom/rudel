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
import { TraceTreeRowBodySlotContext } from "./conversation-trace-row-body-context";

// min-h-10 matches CONVERSATION_TRACE_TREE_ROW_HEIGHT (40px): the tree's
// connector elbows and depth-derived sticky slots both assume this height,
// so shorter rows would leave see-through gaps between stacked sticky levels.
export const traceRowClassName =
	"flex min-h-10 w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-[0.8125rem]";

const compactTraceRowClassName = "min-h-8 py-1";

export const traceInteractiveRowClassName = "focus-visible:outline-none";

const timestampClassName =
	"shrink-0 tabular-nums text-[0.75rem] text-[color:var(--dashboardy-muted)]";

// Keep the expanded content below the sticky row's masking boundary. The 4px
// top inset preserves Interfere's header-to-body gap and leaves rounded code
// cards fully visible instead of tucking their top edge beneath the row.
const expandedBodyClassName = "pt-1 pr-3 pb-2.5 pl-3";
const proseBodyClassName = "px-3 py-1";
const collapsedProseBodyHeight = 68;

export type TraceFocusRequest = { anchorId: string; requestId: number };

function TraceTextDisclosureIcon({ expanded }: { expanded: boolean }) {
	return (
		<svg
			aria-hidden="true"
			className={cn(
				"pointer-events-none -ml-0.5 size-4 shrink-0 transition-transform duration-150 will-change-transform",
				expanded && "rotate-90",
			)}
			data-trace-content-disclosure-icon
			fill="currentColor"
			focusable="false"
			height="16"
			role="img"
			style={{
				color:
					"oklch(from var(--constellation-tree-secondary, color(display-p3 0 0 0 / 60.8%)) calc(l + 0.16) c h)",
			}}
			viewBox="0 0 16 16"
			width="16"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path d="M7 10.62a.5.5 0 0 1-.75-.43V5.81A.5.5 0 0 1 7 5.38l3.76 2.19a.5.5 0 0 1 0 .86L7 10.62Z" />
		</svg>
	);
}

function AnimatedTraceProseBody({
	body,
	collapsedBody,
	expanded,
	panelId,
	treeBodyClassName,
}: {
	body: ReactNode;
	collapsedBody: ReactNode;
	expanded: boolean;
	panelId: string;
	treeBodyClassName: string | undefined;
}) {
	const expandedBodyRef = useRef<HTMLDivElement>(null);
	const [expandedHeight, setExpandedHeight] = useState(
		collapsedProseBodyHeight,
	);

	React.useLayoutEffect(() => {
		const expandedBodyElement = expandedBodyRef.current;
		if (!expandedBodyElement) {
			return;
		}

		const measure = () => {
			const nextHeight = Math.ceil(expandedBodyElement.scrollHeight);
			setExpandedHeight((currentHeight) =>
				currentHeight === nextHeight ? currentHeight : nextHeight,
			);
		};
		const resizeObserver = new ResizeObserver(measure);

		resizeObserver.observe(expandedBodyElement);
		measure();
		return () => resizeObserver.disconnect();
	}, []);

	const style = {
		"--trace-prose-body-height": `${expanded ? expandedHeight : collapsedProseBodyHeight}px`,
	} as React.CSSProperties;

	return (
		<div
			id={panelId}
			className={cn(
				"relative h-(--trace-prose-body-height) min-w-0 overflow-clip transition-[height] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
				expanded
					? "[mask-image:none]"
					: "[mask-image:linear-gradient(to_bottom,#000_0%,#000_calc(100%_-_0.75rem),transparent_100%)]",
			)}
			data-trace-prose-motion
			style={style}
		>
			<div
				aria-hidden={expanded || undefined}
				className={cn(
					"absolute inset-x-0 top-0 flex items-start transition-opacity duration-100 motion-reduce:transition-none",
					proseBodyClassName,
					treeBodyClassName,
					expanded && "pointer-events-none opacity-0",
				)}
				data-trace-collapsed-preview
			>
				{collapsedBody}
			</div>
			<div
				ref={expandedBodyRef}
				aria-hidden={!expanded || undefined}
				className={cn(
					"absolute inset-x-0 top-0 transition-opacity duration-100 motion-reduce:transition-none",
					proseBodyClassName,
					treeBodyClassName,
					!expanded && "pointer-events-none opacity-0",
				)}
				data-trace-expanded-content
			>
				{body}
			</div>
		</div>
	);
}

function AnimatedTraceDetailsBody({
	body,
	expanded,
	panelId,
	treeBodyClassName,
}: {
	body: ReactNode;
	expanded: boolean;
	panelId: string;
	treeBodyClassName: string | undefined;
}) {
	const bodyRef = useRef<HTMLDivElement>(null);
	const [bodyHeight, setBodyHeight] = useState(0);

	React.useLayoutEffect(() => {
		const bodyElement = bodyRef.current;
		if (!bodyElement) {
			return;
		}

		const measure = () => {
			const nextHeight = Math.ceil(bodyElement.scrollHeight);
			setBodyHeight((currentHeight) =>
				currentHeight === nextHeight ? currentHeight : nextHeight,
			);
		};
		const resizeObserver = new ResizeObserver(measure);

		resizeObserver.observe(bodyElement);
		measure();
		return () => resizeObserver.disconnect();
	}, []);

	const style = {
		"--trace-details-body-height": `${expanded ? bodyHeight : 0}px`,
	} as React.CSSProperties;

	return (
		<div
			id={panelId}
			aria-hidden={!expanded || undefined}
			className="relative h-(--trace-details-body-height) min-w-0 overflow-clip transition-[height] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none"
			data-trace-details-motion
			style={style}
		>
			<div
				ref={bodyRef}
				className={cn(
					expandedBodyClassName,
					treeBodyClassName,
					"transition-opacity duration-100 motion-reduce:transition-none",
					!expanded && "pointer-events-none opacity-0",
				)}
				data-trace-expanded-content
				inert={!expanded}
			>
				{body}
			</div>
		</div>
	);
}

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
	const exceedsThreeExplicitLines =
		fullPreviewText !== undefined &&
		fullPreviewText.split(/\r\n?|\n/u).length > 3;
	const semanticallyTruncated =
		fullPreviewText !== undefined &&
		compactPreview(fullPreviewText) !==
			compactPreview(fullPreviewText, Number.POSITIVE_INFINITY);

	React.useLayoutEffect(() => {
		const row = rowRef.current;
		if (!row) {
			return;
		}

		const measure = () => {
			if (fullPreviewText === undefined) {
				setVisuallyTruncated(false);
				return;
			}

			const previewRoot =
				row.closest<HTMLElement>("[data-trace-tree-item-depth]") ?? row;
			const preview = previewRoot.querySelector<HTMLElement>(
				"[data-trace-preview]",
			);
			if (preview === null) {
				return;
			}
			const previewIsClipped =
				preview.scrollWidth > preview.clientWidth + 1 ||
				preview.scrollHeight > preview.clientHeight + 1;
			setVisuallyTruncated(previewIsClipped);
		};
		const previewRoot =
			row.closest<HTMLElement>("[data-trace-tree-item-depth]") ?? row;
		const resizeObserver = new ResizeObserver(measure);
		const mutationObserver = new MutationObserver(measure);

		resizeObserver.observe(row);
		mutationObserver.observe(previewRoot, {
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
		proseTruncated: exceedsThreeExplicitLines || visuallyTruncated,
		rowRef,
		truncated:
			exceedsThreeExplicitLines || semanticallyTruncated || visuallyTruncated,
	};
}

export function ExpandableTraceRow({
	children,
	body,
	className,
	collapsedBody,
	compact = false,
	fullPreviewText,
	anchorId,
	focus,
	label,
	leading,
	timestamp,
	trailing,
	treeBodyClassName,
}: {
	children?: ReactNode;
	body?: ReactNode;
	className?: string;
	collapsedBody?: ReactNode;
	compact?: boolean;
	fullPreviewText: string | undefined;
	anchorId?: string;
	focus?: TraceFocusRequest;
	label: ReactNode;
	leading: ReactNode;
	timestamp?: string;
	trailing?: ReactNode;
	treeBodyClassName?: string;
}) {
	const [open, setOpen] = useState(false);
	const panelId = useId();
	const setTreeRowBody = React.useContext(TraceTreeRowBodySlotContext);
	const hasBody = body !== undefined && body !== null;
	const hasProsePreview = collapsedBody !== undefined && collapsedBody !== null;
	const { proseTruncated, rowRef, truncated } =
		usePreviewTruncation(fullPreviewText);
	const expandable =
		hasBody &&
		(fullPreviewText === undefined ||
			(hasProsePreview ? proseTruncated : truncated));
	const expanded = expandable && open;
	const animatedProseBody =
		expandable && hasProsePreview ? (
			<AnimatedTraceProseBody
				body={body}
				collapsedBody={collapsedBody}
				expanded={expanded}
				panelId={panelId}
				treeBodyClassName={treeBodyClassName}
			/>
		) : undefined;
	const animatedDetailsBody =
		expandable && !hasProsePreview ? (
			<AnimatedTraceDetailsBody
				body={body}
				expanded={expanded}
				panelId={panelId}
				treeBodyClassName={treeBodyClassName}
			/>
		) : undefined;
	const collapsedPreviewBody =
		!expandable && collapsedBody !== undefined && collapsedBody !== null ? (
			<div
				className={cn(
					proseBodyClassName,
					"flex items-center",
					treeBodyClassName,
				)}
				data-trace-collapsed-preview
			>
				{collapsedBody}
			</div>
		) : undefined;
	const visibleBody =
		animatedProseBody ?? animatedDetailsBody ?? collapsedPreviewBody;

	useTraceFocus(anchorId, focus, setOpen);
	React.useLayoutEffect(() => {
		if (!setTreeRowBody) {
			return;
		}

		setTreeRowBody(
			visibleBody === undefined
				? undefined
				: { content: visibleBody, expanded },
		);
		return () => setTreeRowBody(undefined);
	}, [expanded, setTreeRowBody, visibleBody]);

	return (
		<div ref={rowRef} id={anchorId} className="min-w-0 scroll-mt-6">
			<div
				data-trace-hover-row={expandable || undefined}
				data-trace-row-header
				className={cn(
					traceRowClassName,
					compact && compactTraceRowClassName,
					className,
				)}
			>
				{leading}
				{expandable ? (
					<button
						type="button"
						data-trace-content-disclosure
						onClick={() => setOpen((current) => !current)}
						aria-expanded={expanded}
						aria-controls={panelId}
						className="group flex min-w-0 flex-1 items-center gap-0 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--dashboard-01-metric-button-focus-ring)]"
					>
						{label}
						{children}
						<TraceTextDisclosureIcon expanded={expanded} />
					</button>
				) : (
					<div className="flex min-w-0 flex-1 items-center gap-2">
						{label}
						{children}
					</div>
				)}
				{trailing}
				{timestamp ? (
					<span className={timestampClassName} data-trace-timestamp>
						{timestamp}
					</span>
				) : null}
			</div>
			{setTreeRowBody === undefined ? visibleBody : null}
		</div>
	);
}
