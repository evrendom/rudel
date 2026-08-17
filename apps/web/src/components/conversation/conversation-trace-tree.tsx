// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: Tree nodes, request disclosures, and connector geometry share one rendering contract.
import { Collapsible } from "@base-ui/react/collapsible";
import {
	type ComponentType,
	type CSSProperties,
	createContext,
	type ReactNode,
	useContext,
	useId,
	useMemo,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import { getToolPresentation, type ToolIconName } from "./conversation-tools";
import type { TraceEvent } from "./conversation-trace";
import {
	formatTraceCallContext,
	getTraceCallGroupStyle,
	type TraceCallDisplayConfig,
	type TraceCallGroupTreatment,
} from "./conversation-trace-call-display";
import {
	conversationTraceLabelClassName,
	conversationTraceStickyOnlyFillClassName,
} from "./conversation-trace-class-names";
import {
	TraceBrainIcon,
	TraceExchangeIcon,
	TraceMessageIcon,
	TraceWrenchIcon,
} from "./conversation-trace-hugeicons";
import {
	TraceDisclosureIcon,
	TraceIcon,
	type TraceIconTone,
} from "./conversation-trace-icons";
import {
	type AgentTraceRequestUsage,
	formatTraceRequestTokens,
	getTraceRequestCachedShare,
	getTraceRequestInputTotal,
} from "./conversation-trace-requests";
import {
	type TraceTreeRowBodySlot,
	TraceTreeRowBodySlotContext,
} from "./conversation-trace-row-body-context";
import { CONVERSATION_TOOL_ICONS } from "./conversation-trace-tool-icons";
import {
	CONVERSATION_TRACE_TREE_LEVEL_GAP,
	type ConversationTraceTreeConnectorStyle,
	getConversationTraceTreeBranchPath,
	getConversationTraceTreeX,
	INTERFERE_DOT_RADIUS,
	INTERFERE_DOT_SIZE,
	INTERFERE_DOT_VERTICAL_LINE_OFFSET,
	INTERFERE_MARKER_SIZE,
	INTERFERE_RAIL_OFFSET,
} from "./conversation-trace-tree-geometry";
import {
	type TraceFocusRequest,
	traceRowClassName,
	useTraceFocus,
} from "./expandable-trace-row";
import { ModelSectionHeader } from "./model-section-header";

export type ConversationTraceSpeakerLayout =
	| "inline"
	| "table-row"
	| "trace-tree";

interface ConversationTraceTreeRowStyle extends CSSProperties {
	"--conversation-trace-tree-descend-x": string;
	"--conversation-trace-tree-padding": string;
}

interface ConversationTraceTreeItemStyle extends CSSProperties {
	"--conversation-trace-sticky-offset": string;
}

interface CollapsedTraceCountStyle extends CSSProperties {
	"--trace-icon-bg": string;
}

const COLLAPSED_TRACE_COUNT_STYLE: CollapsedTraceCountStyle = {
	"--trace-icon-bg":
		"color-mix(in srgb, var(--conversation-trace-connector-color, var(--session-overview-border)) 75%, transparent)",
	background:
		"color-mix(in srgb, var(--conversation-trace-connector-color, var(--session-overview-border)) 75%, transparent)",
	color:
		"var(--constellation-tree-tertiary, var(--session-overview-subtle, var(--session-overview-muted)))",
	height: 16,
	mask: 'url("/opaline-trace-fill.svg") center / contain no-repeat',
	WebkitMask: 'url("/opaline-trace-fill.svg") center / contain no-repeat',
	width: 16,
};

export type AgentTraceTreeRenderedBranch = {
	childStartIndex: number;
	children: readonly { key: string; row: ReactNode }[];
	hasFollowingBranch: boolean;
	hasRoot: boolean;
	key: string;
	root: { key: string; row: ReactNode } | undefined;
	sticky?: boolean;
	totalChildren: number;
};

export type AgentTraceTreeRenderedSection = {
	branchDepth: 2 | 3;
	branches: readonly AgentTraceTreeRenderedBranch[];
	continuesFromPrevious: boolean;
	continuesToNext: boolean;
	events: TraceEvent[];
	flatRequestRows: boolean;
	groupIndex: number | undefined;
	groupTreatment: TraceCallGroupTreatment;
	header:
		| ((
				expanded: boolean | undefined,
				collapsedPreview: ReactNode,
		  ) => ReactNode)
		| undefined;
	key: string;
};

const CONVERSATION_TRACE_TREE_ROW_HEIGHT = 40;
const CONVERSATION_TRACE_TREE_COMPACT_ROW_HEIGHT = 32;
const COLLAPSED_TRACE_ICON_LIMIT = 25;
const traceCollapsiblePanelClassName =
	"h-(--collapsible-panel-height) min-w-0 overflow-clip transition-[height,opacity] duration-200 ease-[cubic-bezier(0.2,0,0,1)] data-ending-style:h-0 data-ending-style:opacity-0 data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none";
type ConversationTraceTreeConnectorShape = "branch" | "through";

function isDottedInterfereBranchStyle(
	style: ConversationTraceTreeConnectorStyle,
) {
	return (
		style === "interfere-branch-dots" ||
		style === "interfere-branch-dots-no-horizontal"
	);
}

const ConversationTraceTreeRailContext = createContext<readonly boolean[]>([]);
const ConversationTraceTreeConnectorStyleContext =
	createContext<ConversationTraceTreeConnectorStyle>("curved");
// Accumulated bottom edge of the sticky ancestor stack, in px from the scroll
// container top. Rows pin AT this offset and add their own height for their
// subtree only when they actually stick. Depth-based math (depth × 40) breaks
// as soon as a sticky row is not exactly 40px tall (flat request rows are
// 24px), opening a see-through slot between stuck rows.
const ConversationTraceTreeStickyOffsetContext = createContext(0);

export function ConversationTraceCollapsiblePanel({
	children,
	id,
}: {
	children: ReactNode;
	id?: string;
}) {
	return (
		<Collapsible.Panel
			id={id}
			className={traceCollapsiblePanelClassName}
			data-trace-tree-motion-panel
			keepMounted
		>
			{children}
		</Collapsible.Panel>
	);
}

export function ConversationTraceTreeConnectorStyleProvider({
	children,
	style,
}: {
	children: ReactNode;
	style: ConversationTraceTreeConnectorStyle;
}) {
	return (
		<ConversationTraceTreeConnectorStyleContext.Provider value={style}>
			{children}
		</ConversationTraceTreeConnectorStyleContext.Provider>
	);
}

function ConversationTraceTreeRail({
	continues,
	depth,
	ownedByStickyConnector,
	rowHeight,
	shape,
}: {
	continues: boolean;
	depth: number;
	ownedByStickyConnector: boolean;
	rowHeight: number;
	shape: ConversationTraceTreeConnectorShape;
}) {
	const connectorStyle = useContext(ConversationTraceTreeConnectorStyleContext);
	const railX = getConversationTraceTreeX(depth, connectorStyle);

	// Sticky rows redraw their connector inside the sticky surface so the rail
	// remains visible while pinned. Rendering this item-owned rail as well would
	// stack two translucent 0.5px strokes and create darker, thicker fragments.
	if (ownedByStickyConnector) {
		return null;
	}

	if (shape === "branch" && !continues) {
		// A terminal row's feed line is part of its sticky connector, so it
		// travels with a pinned header. A rail fragment here would stay
		// anchored to the item and scroll away from the pinned elbow.
		return null;
	}

	if (
		shape === "branch" &&
		(connectorStyle === "interfere" ||
			isDottedInterfereBranchStyle(connectorStyle))
	) {
		const markerY = rowHeight / 2;
		const lineOffset =
			connectorStyle === "interfere"
				? INTERFERE_RAIL_OFFSET
				: INTERFERE_DOT_VERTICAL_LINE_OFFSET;

		return (
			<svg
				aria-hidden="true"
				className="pointer-events-none absolute top-0 left-0"
				fill="none"
				height={rowHeight}
				strokeLinecap="round"
				viewBox={`0 0 ${railX + 1} ${rowHeight}`}
				width={railX + 1}
				style={{
					stroke:
						"var(--conversation-trace-connector-color, var(--session-overview-border))",
					strokeWidth: "var(--conversation-trace-connector-width, 1)",
				}}
			>
				<path
					d={`M ${railX} 0 V ${Math.max(markerY - lineOffset, 0)}`}
					data-trace-tree-line
					data-trace-tree-line-depth={depth}
					data-trace-tree-rail-segment="incoming"
				/>
				<path
					d={`M ${railX} ${markerY + lineOffset} V ${rowHeight}`}
					data-trace-tree-line
					data-trace-tree-line-depth={depth}
					data-trace-tree-rail-segment="outgoing"
				/>
			</svg>
		);
	}

	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute top-0 left-0"
			data-trace-tree-rail={continues ? "continuing" : "terminal"}
			data-trace-tree-rail-depth={depth}
			fill="none"
			height={rowHeight}
			strokeLinecap="round"
			viewBox={`0 0 ${railX + 1} ${rowHeight}`}
			width={railX + 1}
			style={{
				stroke:
					"var(--conversation-trace-connector-color, var(--session-overview-border))",
				strokeWidth: "var(--conversation-trace-connector-width, 1)",
			}}
		>
			<path
				d={`M ${railX} 0 V ${rowHeight}`}
				data-trace-tree-continuation
				data-trace-tree-line
				data-trace-tree-line-depth={depth}
			/>
		</svg>
	);
}

