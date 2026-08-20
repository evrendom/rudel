import * as React from "react";
import {
	createContext,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useId,
	useSyncExternalStore,
} from "react";
import { cn } from "@/lib/utils";
import { compactPreview } from "./conversation-trace";
import { TraceTreeRowBodySlotContext } from "./conversation-trace-row-body-context";
import { isTraceTextCollapsible } from "./conversation-trace-text-disclosure";

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

export type TraceFocusRequest = { anchorId: string; requestId: number };

type TraceExpansionStore = {
	isExpanded: (expansionId: string) => boolean;
	setExpanded: (expansionId: string, expanded: boolean) => void;
	subscribe: (expansionId: string, listener: () => void) => () => void;
};

export function createTraceExpansionStore(): TraceExpansionStore {
	const expandedIds = new Set<string>();
	const listeners = new Map<string, Set<() => void>>();
	return {
		isExpanded: (expansionId) => expandedIds.has(expansionId),
		setExpanded: (expansionId, expanded) => {
			if (expanded === expandedIds.has(expansionId)) {
				return;
			}
			if (expanded) {
				expandedIds.add(expansionId);
			} else {
				expandedIds.delete(expansionId);
			}
			for (const listener of listeners.get(expansionId) ?? []) {
				listener();
			}
		},
		subscribe: (expansionId, listener) => {
			const expansionListeners = listeners.get(expansionId) ?? new Set();
			expansionListeners.add(listener);
			listeners.set(expansionId, expansionListeners);
			return () => {
				expansionListeners.delete(listener);
				if (expansionListeners.size === 0) {
					listeners.delete(expansionId);
				}
			};
		},
	};
}

const fallbackTraceExpansionStore = createTraceExpansionStore();
const TraceExpansionStoreContext = createContext<
	TraceExpansionStore | undefined
>(undefined);
const TraceExpansionIdContext = createContext<string | undefined>(undefined);
const TraceExpansionNamespaceContext = createContext<string | undefined>(
	undefined,
);

export function TraceExpansionStoreProvider({
	children,
	store,
}: {
	children: ReactNode;
	store: TraceExpansionStore;
}) {
	return (
		<TraceExpansionStoreContext.Provider value={store}>
			{children}
		</TraceExpansionStoreContext.Provider>
	);
}

export function TraceExpansionStoreScope({
	children,
}: {
	children: ReactNode;
}) {
	const parentStore = React.useContext(TraceExpansionStoreContext);
	const [localStore] = React.useState(createTraceExpansionStore);
	if (parentStore) {
		return children;
	}
	return (
		<TraceExpansionStoreContext.Provider value={localStore}>
			{children}
		</TraceExpansionStoreContext.Provider>
	);
}

export function TraceExpansionIdProvider({
	children,
	expansionId,
}: {
	children: ReactNode;
	expansionId: string;
}) {
	return (
		<TraceExpansionIdContext.Provider value={expansionId}>
			{children}
		</TraceExpansionIdContext.Provider>
	);
}

export function TraceExpansionNamespaceProvider({
	children,
	namespace,
}: {
	children: ReactNode;
	namespace: string;
}) {
	return (
		<TraceExpansionNamespaceContext.Provider value={namespace}>
			{children}
		</TraceExpansionNamespaceContext.Provider>
	);
}

export function TraceTextDisclosureIcon({ expanded }: { expanded: boolean }) {
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

function isPreviewTruncated(fullPreviewText: string | undefined) {
	const exceedsThreeExplicitLines =
		fullPreviewText !== undefined &&
		fullPreviewText.split(/\r\n?|\n/u).length > 3;
	return (
		exceedsThreeExplicitLines ||
		(fullPreviewText !== undefined &&
			compactPreview(fullPreviewText) !==
				compactPreview(fullPreviewText, Number.POSITIVE_INFINITY))
	);
}

export function useTraceExpansionState(expansionId: string) {
	const store =
		React.useContext(TraceExpansionStoreContext) ?? fallbackTraceExpansionStore;
	const subscribe = React.useCallback(
		(listener: () => void) => store.subscribe(expansionId, listener),
		[expansionId, store],
	);
	const getSnapshot = React.useCallback(
		() => store.isExpanded(expansionId),
		[expansionId, store],
	);
	const open = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
	const setOpen: Dispatch<SetStateAction<boolean>> = React.useCallback(
		(next) => {
			const expanded =
				typeof next === "function" ? next(store.isExpanded(expansionId)) : next;
			store.setExpanded(expansionId, expanded);
		},
		[expansionId, store],
	);
	return { open, setOpen };
}

export function ExpandableTraceRow({
	children,
	body,
	className,
	collapsedBody,
	compact = false,
	expansionId,
	fullPreviewText,
	anchorId,
	focus,
	label,
	leading,
	timestamp,
	trailing,
	treeBodyClassName,
	textDisclosure = false,
}: {
	children?: ReactNode;
	body?: ReactNode;
	className?: string;
	collapsedBody?: ReactNode;
	compact?: boolean;
	expansionId?: string;
	fullPreviewText: string | undefined;
	anchorId?: string;
	focus?: TraceFocusRequest;
	label: ReactNode;
	leading: ReactNode;
	timestamp?: string;
	trailing?: ReactNode;
	treeBodyClassName?: string;
	textDisclosure?: boolean;
}) {
	const generatedId = useId();
	const contextExpansionId = React.useContext(TraceExpansionIdContext);
	const expansionNamespace = React.useContext(TraceExpansionNamespaceContext);
	const localExpansionId =
		expansionId ?? contextExpansionId ?? anchorId ?? generatedId;
	const stableExpansionId = expansionNamespace
		? `${expansionNamespace}::${localExpansionId}`
		: localExpansionId;
	const { open, setOpen } = useTraceExpansionState(stableExpansionId);
	const panelId = `${generatedId}-panel`;
	const setTreeRowBody = React.useContext(TraceTreeRowBodySlotContext);
	const hasBody = body !== undefined && body !== null;
	const hasProsePreview = collapsedBody !== undefined && collapsedBody !== null;
	const truncated = textDisclosure
		? fullPreviewText !== undefined && isTraceTextCollapsible(fullPreviewText)
		: isPreviewTruncated(fullPreviewText);
	const expandable = hasBody && (fullPreviewText === undefined || truncated);
	const expanded = expandable && open;
	const collapsedPreviewBody =
		!expanded && hasProsePreview ? (
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
	const expandedContentBody = expanded ? (
		<div
			id={panelId}
			className={cn(
				hasProsePreview ? proseBodyClassName : expandedBodyClassName,
				treeBodyClassName,
			)}
			data-trace-expanded-content
		>
			{body}
		</div>
	) : undefined;
	const staticTextBody =
		textDisclosure && hasBody && !truncated ? (
			<div
				className={cn(
					hasProsePreview ? proseBodyClassName : expandedBodyClassName,
					treeBodyClassName,
				)}
				data-trace-static-content
			>
				{body}
			</div>
		) : undefined;
	const visibleBody =
		expandedContentBody ?? staticTextBody ?? collapsedPreviewBody;

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
		<div
			id={anchorId}
			className="min-w-0 scroll-mt-6"
			data-trace-expansion-id={stableExpansionId}
		>
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
