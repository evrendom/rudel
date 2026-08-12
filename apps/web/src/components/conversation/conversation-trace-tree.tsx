// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: Tree nodes, request disclosures, and connector geometry share one rendering contract.
import { Collapsible } from "@base-ui/react/collapsible";
import { ArrowRightLeft, Brain, MessageSquare, Wrench } from "lucide-react";
import {
	type ComponentType,
	type CSSProperties,
	type ReactNode,
	useId,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import { getToolPresentation } from "./conversation-tools";
import type { TraceEvent } from "./conversation-trace";
import {
	formatTraceCallContext,
	getTraceCallGroupStyle,
	type TraceCallDisplayConfig,
	type TraceCallGroupTreatment,
} from "./conversation-trace-call-display";
import {
	ModelTraceIcon,
	TraceDisclosureIcon,
	TraceIcon,
} from "./conversation-trace-icons";
import {
	type AgentTraceRequestUsage,
	formatTraceRequestTokens,
	getTraceRequestCachedShare,
	getTraceRequestInputTotal,
} from "./conversation-trace-requests";
import { CONVERSATION_TOOL_ICONS } from "./conversation-trace-tool-icons";
import {
	type TraceFocusRequest,
	traceRowClassName,
	useTraceFocus,
} from "./expandable-trace-row";

export type ConversationTraceSpeakerLayout =
	| "inline"
	| "table-row"
	| "trace-tree";

interface ConversationTraceTreeRowStyle extends CSSProperties {
	"--conversation-trace-tree-descend-x": string;
	"--conversation-trace-tree-padding": string;
}

export type AgentTraceTreeBranch = {
	children: TraceEvent[];
	id: string;
	root: Extract<TraceEvent, { kind: "message" | "reasoning" }> | undefined;
};

export type AgentTraceTreeRenderedBranch = {
	children: readonly { key: string; row: ReactNode }[];
	key: string;
	row: ReactNode;
};

export type AgentTraceTreeRenderedSection = {
	branches: readonly AgentTraceTreeRenderedBranch[];
	events: TraceEvent[];
	flatRequestRows: boolean;
	groupIndex: number | undefined;
	groupTreatment: TraceCallGroupTreatment;
	header:
		| ((expanded: boolean, collapsedPreview: ReactNode) => ReactNode)
		| undefined;
	headerSticky?: boolean;
	key: string;
};

const CONVERSATION_TRACE_TREE_ROW_HEIGHT = 40;
const CONVERSATION_TRACE_TREE_LEVEL_GAP = 23;
const CONVERSATION_TRACE_TREE_FIRST_X = 16;
type ConversationTraceTreeConnectorShape = "branch" | "through";

function ConversationTraceTreeConnector({
	continues,
	depth,
	rowHeight,
	shape,
}: {
	continues: boolean;
	depth: number;
	rowHeight: number;
	shape: ConversationTraceTreeConnectorShape;
}) {
	const width = 6 + depth * CONVERSATION_TRACE_TREE_LEVEL_GAP;
	const currentX =
		CONVERSATION_TRACE_TREE_FIRST_X +
		(depth - 1) * CONVERSATION_TRACE_TREE_LEVEL_GAP;
	const elbowY = rowHeight / 2;
	const ancestorXs = Array.from(
		{ length: Math.max(depth - 1, 0) },
		(_, index) =>
			CONVERSATION_TRACE_TREE_FIRST_X +
			index * CONVERSATION_TRACE_TREE_LEVEL_GAP,
	);

	return (
		<svg
			aria-hidden="true"
			className="pointer-events-none absolute top-0 left-0"
			data-trace-tree-connector={shape}
			fill="none"
			height={rowHeight}
			strokeLinecap="round"
			strokeLinejoin="round"
			viewBox={`0 0 ${width} ${rowHeight}`}
			width={width}
			style={{
				stroke:
					"var(--conversation-trace-connector-color, var(--session-overview-border))",
				strokeWidth: "var(--conversation-trace-connector-width, 1)",
			}}
		>
			{ancestorXs.map((x) => (
				<path key={x} d={`M ${x} 0 V ${rowHeight}`} />
			))}
			{shape === "through" ? (
				<path d={`M ${currentX} 0 V ${rowHeight}`} />
			) : continues ? (
				<path
					d={`M ${currentX} 0 V ${rowHeight} M ${currentX} ${elbowY - 6} Q ${currentX} ${elbowY} ${currentX + 6} ${elbowY} H ${width - 1}`}
				/>
			) : (
				<path
					d={`M ${currentX} 0 V ${elbowY - 6} Q ${currentX} ${elbowY} ${currentX + 6} ${elbowY} H ${width - 1}`}
				/>
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
	rowHeight = CONVERSATION_TRACE_TREE_ROW_HEIGHT,
	sticky: stickyOverride,
}: {
	children: ReactNode;
	className?: string;
	connectorShape?: ConversationTraceTreeConnectorShape;
	continues: boolean;
	descends?: boolean;
	depth: number;
	rowHeight?: number;
	sticky?: boolean;
}) {
	// Indentation decides stickiness: any node that opens a deeper level
	// (descends) pins one row height per ancestor level, and every node hands
	// its subtree the next slot down via the offset var — so model header,
	// request header, and a message row with indented tool children all stack
	// from the same rule.
	const sticky = stickyOverride ?? descends;
	const width = 6 + depth * CONVERSATION_TRACE_TREE_LEVEL_GAP;
	const stickyTop = (depth - 1) * CONVERSATION_TRACE_TREE_ROW_HEIGHT;
	const style: ConversationTraceTreeRowStyle & {
		"--conversation-trace-sticky-offset": string;
		top?: string;
		zIndex?: number;
	} = {
		"--conversation-trace-sticky-offset": `${stickyTop}px`,
		"--conversation-trace-tree-descend-x": `${CONVERSATION_TRACE_TREE_FIRST_X + depth * CONVERSATION_TRACE_TREE_LEVEL_GAP}px`,
		"--conversation-trace-tree-padding": `${width}px`,
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
			style={style}
		>
			<ConversationTraceTreeConnector
				continues={continues}
				depth={depth}
				rowHeight={rowHeight}
				shape={connectorShape}
			/>
			{descends ? (
				<span
					aria-hidden="true"
					className="pointer-events-none absolute top-[30px] bottom-0 left-(--conversation-trace-tree-descend-x) w-px -translate-x-1/2 bg-(--session-overview-border)"
				/>
			) : null}
			<div className="min-w-0 pl-(--conversation-trace-tree-padding)">
				{children}
			</div>
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
		<ConversationTraceTreeNode continues={continues} depth={1}>
			{children}
		</ConversationTraceTreeNode>
	) : (
		children
	);
}

export function buildAgentTraceTreeBranches(events: TraceEvent[]) {
	const branches: AgentTraceTreeBranch[] = [];
	let activeBranch: AgentTraceTreeBranch | undefined;

	for (const event of events) {
		if (event.kind === "message" || event.kind === "reasoning") {
			activeBranch = { children: [], id: event.id, root: event };
			branches.push(activeBranch);
			continue;
		}

		if (!activeBranch) {
			activeBranch = {
				children: [],
				id: `${event.id}:activity`,
				root: undefined,
			};
			branches.push(activeBranch);
		}
		activeBranch.children.push(event);
	}

	return branches;
}

// Matches the pill style of SessionTurnMetadataTags so request-level usage
// reads like the turn-level tags one tier above it.
export const traceRequestTagClassName =
	"inline-flex min-w-0 max-w-full items-center rounded-full bg-(--session-overview-hover) px-2 py-0.5 text-xs leading-4 font-medium tracking-[-0.01em] text-(--session-overview-muted)";

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
	const className =
		presentation !== "header" && presentation !== "inline"
			? "min-w-0 truncate text-[0.6875rem] leading-4 font-medium tracking-[-0.01em] text-(--session-overview-muted)"
			: traceRequestTagClassName;
	const dividerClassName =
		presentation !== "header" && presentation !== "inline"
			? "shrink-0 text-[0.6875rem] text-(--session-overview-subtle)"
			: undefined;
	const showModel =
		usage?.model !== undefined &&
		agentModel !== undefined &&
		usage.model !== agentModel;

	if (!usage || inputTotal === undefined) {
		return (
			<span
				className={className}
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
	const divider = dividerClassName ? (
		<span aria-hidden="true" className={dividerClassName}>
			·
		</span>
	) : null;

	return (
		<>
			<span
				className={className}
				title={`${inputTotal.toLocaleString()} input tokens (fresh + cache read + cache write)`}
			>
				{inputLabel}
			</span>
			{cachedShare !== undefined ? (
				<>
					{divider}
					<span
						className={className}
						title={`${usage.cacheReadInputTokens.toLocaleString()} tokens served from cache`}
					>
						{Math.round(cachedShare * 100)}%{compact ? "" : " cached"}
					</span>
				</>
			) : null}
			{divider}
			<span
				className={className}
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
			<span className="ml-auto flex min-w-0 max-w-[55%] shrink-[2] items-center gap-1 overflow-hidden whitespace-nowrap">
				<span
					className={cn(traceRequestTagClassName, "shrink-0 px-1.5")}
					title={`Model call ${index}`}
				>
					<ArrowRightLeft aria-hidden="true" className="size-3" />
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
					contextStrip
						? "h-6 bg-[color:var(--conversation-trace-row-surface,var(--session-overview-surface))]"
						: "min-h-10",
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
				/>
				<span className="flex min-w-0 shrink items-center gap-1 whitespace-nowrap">
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
		<span className={cn(traceRowClassName, "hover:bg-transparent")}>
			{expanded === undefined ? (
				<TraceIcon icon={ArrowRightLeft} />
			) : (
				<TraceDisclosureIcon
					expanded={expanded}
					expandable
					icon={ArrowRightLeft}
				/>
			)}
			<span className="shrink-0 font-semibold text-[color:var(--dashboardy-heading)]">
				{label} {index}
			</span>
			{expanded === false ? collapsedPreview : null}
			<span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
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
	const seenKinds = new Set<string>();
	const icons: { Icon: ComponentType<{ className?: string }>; key: string }[] =
		[];

	for (const event of events) {
		const presentation =
			event.kind === "tool" ? getToolPresentation(event.toolName) : undefined;
		const key = presentation ? `tool:${presentation.icon}` : event.kind;
		if (seenKinds.has(key)) {
			continue;
		}

		seenKinds.add(key);
		icons.push({
			Icon:
				event.kind === "reasoning"
					? Brain
					: event.kind === "message"
						? MessageSquare
						: presentation
							? CONVERSATION_TOOL_ICONS[presentation.icon]
							: Wrench,
			key,
		});
		if (icons.length === 4) {
			break;
		}
	}
	if (icons.length === 0) {
		return null;
	}

	return (
		<span className="flex shrink-0 items-center pl-1">
			{icons.map(({ Icon, key }, index) => (
				<span
					key={key}
					className="relative -ml-1.5"
					style={{ zIndex: icons.length - index }}
				>
					<TraceIcon
						className="border-(--session-overview-border) bg-(--session-overview-surface) text-(--session-overview-muted) shadow-[0_0_0_1px_var(--session-overview-surface)]"
						icon={Icon}
					/>
				</span>
			))}
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
	return (
		<ol className="list-none">
			{branches.map((branch, branchIndex) => {
				const branchHasNext =
					branchIndex < branches.length - 1 || hasNextSibling;
				return (
					<li key={branch.key}>
						<ConversationTraceTreeNode
							continues={branch.children.length > 0 || branchHasNext}
							descends={branch.children.length > 0}
							depth={depth}
						>
							<div className="-ml-3">{branch.row}</div>
						</ConversationTraceTreeNode>
						{branch.children.length > 0 ? (
							<ol className="list-none">
								{branch.children.map((child, childIndex) => (
									<li key={child.key}>
										<ConversationTraceTreeNode
											continues={childIndex < branch.children.length - 1}
											depth={depth + 1}
										>
											<div className="-ml-3">{child.row}</div>
										</ConversationTraceTreeNode>
									</li>
								))}
							</ol>
						) : null}
					</li>
				);
			})}
		</ol>
	);
}

function AgentTraceTreeRenderedSectionItem({
	hasNextSibling,
	section,
}: {
	hasNextSibling: boolean;
	section: AgentTraceTreeRenderedSection;
}) {
	const [open, setOpen] = useState(true);
	const groupStyle = getTraceCallGroupStyle(
		section.groupIndex,
		section.groupTreatment,
	);
	const hasBranches = section.branches.length > 0;
	const collapsedPreview = <AgentCollapsedTraceIcons events={section.events} />;
	const className = cn(
		section.groupTreatment === "fill" &&
			"bg-[color:var(--conversation-trace-row-surface)]",
	);

	if (section.header === undefined) {
		return (
			<li
				className={className}
				data-trace-call-index={section.groupIndex}
				data-trace-call-treatment={section.groupTreatment}
				style={groupStyle}
			>
				<AgentTraceTreeBranchList
					branches={section.branches}
					depth={2}
					hasNextSibling={hasNextSibling}
				/>
			</li>
		);
	}

	return (
		<li
			className={className}
			data-trace-call-index={section.groupIndex}
			data-trace-call-treatment={section.groupTreatment}
			style={groupStyle}
		>
			<Collapsible.Root open={open} onOpenChange={setOpen}>
				{section.flatRequestRows ? (
					<ConversationTraceTreeNode
						connectorShape="through"
						continues={(open && hasBranches) || hasNextSibling}
						depth={2}
						rowHeight={24}
						sticky={false}
					>
						<Collapsible.Trigger className="group block w-full text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent)">
							<span className="-ml-3 block">
								{section.header(open, collapsedPreview)}
							</span>
						</Collapsible.Trigger>
					</ConversationTraceTreeNode>
				) : (
					<ConversationTraceTreeNode
						continues={(open && hasBranches) || hasNextSibling}
						descends={open && hasBranches}
						depth={2}
						sticky={section.headerSticky}
					>
						<Collapsible.Trigger className="group block w-full text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent)">
							<span className="-ml-3 block">
								{section.header(open, collapsedPreview)}
							</span>
						</Collapsible.Trigger>
					</ConversationTraceTreeNode>
				)}
				<Collapsible.Panel className="transition-none">
					<AgentTraceTreeBranchList
						branches={section.branches}
						depth={section.flatRequestRows ? 2 : 3}
						hasNextSibling={section.flatRequestRows && hasNextSibling}
					/>
				</Collapsible.Panel>
			</Collapsible.Root>
		</li>
	);
}

export function AgentTraceTreeSection({
	agentLabel,
	agentModel,
	anchorId,
	events,
	focus,
	headerTrailing,
	sections,
}: {
	agentLabel: string;
	agentModel: string | undefined;
	anchorId?: string;
	events: TraceEvent[];
	focus?: TraceFocusRequest;
	headerTrailing?: ReactNode;
	sections: readonly AgentTraceTreeRenderedSection[];
}) {
	const [open, setOpen] = useState(true);
	const panelId = useId();

	useTraceFocus(anchorId, focus, setOpen);

	const hasContent = sections.some(
		(section) => section.header !== undefined || section.branches.length > 0,
	);

	return (
		<Collapsible.Root open={open} onOpenChange={setOpen}>
			<div
				id={anchorId}
				className="min-w-0 scroll-mt-6 bg-(--session-overview-surface)"
			>
				<ConversationTraceTreeNode
					continues={open && hasContent}
					descends={open && hasContent}
					depth={1}
				>
					<div className="flex min-h-10 min-w-0 items-center gap-2 pr-3">
						<Collapsible.Trigger className="group flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--session-overview-accent)">
							<ModelTraceIcon expanded={open} model={agentModel} />
							<p className="min-w-0 truncate text-xs font-medium text-(--session-overview-text)">
								{agentLabel}
							</p>
							{open ? null : <AgentCollapsedTraceIcons events={events} />}
						</Collapsible.Trigger>
						{headerTrailing ? (
							<div className="ml-auto min-w-0">{headerTrailing}</div>
						) : null}
					</div>
				</ConversationTraceTreeNode>
				<Collapsible.Panel id={panelId} className="transition-none">
					<ol className="list-none">
						{sections.map((section, sectionIndex) => (
							<AgentTraceTreeRenderedSectionItem
								key={section.key}
								hasNextSibling={sectionIndex < sections.length - 1}
								section={section}
							/>
						))}
					</ol>
				</Collapsible.Panel>
			</div>
		</Collapsible.Root>
	);
}