function ConversationTraceTreeExpandedBodyRails({
	ancestorRails,
	connectorStyle,
	continues,
	depth,
}: {
	ancestorRails: readonly boolean[];
	connectorStyle: ConversationTraceTreeConnectorStyle;
	continues: boolean;
	depth: number;
}) {
	const activeRails = ancestorRails.flatMap((active, index) =>
		active
			? [
					{
						depth: index + 1,
						x: getConversationTraceTreeX(index + 1, connectorStyle),
					},
				]
			: [],
	);
	if (continues) {
		activeRails.push({
			depth,
			x: getConversationTraceTreeX(depth, connectorStyle),
		});
	}
	if (activeRails.length === 0) {
		return null;
	}

	const width = Math.max(...activeRails.map((rail) => rail.x)) + 1;
	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute inset-y-0 left-0 h-full"
			data-trace-tree-expanded-rails
			fill="none"
			height="100%"
			strokeLinecap="round"
			width={width}
			style={{
				stroke:
					"var(--conversation-trace-connector-color, var(--session-overview-border))",
				strokeWidth: "var(--conversation-trace-connector-width, 1)",
			}}
		>
			{activeRails.map((rail) => (
				<line
					key={`${rail.depth}:${rail.x}`}
					data-trace-tree-continuation
					data-trace-tree-line
					data-trace-tree-line-depth={rail.depth}
					x1={rail.x}
					x2={rail.x}
					y1="0"
					y2="100%"
				/>
			))}
		</svg>
	);
}

function ConversationTraceTreeConnector({
	ancestorRails,
	continues,
	depth,
	rowHeight,
	shape,
	sticky,
}: {
	ancestorRails: readonly boolean[];
	continues: boolean;
	depth: number;
	rowHeight: number;
	shape: ConversationTraceTreeConnectorShape;
	sticky: boolean;
}) {
	const connectorStyle = useContext(ConversationTraceTreeConnectorStyleContext);
	const width = 6 + depth * CONVERSATION_TRACE_TREE_LEVEL_GAP;
	const connectorWidth =
		connectorStyle === "interfere" ? width + INTERFERE_MARKER_SIZE : width;
	const currentX = getConversationTraceTreeX(depth, connectorStyle);
	const elbowY = rowHeight / 2;
	const activeAncestorRails = ancestorRails.flatMap((active, index) =>
		active
			? [
					{
						depth: index + 1,
						x: getConversationTraceTreeX(index + 1, connectorStyle),
					},
				]
			: [],
	);
	const branchPath = getConversationTraceTreeBranchPath({
		continues,
		currentX,
		elbowY,
		style: connectorStyle,
		width,
	});
	const stickyRailOffset =
		connectorStyle === "interfere"
			? INTERFERE_RAIL_OFFSET
			: INTERFERE_DOT_VERTICAL_LINE_OFFSET;
	const rendersAncestorRails =
		sticky || isDottedInterfereBranchStyle(connectorStyle);

	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute top-0 left-0"
			data-trace-tree-connector={shape}
			data-trace-tree-connector-depth={depth}
			data-trace-tree-connector-style={connectorStyle}
			fill="none"
			height={rowHeight}
			strokeLinecap="round"
			strokeLinejoin="round"
			viewBox={`0 0 ${connectorWidth} ${rowHeight}`}
			width={connectorWidth}
			style={{
				stroke:
					"var(--conversation-trace-connector-color, var(--session-overview-border))",
				strokeWidth: "var(--conversation-trace-connector-width, 1)",
			}}
		>
			{rendersAncestorRails
				? activeAncestorRails.map((rail) => (
						<path
							key={`${rail.depth}:${rail.x}`}
							d={`M ${rail.x} 0 V ${rowHeight}`}
							data-trace-tree-continuation
							data-trace-tree-line-depth={rail.depth}
						/>
					))
				: null}
			{shape === "through" ? (
				sticky ? (
					<path
						d={`M ${currentX} 0 V ${rowHeight}`}
						data-trace-tree-continuation
						data-trace-tree-line-depth={depth}
					/>
				) : null
			) : (
				<>
					{sticky && continues ? (
						connectorStyle === "interfere" ||
						isDottedInterfereBranchStyle(connectorStyle) ? (
							<>
								<path
									d={`M ${currentX} 0 V ${Math.max(elbowY - stickyRailOffset, 0)}`}
									data-trace-tree-line-depth={depth}
									data-trace-tree-rail-segment="incoming"
								/>
								<path
									d={`M ${currentX} ${elbowY + stickyRailOffset} V ${rowHeight}`}
									data-trace-tree-line-depth={depth}
									data-trace-tree-rail-segment="outgoing"
								/>
							</>
						) : (
							<path
								d={`M ${currentX} 0 V ${rowHeight}`}
								data-trace-tree-continuation
								data-trace-tree-line-depth={depth}
							/>
						)
					) : null}
					{/* Terminal rows carry their own feed line down to the elbow
					    (the item rail draws nothing for them), so feed and elbow
					    pin and release as one unit. */}
					{branchPath === undefined ? null : (
						<path
							d={branchPath}
							data-trace-tree-line-depth={depth}
							data-trace-tree-terminal-feed={
								shape === "branch" && !continues ? "true" : undefined
							}
						/>
					)}
					{isDottedInterfereBranchStyle(connectorStyle) ? (
						<rect
							data-trace-tree-junction-depth={depth}
							data-trace-tree-junction-shape="opaline"
							data-trace-tree-junction-dot
							height={INTERFERE_DOT_SIZE}
							width={INTERFERE_DOT_SIZE}
							x={currentX - INTERFERE_DOT_RADIUS}
							y={elbowY - INTERFERE_DOT_RADIUS}
							style={{
								fill: "var(--conversation-trace-junction-color, var(--conversation-trace-connector-color, var(--session-overview-border)))",
								mask: 'url("/opaline-trace-fill.svg") center / contain no-repeat',
								WebkitMask:
									'url("/opaline-trace-fill.svg") center / contain no-repeat',
								stroke: "none",
							}}
						/>
					) : null}
				</>
			)}
		</svg>
	);
}

export function ConversationTraceTreeNode({
	children,
	className,
	connectorShape = "branch",
	continues,
	descends = false,
	depth,
	expanded = false,
	rowHeight = CONVERSATION_TRACE_TREE_ROW_HEIGHT,
	sticky: stickyOverride,
	stickyTop: stickyTopOverride,
}: {
	children: ReactNode;
	className?: string;
	connectorShape?: ConversationTraceTreeConnectorShape;
	continues: boolean;
	descends?: boolean;
	depth: number;
	expanded?: boolean;
	rowHeight?: number;
	sticky?: boolean;
	stickyTop?: number;
}) {
	const ancestorRails = useContext(ConversationTraceTreeRailContext);
	const connectorStyle = useContext(ConversationTraceTreeConnectorStyleContext);
	const sticky = stickyOverride ?? false;
	const expandedStickySurface = sticky && expanded;
	const width = 6 + depth * CONVERSATION_TRACE_TREE_LEVEL_GAP;
	const stickyTop =
		stickyTopOverride ?? (depth - 1) * CONVERSATION_TRACE_TREE_ROW_HEIGHT;
	const descendantX = getConversationTraceTreeX(depth + 1, connectorStyle);
	const descendantTop =
		connectorStyle === "interfere" ? rowHeight / 2 + INTERFERE_RAIL_OFFSET : 30;
	const showsDescendantRail =
		descends && !isDottedInterfereBranchStyle(connectorStyle);
	const style: ConversationTraceTreeRowStyle & {
		"--conversation-trace-sticky-offset": string;
		top?: string;
		zIndex?: number;
	} = {
		"--conversation-trace-sticky-offset": `${stickyTop}px`,
		"--conversation-trace-tree-descend-x": `${descendantX}px`,
		"--conversation-trace-tree-padding": `${width}px`,
		height: `${rowHeight}px`,
	};
	if (sticky) {
		style.top = `${stickyTop}px`;
		style.zIndex = 30 - depth;
	}

	return (
		<div
			className={cn(
				"relative min-w-0",
				sticky && "sticky bg-(--session-overview-surface)",
				className,
			)}
			data-trace-debug-field={`depth-${depth}-row`}
			data-trace-tree-expanded-surface={expandedStickySurface || undefined}
			data-trace-tree-row-owner
			data-trace-tree-sticky-surface={sticky || undefined}
			data-trace-tree-sticky-top={sticky ? stickyTop : undefined}
			style={style}
		>
			<ConversationTraceTreeConnector
				ancestorRails={ancestorRails}
				continues={continues}
				depth={depth}
				rowHeight={rowHeight}
				shape={connectorShape}
				sticky={sticky}
			/>
			{showsDescendantRail ? (
				<span
					aria-hidden="true"
					className="pointer-events-none absolute bottom-0 left-(--conversation-trace-tree-descend-x) -translate-x-1/2 bg-[color:var(--conversation-trace-connector-color,var(--session-overview-border))]"
					data-trace-tree-descendant-rail
					data-trace-tree-line
					style={{
						top: `${descendantTop}px`,
						width: "calc(var(--conversation-trace-connector-width, 1) * 1px)",
					}}
				/>
			) : null}
			<div
				className="min-w-0 pl-(--conversation-trace-tree-padding)"
				data-trace-tree-row-content
			>
				{children}
			</div>
		</div>
	);
}

export function ConversationTraceTreeItem({
	children,
	className,
	connectorShape = "branch",
	continues,
	continuesThroughSubtree = false,
	descends = false,
	depth,
	rowHeight = CONVERSATION_TRACE_TREE_ROW_HEIGHT,
	sticky,
	subtree,
}: {
	children: ReactNode;
	className?: string;
	connectorShape?: ConversationTraceTreeConnectorShape;
	continues: boolean;
	continuesThroughSubtree?: boolean;
	descends?: boolean;
	depth: number;
	rowHeight?: number;
	sticky?: boolean;
	subtree?: ReactNode;
}) {
	const ancestorRails = useContext(ConversationTraceTreeRailContext);
	const connectorStyle = useContext(ConversationTraceTreeConnectorStyleContext);
	const inheritedStickyOffset = useContext(
		ConversationTraceTreeStickyOffsetContext,
	);
	const [rowBody, setRowBody] = useState<TraceTreeRowBodySlot>();
	const subtreeRails = useMemo(
		() => [...ancestorRails, continues],
		[ancestorRails, continues],
	);
	const rowSticky = sticky ?? false;
	// Only rows that actually pin consume sticky space, and they consume their
	// real height — a 24px flat row must not reserve a 40px slot.
	const subtreeStickyOffset =
		inheritedStickyOffset + (rowSticky ? rowHeight : 0);
	const rowPadding = 6 + depth * CONVERSATION_TRACE_TREE_LEVEL_GAP;
	const descendantX = getConversationTraceTreeX(depth + 1, connectorStyle);
	const style: ConversationTraceTreeItemStyle = {
		"--conversation-trace-sticky-offset": `${subtreeStickyOffset}px`,
	};

	return (
		<div
			className="relative min-w-0"
			data-trace-debug-field={`depth-${depth}-container`}
			data-trace-tree-continues={continues ? "true" : "false"}
			data-trace-tree-descends={descends ? "true" : "false"}
			data-trace-tree-item-depth={depth}
			style={style}
		>
			<ConversationTraceTreeStickyOffsetContext.Provider
				value={subtreeStickyOffset}
			>
				<ConversationTraceTreeRail
					continues={continues}
					depth={depth}
					ownedByStickyConnector={rowSticky}
					rowHeight={rowHeight}
					shape={connectorShape}
				/>
				<TraceTreeRowBodySlotContext.Provider value={setRowBody}>
					<ConversationTraceTreeNode
						className={className}
						connectorShape={connectorShape}
						continues={continues}
						descends={descends}
						depth={depth}
						expanded={rowBody?.expanded === true}
						rowHeight={rowHeight}
						sticky={rowSticky}
						stickyTop={inheritedStickyOffset}
					>
						{children}
					</ConversationTraceTreeNode>
				</TraceTreeRowBodySlotContext.Provider>
				{rowBody === undefined ? null : (
					<div className="relative min-w-0 flow-root" data-trace-tree-row-body>
						<ConversationTraceTreeExpandedBodyRails
							ancestorRails={ancestorRails}
							connectorStyle={connectorStyle}
							continues={continues}
							depth={depth}
						/>
						{descends &&
						!isDottedInterfereBranchStyle(connectorStyle) &&
						subtree !== undefined ? (
							<span
								aria-hidden="true"
								className="pointer-events-none absolute inset-y-0 -translate-x-1/2 bg-[color:var(--conversation-trace-connector-color,var(--session-overview-border))]"
								data-trace-tree-line
								style={{
									left: `${descendantX}px`,
									width:
										"calc(var(--conversation-trace-connector-width, 1) * 1px)",
								}}
							/>
						) : null}
						<div className="min-w-0" style={{ paddingLeft: `${rowPadding}px` }}>
							{rowBody.content}
						</div>
					</div>
				)}
				{subtree === undefined ? null : (
					<ConversationTraceTreeRailContext.Provider value={subtreeRails}>
						{continuesThroughSubtree ? (
							<div
								className="relative min-w-0 flow-root"
								data-trace-tree-subtree-rails
							>
								<ConversationTraceTreeExpandedBodyRails
									ancestorRails={ancestorRails}
									connectorStyle={connectorStyle}
									continues={continues}
									depth={depth}
								/>
								{subtree}
							</div>
						) : (
							subtree
						)}
					</ConversationTraceTreeRailContext.Provider>
				)}
			</ConversationTraceTreeStickyOffsetContext.Provider>
		</div>
	);
}

export function ConversationTraceRootNode({
	children,
	continues,
	layout,
}: {
	children: ReactNode;
	continues: boolean;
	layout: ConversationTraceSpeakerLayout;
}) {
	return layout === "trace-tree" ? (
		<ConversationTraceTreeItem
			continues={continues}
			depth={1}
			rowHeight={CONVERSATION_TRACE_TREE_COMPACT_ROW_HEIGHT}
		>
			{children}
		</ConversationTraceTreeItem>
	) : (
		children
	);
}

// Interfere-style timeline metadata: quiet 12/16 text, tabular numerals, and
// semantic foreground hierarchy without pill surfaces or tracking changes.
const traceRequestTagClassName =
	"inline-flex min-w-0 max-w-full items-center font-sans text-[calc(var(--spacing)*3)]/[1rem] font-normal tracking-normal text-(--session-overview-subtle) tabular-nums";

const traceRequestSeparatorClassName =
	"shrink-0 font-sans text-[calc(var(--spacing)*3)]/[1rem] font-normal tracking-normal text-(--session-overview-subtle)";

type TraceRequestPresentation =
	| "header"
	| "inline"
	| "separator"
	| "context-strip";

function AgentTraceRequestUsageItems({
	agentModel,
	config,
	presentation,
	previousInputTotal,
	skills,
	usage,
}: {
	agentModel: string | undefined;
	config: TraceCallDisplayConfig;
	presentation: TraceRequestPresentation;
	previousInputTotal: number | undefined;
	skills?: readonly string[];
	usage: AgentTraceRequestUsage | undefined;
}) {
	const inputTotal = usage ? getTraceRequestInputTotal(usage) : undefined;
	const cachedShare = usage ? getTraceRequestCachedShare(usage) : undefined;
	const compact = presentation !== "header";
	const className = cn(
		traceRequestTagClassName,
		presentation !== "header" &&
			presentation !== "inline" &&
			"min-w-0 truncate",
	);
	const showModel =
		usage?.model !== undefined &&
		agentModel !== undefined &&
		usage.model !== agentModel;

	if (!usage || inputTotal === undefined) {
		return (
			<span
				className={className}
				data-trace-request-metadata
				title="No usage record found for this request"
			>
				usage not recorded
			</span>
		);
	}

	const inputLabel =
		config.inputPill === "absolute"
			? `IN ${formatTraceRequestTokens(inputTotal)} tok`
			: formatTraceCallContext(inputTotal, previousInputTotal);
	const divider = (
		<span
			aria-hidden="true"
			className={traceRequestSeparatorClassName}
			data-trace-request-separator
		>
			·
		</span>
	);

	return (
		<>
			<span
				className={className}
				data-trace-request-metadata
				title={`${inputTotal.toLocaleString()} input tokens (fresh + cache read + cache write)`}
			>
				{inputLabel}
			</span>
			{cachedShare !== undefined ? (
				<>
					{divider}
					<span
						className={className}
						data-trace-request-metadata
						title={`${usage.cacheReadInputTokens.toLocaleString()} tokens served from cache`}
					>
						{Math.round(cachedShare * 100)}%{compact ? "" : " cached"}
					</span>
				</>
			) : null}
			{divider}
			<span
				className={className}
				data-trace-request-metadata
				title={`${usage.outputTokens.toLocaleString()} output tokens`}
			>
				OUT {formatTraceRequestTokens(usage.outputTokens)}
				{compact ? "" : " tok"}
			</span>
			{showModel ? (
				<>
					{divider}
					<span
						className={cn(className, "max-w-full truncate")}
						data-trace-request-metadata
						title={`This request ran on ${usage.model}`}
					>
						{usage.model}
					</span>
				</>
			) : null}
			{(skills ?? []).map((skill) => (
				<span key={skill} className="contents">
					{divider}
					<span
						className={cn(className, "max-w-full truncate")}
						data-trace-request-metadata
						title={`This request loaded the ${skill} skill`}
					>
						✦ {skill}
					</span>
				</span>
			))}
		</>
	);
}

export function AgentTraceRequestDisplay({
	agentModel,
	collapsedPreview,
	config,
	expanded,
	index,
	presentation,
	previousInputTotal,
	skills,
	usage,
}: {
	agentModel: string | undefined;
	collapsedPreview?: ReactNode;
	config: TraceCallDisplayConfig;
	expanded?: boolean;
	index: number;
	presentation: TraceRequestPresentation;
	previousInputTotal: number | undefined;
	skills?: readonly string[];
	usage: AgentTraceRequestUsage | undefined;
}) {
	if (presentation === "inline") {
		return (
			<span
				className="ml-auto flex min-w-0 max-w-[55%] shrink-[2] items-center gap-1.5 overflow-hidden whitespace-nowrap"
				data-trace-request-metadata-group
			>
				<span
					className="shrink-0 text-(--session-overview-subtle)"
					title={`Model call ${index}`}
				>
					<TraceExchangeIcon className="size-3" />
				</span>
				<AgentTraceRequestUsageItems
					agentModel={agentModel}
					config={config}
					presentation="inline"
					previousInputTotal={previousInputTotal}
					skills={skills}
					usage={usage}
				/>
			</span>
		);
	}

	if (presentation === "separator" || presentation === "context-strip") {
		const contextStrip = presentation === "context-strip";
		return (
			<span
				className={cn(
					"flex min-w-0 items-center gap-2 px-3",
					contextStrip ? "h-6" : "min-h-10",
				)}
				title={`Model call ${index}`}
			>
				<span
					aria-hidden="true"
					className={cn(
						"h-px min-w-4 flex-1",
						contextStrip
							? "bg-(--conversation-trace-call-accent) opacity-40"
							: "bg-(--session-overview-border)",
					)}
					data-trace-tree-line
				/>
				<span
					className="flex min-w-0 shrink items-center gap-1.5 whitespace-nowrap"
					data-trace-request-metadata-group
				>
					<AgentTraceRequestUsageItems
						agentModel={agentModel}
						config={config}
						presentation={presentation}
						previousInputTotal={previousInputTotal}
						skills={skills}
						usage={usage}
					/>
				</span>
			</span>
		);
	}

	const label = config.label === "request" ? "Request" : "Model call";
	return (
		<span className={traceRowClassName}>
			{expanded === undefined ? (
				<TraceIcon icon={TraceExchangeIcon} tone="cyan" />
			) : (
				<TraceDisclosureIcon
					expanded={expanded}
					expandable
					icon={TraceExchangeIcon}
					tone="cyan"
				/>
			)}
			<span
				className={conversationTraceLabelClassName}
				data-trace-request-label
			>
				{label} {index}
			</span>
			{expanded === false ? collapsedPreview : null}
			<span
				className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5"
				data-trace-request-metadata-group
			>
				<span
					aria-hidden="true"
					className={traceRequestSeparatorClassName}
					data-trace-request-separator
				>
					·
				</span>
				<AgentTraceRequestUsageItems
					agentModel={agentModel}
					config={config}
					presentation="header"
					previousInputTotal={previousInputTotal}
					skills={skills}
					usage={usage}
				/>
			</span>
		</span>
	);
}

function AgentCollapsedTraceIcons({ events }: { events: TraceEvent[] }) {
	const steps: {
		Icon: ComponentType<{ className?: string }>;
		collapseConsecutive: boolean;
		groupKey: string;
		key: string;
		label: string;
		toolIcon: ToolIconName | undefined;
		tone: TraceIconTone;
	}[] = events.map((event, index) => {
		const presentation =
			event.kind === "tool" ? getToolPresentation(event.toolName) : undefined;
		return {
			Icon:
				event.kind === "reasoning"
					? TraceBrainIcon
					: event.kind === "message"
						? TraceMessageIcon
						: presentation
							? CONVERSATION_TOOL_ICONS[presentation.icon]
							: TraceWrenchIcon,
			collapseConsecutive:
				event.kind === "reasoning" ||
				(event.kind === "tool" &&
					(event.toolName === "Bash" || event.toolName === "exec_command")),
			groupKey: presentation ? `tool:${presentation.icon}` : event.kind,
			key: `${event.id}:${index}`,
			label:
				event.kind === "reasoning"
					? "Reasoned"
					: event.kind === "message"
						? "Responded"
						: event.kind === "orphan-result"
							? event.result.isError
								? "Tool failed"
								: "Received tool result"
							: (presentation?.verb ?? "Used a tool"),
			toolIcon: presentation?.icon,
			tone:
				event.kind === "reasoning"
					? "violet"
					: event.kind === "message"
						? "blue"
						: event.kind === "orphan-result"
							? event.result.isError
								? "tomato"
								: "cyan"
							: event.kind === "tool" && event.result?.isError
								? "tomato"
								: "amber",
		};
	});
	const clusters = steps.reduce<(typeof steps)[]>((groupedSteps, step) => {
		const previousCluster = groupedSteps.at(-1);
		if (previousCluster?.[0]?.groupKey === step.groupKey) {
			if (
				!step.collapseConsecutive ||
				!previousCluster.at(-1)?.collapseConsecutive
			) {
				previousCluster.push(step);
			}
			return groupedSteps;
		}

		groupedSteps.push([step]);
		return groupedSteps;
	}, []);
	const renderedStepCount = clusters.reduce(
		(count, cluster) => count + cluster.length,
		0,
	);
	const truncated = renderedStepCount > COLLAPSED_TRACE_ICON_LIMIT;
	const visibleStepLimit = truncated
		? COLLAPSED_TRACE_ICON_LIMIT - 1
		: COLLAPSED_TRACE_ICON_LIMIT;
	let remainingStepCount = visibleStepLimit;
	const visibleClusters = clusters.flatMap((cluster) => {
		if (remainingStepCount === 0) {
			return [];
		}
		const visibleCluster = cluster.slice(0, remainingStepCount);
		remainingStepCount -= visibleCluster.length;
		return [visibleCluster];
	});
	const remainingIconCount = renderedStepCount - visibleStepLimit;

	if (steps.length === 0) {
		return null;
	}

	return (
		<span
			aria-hidden="true"
			className="flex min-w-0 flex-1 items-center overflow-hidden pl-1"
			data-trace-collapsed-flow
			data-trace-collapsed-flow-truncated={truncated || undefined}
		>
			{visibleClusters.map((cluster, clusterIndex) => (
				<span
					key={cluster[0]?.key}
					className="flex shrink-0 items-center"
					data-trace-collapsed-flow-cluster={cluster[0]?.groupKey}
				>
					{clusterIndex === 0 ? null : (
						<span
							className="h-px w-1.5 shrink-0 bg-(--session-overview-border)"
							data-trace-collapsed-flow-connector
							data-trace-tree-line
						/>
					)}
					{cluster.map(({ Icon, key, label, tone, toolIcon }, stepIndex) => (
						<span
							key={key}
							className={cn("relative", stepIndex > 0 && "-ml-2")}
							data-trace-collapsed-flow-step
							style={{ zIndex: cluster.length - stepIndex }}
							title={label}
						>
							<TraceIcon
								className="border-(--session-overview-border) text-(--session-overview-muted)"
								icon={Icon}
								toolIcon={toolIcon}
								tone={tone}
							/>
						</span>
					))}
				</span>
			))}
			{truncated ? (
				<span
					className="flex shrink-0 items-center"
					data-trace-collapsed-flow-count-slot
				>
					<span
						className="h-px w-1.5 shrink-0 bg-(--session-overview-border)"
						data-trace-tree-line
					/>
					<span
						className="flex shrink-0 items-center justify-center font-sans text-[8px] leading-none font-medium tracking-[-0.08em] tabular-nums [text-indent:-1.5px]"
						data-trace-collapsed-flow-count
						data-trace-icon
						data-trace-icon-tone="neutral"
						style={COLLAPSED_TRACE_COUNT_STYLE}
						title={`${remainingIconCount} more activities`}
					>
						+{remainingIconCount}
					</span>
				</span>
			) : null}
		</span>
	);
}

function AgentTraceTreeBranchList({
	branches,
	depth,
	hasNextSibling,
}: {
	branches: readonly AgentTraceTreeRenderedBranch[];
	depth: number;
	hasNextSibling: boolean;
}) {
	const ancestorRails = useContext(ConversationTraceTreeRailContext);
	return (
		<ol className="list-none">
			{branches.map((branch) => {
				const branchHasNext = branch.hasFollowingBranch || hasNextSibling;
				const childRows = branch.children.map((child, childIndex) => (
					<li key={child.key}>
						<ConversationTraceTreeItem
							continues={
								branch.childStartIndex + childIndex < branch.totalChildren - 1
							}
							depth={depth + 1}
							rowHeight={CONVERSATION_TRACE_TREE_COMPACT_ROW_HEIGHT}
						>
							<div className="-ml-3">{child.row}</div>
						</ConversationTraceTreeItem>
					</li>
				));
				if (branch.hasRoot && !branch.root) {
					return (
						<ConversationTraceTreeRailContext.Provider
							key={branch.key}
							value={[...ancestorRails, branchHasNext]}
						>
							{childRows}
						</ConversationTraceTreeRailContext.Provider>
					);
				}
				if (branch.root) {
					const subtree =
						branch.totalChildren > 0 ? (
							<ol className="list-none">{childRows}</ol>
						) : undefined;
					return (
						<li key={branch.key}>
							<ConversationTraceTreeItem
								continues={branchHasNext}
								descends={branch.totalChildren > 0}
								depth={depth}
								rowHeight={CONVERSATION_TRACE_TREE_COMPACT_ROW_HEIGHT}
								sticky={branch.sticky}
								subtree={subtree}
							>
								<div className="-ml-3">{branch.root.row}</div>
							</ConversationTraceTreeItem>
						</li>
					);
				}
				return branch.children.map((child, childIndex) => (
					<li key={child.key}>
						<ConversationTraceTreeItem
							continues={
								branch.childStartIndex + childIndex <
									branch.totalChildren - 1 || branchHasNext
							}
							depth={depth}
							rowHeight={CONVERSATION_TRACE_TREE_COMPACT_ROW_HEIGHT}
						>
							<div className="-ml-3">{child.row}</div>
						</ConversationTraceTreeItem>
					</li>
				));
			})}
		</ol>
	);
}

function AgentTraceTreeRenderedSectionItem({
	defaultOpen,
	hasNextSibling,
	section,
}: {
	defaultOpen: boolean;
	hasNextSibling: boolean;
	section: AgentTraceTreeRenderedSection;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const groupStyle =
		section.groupIndex === undefined && section.groupTreatment === "none"
			? undefined
			: getTraceCallGroupStyle(section.groupIndex, section.groupTreatment);
	const hasBranches = section.branches.length > 0;
	const collapsedPreview = <AgentCollapsedTraceIcons events={section.events} />;

	if (section.header === undefined) {
		return (
			<li
				data-trace-call-index={section.groupIndex}
				data-trace-call-treatment={section.groupTreatment}
				style={groupStyle}
			>
				<AgentTraceTreeBranchList
					branches={section.branches}
					depth={section.branchDepth}
					hasNextSibling={hasNextSibling}
				/>
			</li>
		);
	}
	if (!hasBranches) {
		return (
			<li
				data-trace-call-index={section.groupIndex}
				data-trace-call-treatment={section.groupTreatment}
				style={groupStyle}
			>
				<ConversationTraceTreeItem
					continues={hasNextSibling}
					depth={2}
					rowHeight={section.flatRequestRows ? 24 : undefined}
				>
					<span className="-ml-3 block">{section.header(undefined, null)}</span>
				</ConversationTraceTreeItem>
			</li>
		);
	}
	const branchPanel = (
		<ConversationTraceCollapsiblePanel>
			<AgentTraceTreeBranchList
				branches={section.branches}
				depth={section.flatRequestRows ? 2 : 3}
				hasNextSibling={section.flatRequestRows && hasNextSibling}
			/>
		</ConversationTraceCollapsiblePanel>
	);

	return (
		<li
			data-trace-call-index={section.groupIndex}
			data-trace-call-treatment={section.groupTreatment}
			style={groupStyle}
		>
			<Collapsible.Root open={open} onOpenChange={setOpen}>
				{section.flatRequestRows ? (
					<>
						<ConversationTraceTreeItem
							connectorShape="through"
							continues={(open && hasBranches) || hasNextSibling}
							depth={2}
							rowHeight={24}
							sticky={false}
						>
							<Collapsible.Trigger
								className="group block w-full text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent)"
								data-trace-hover-row
							>
								<span className="-ml-3 block">
									{section.header(open, collapsedPreview)}
								</span>
							</Collapsible.Trigger>
						</ConversationTraceTreeItem>
						{branchPanel}
					</>
				) : (
					<ConversationTraceTreeItem
						continues={hasNextSibling}
						descends={open && hasBranches}
						depth={2}
						subtree={branchPanel}
					>
						<Collapsible.Trigger
							className="group block w-full text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent)"
							data-trace-hover-row
						>
							<span className="-ml-3 block">
								{section.header(open, collapsedPreview)}
							</span>
						</Collapsible.Trigger>
					</ConversationTraceTreeItem>
				)}
			</Collapsible.Root>
		</li>
	);
}

export function AgentTraceTreeContinuationSection({
	continuesAfter,
	defaultOpen = true,
	section,
}: {
	continuesAfter: boolean;
	defaultOpen?: boolean;
	section: AgentTraceTreeRenderedSection;
}) {
	const incomingModelRail = section.continuesFromPrevious || continuesAfter;
	return (
		<ConversationTraceTreeRailContext.Provider
			value={
				section.branchDepth === 3
					? [incomingModelRail, false]
					: [incomingModelRail]
			}
		>
			<ol className="list-none">
				<AgentTraceTreeRenderedSectionItem
					defaultOpen={defaultOpen}
					hasNextSibling={continuesAfter && !section.continuesToNext}
					section={section}
				/>
			</ol>
		</ConversationTraceTreeRailContext.Provider>
	);
}

export function AgentTraceTreeSection({
	agentLabel,
	agentModel,
	anchorId,
	continuesAfter = false,
	defaultOpen = true,
	events,
	focus,
	headerHeight,
	headerTrailing,
	planMode,
	sections,
	stickyHeader = true,
	terminal,
}: {
	agentLabel: string;
	agentModel: string | undefined;
	anchorId?: string;
	continuesAfter?: boolean;
	defaultOpen?: boolean;
	events: TraceEvent[];
	focus?: TraceFocusRequest;
	headerHeight?: number;
	headerTrailing?: ReactNode;
	planMode: boolean;
	sections: readonly AgentTraceTreeRenderedSection[];
	stickyHeader?: boolean;
	terminal?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const panelId = useId();

	useTraceFocus(anchorId, focus, setOpen);

	const visibleSections = sections.filter(
		(section) => section.header !== undefined || section.branches.length > 0,
	);
	const hasContent = visibleSections.length > 0;
	const modelHeaderData = {
		agentLabel,
		agentModel,
		continues: continuesAfter,
		planMode,
		terminal: terminal ?? !continuesAfter,
	};
	const sectionPanel = (
		<Collapsible.Panel id={panelId} className="transition-none">
			<ol className="list-none">
				{visibleSections.map((section, sectionIndex) => (
					<AgentTraceTreeRenderedSectionItem
						key={section.key}
						defaultOpen={defaultOpen}
						hasNextSibling={sectionIndex < visibleSections.length - 1}
						section={section}
					/>
				))}
			</ol>
		</Collapsible.Panel>
	);

	return (
		<Collapsible.Root open={open} onOpenChange={setOpen}>
			<div
				id={anchorId}
				className={cn(
					"min-w-0 scroll-mt-6",
					conversationTraceStickyOnlyFillClassName,
				)}
			>
				<ConversationTraceTreeItem
					continues={continuesAfter}
					descends={open && hasContent}
					depth={1}
					rowHeight={headerHeight}
					sticky={stickyHeader}
					subtree={sectionPanel}
				>
					<div
						className="flex min-h-10 min-w-0 items-center gap-2 pr-3"
						data-transcript-model-header-source="row"
						data-transcript-model-header-terminal={
							modelHeaderData.terminal || undefined
						}
						data-trace-hover-row
						style={headerHeight ? { minHeight: headerHeight } : undefined}
					>
						<Collapsible.Trigger className="group flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent)">
							<ModelSectionHeader
								collapsedContent={<AgentCollapsedTraceIcons events={events} />}
								data={modelHeaderData}
								expanded={open}
							/>
						</Collapsible.Trigger>
						{headerTrailing ? (
							<div className="ml-auto min-w-0" data-trace-model-metadata>
								{headerTrailing}
							</div>
						) : null}
					</div>
				</ConversationTraceTreeItem>
			</div>
		</Collapsible.Root>
	);
}
