// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: The shared trace entry point coordinates three render modes.
import { type ReactNode, useId, useState } from "react";
import {
	isSlashCommandMessage,
	parseSlashCommand,
} from "@/lib/parse-slash-command";
import { cn } from "@/lib/utils";
import {
	compactPreview,
	formatClockTime,
	type TraceEvent,
	type TraceItem,
	type UserContent,
	userContentText,
} from "./conversation-trace";
import {
	getTraceCallDisplayConfig,
	isTraceCallSeparator,
	shouldCollapseTraceCall,
	shouldRenderTraceCallHeader,
	type TraceCallDisplayMode,
} from "./conversation-trace-call-display";
import {
	conversationTraceProsePreviewClassName as previewClassName,
	conversationTraceLabelClassName as traceLabelClassName,
} from "./conversation-trace-class-names";
import { ConversationTraceEventRow as EventRow } from "./conversation-trace-event-row";
import {
	TraceFileIcon,
	TraceSettingsIcon,
} from "./conversation-trace-hugeicons";
import {
	ModelTraceIcon,
	TraceIcon,
	UserTraceAvatar,
} from "./conversation-trace-icons";
import { ConversationTracePlanTag } from "./conversation-trace-plan-tag";
import {
	type AgentTraceRequestUsage,
	type AgentTraceRequestUsagePlacement,
	getTraceRequestInputTotal,
	getTraceRequestSkills,
	groupTraceEventsIntoRequests,
	takeTraceRequestUsageBefore,
} from "./conversation-trace-requests";
import { ConversationTraceTag } from "./conversation-trace-tag";
import { AgentToolStrip } from "./conversation-trace-tool-strip";
import {
	AgentTraceRequestDisplay,
	type AgentTraceTreeRenderedBranch,
	type AgentTraceTreeRenderedSection,
	AgentTraceTreeSection,
	ConversationTraceRootNode,
	type ConversationTraceSpeakerLayout,
} from "./conversation-trace-tree";
import { buildAgentTraceTreeBranches } from "./conversation-trace-tree-branches";
import {
	ExpandableTraceRow,
	type TraceFocusRequest,
	traceInteractiveRowClassName,
	traceRowClassName,
	useTraceFocus,
} from "./expandable-trace-row";
import { MessageContent } from "./MessageContent";

export type { TraceCallDisplayMode } from "./conversation-trace-call-display";
export type { ConversationTraceSpeakerLayout } from "./conversation-trace-tree";
export {
	ConversationTraceCollapsiblePanel,
	ConversationTraceTreeConnectorStyleProvider,
	ConversationTraceTreeItem,
	ConversationTraceTreeNode,
} from "./conversation-trace-tree";
export type { ConversationTraceTreeConnectorStyle } from "./conversation-trace-tree-geometry";
export type { TraceFocusRequest } from "./expandable-trace-row";

const speakerLabelClassName =
	"shrink-0 [font-family:var(--app-font-heading)] text-[0.8125rem]/[1.125rem] font-bold text-[color:var(--dashboardy-heading)]";

function AgentSection({
	events,
	anchorId,
	agentLabel,
	agentModel,
	headerTrailing,
	planMode,
	expandedSpeakerLayout,
	mode,
	focus,
}: {
	events: TraceEvent[];
	anchorId?: string;
	agentLabel: string;
	agentModel: string | undefined;
	headerTrailing?: ReactNode;
	planMode: boolean;
	expandedSpeakerLayout: ConversationTraceSpeakerLayout;
	mode: "collapsible" | "expanded";
	focus?: TraceFocusRequest;
}) {
	const [open, setOpen] = useState(false);
	const panelId = useId();

	useTraceFocus(anchorId, focus, setOpen);
	// The turn is the model's, so it wears the model's mark; unrecognized
	// vendors fall back to the generic agent glyph.
	const eventRows = events.map((event) => (
		<EventRow key={event.id} event={event} />
	));

	if (mode === "expanded") {
		if (expandedSpeakerLayout === "table-row") {
			return (
				<div
					id={anchorId}
					className="min-w-0 scroll-mt-6 border-b border-(--session-overview-border) bg-(--session-overview-surface) [--conversation-trace-sticky-offset:2.25rem]"
				>
					<div className="sticky top-0 z-30 flex min-h-9 min-w-0 items-center gap-2 border-b border-(--session-overview-border) bg-(--session-overview-surface) px-3 py-2">
						<ModelTraceIcon
							expanded={false}
							expandable={false}
							model={agentModel}
						/>
						<p className="min-w-0 truncate text-xs font-medium text-(--session-overview-muted)">
							{agentLabel}
						</p>
						{planMode ? <ConversationTracePlanTag /> : null}
						{headerTrailing ? (
							<div className="ml-auto min-w-0">{headerTrailing}</div>
						) : null}
					</div>
					<div className="grid min-w-0 divide-y divide-[color:var(--dashboardy-divider)] pl-7">
						{eventRows}
					</div>
				</div>
			);
		}

		return (
			<div
				id={anchorId}
				className="flex min-w-0 scroll-mt-6 items-start gap-2 [--conversation-trace-sticky-offset:0rem]"
			>
				<ModelTraceIcon
					expanded={false}
					expandable={false}
					model={agentModel}
				/>
				<div className="grid min-w-0 flex-1 gap-2">
					<div className="flex min-w-0 items-center gap-1.5">
						<p className="min-w-0 truncate text-xs font-medium text-[color:var(--dashboardy-muted)]">
							{agentLabel}
						</p>
						{planMode ? <ConversationTracePlanTag /> : null}
					</div>
					<div className="grid divide-y divide-[color:var(--dashboardy-divider)] border-t border-[color:var(--dashboardy-divider)]">
						{eventRows}
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			id={anchorId}
			className={cn(
				"isolate min-w-0 scroll-mt-6 overflow-clip rounded-[0.75rem]",
				open
					? "bg-transparent"
					: "border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)]",
			)}
		>
			<div
				className={cn(
					open &&
						"sticky top-0 z-30 bg-[color:var(--dashboardy-surface-opaque)]",
				)}
			>
				<button
					type="button"
					onClick={() => setOpen(!open)}
					aria-expanded={open}
					aria-controls={panelId}
					className={cn(
						traceRowClassName,
						traceInteractiveRowClassName,
						"group gap-2",
						open &&
							"rounded-t-[0.75rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface-opaque)] [border-bottom-color:var(--dashboardy-divider)]",
					)}
				>
					<ModelTraceIcon expanded={open} model={agentModel} />
					<span className={speakerLabelClassName}>{agentLabel}</span>
					{planMode ? <ConversationTracePlanTag /> : null}
					{!open ? <AgentToolStrip events={events} /> : null}
					<span className="min-w-0 flex-1" />
				</button>
			</div>
			{open ? (
				<div
					id={panelId}
					className="grid divide-y divide-[color:var(--dashboardy-divider)] rounded-b-[0.75rem] border-x border-b border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] [--conversation-trace-sticky-offset:2.375rem]"
				>
					{eventRows}
				</div>
			) : null}
		</div>
	);
}

export function UserTraceContent({ content }: { content: UserContent }) {
	const isSlashCommand =
		typeof content === "string" && isSlashCommandMessage(content);
	const slashCommandInfo = isSlashCommand ? parseSlashCommand(content) : null;

	if (slashCommandInfo) {
		return (
			<div className="grid gap-2">
				<div className="flex flex-wrap gap-2">
					{slashCommandInfo.commandName ? (
						<ConversationTraceTag
							className="max-w-[18rem] shrink-0"
							toolIcon="terminal"
							value={slashCommandInfo.commandName}
						>
							<span className="truncate">{slashCommandInfo.commandName}</span>
						</ConversationTraceTag>
					) : null}
				</div>
				{slashCommandInfo.commandArgs ? (
					<p className="whitespace-pre-wrap break-words font-mono text-[0.8125rem] leading-6 text-[color:var(--dashboardy-heading)]">
						{slashCommandInfo.commandArgs}
					</p>
				) : null}
			</div>
		);
	}

	return <MessageContent content={content} />;
}

function TraceRow({
	item,
	anchorId,
	previousTimestamp,
	isLast,
	userLabel,
	userImageUrl,
	agentLabel,
	agentModel,
	agentHeaderTrailing,
	agentSectionMode,
	expandedSpeakerLayout,
	focus,
}: {
	item: TraceItem;
	anchorId?: string;
	previousTimestamp: string | undefined;
	isLast: boolean;
	userLabel: string;
	userImageUrl: string | undefined;
	agentLabel: string;
	agentModel: string | undefined;
	agentHeaderTrailing?: ReactNode;
	agentSectionMode: "collapsible" | "expanded";
	expandedSpeakerLayout: ConversationTraceSpeakerLayout;
	focus?: TraceFocusRequest;
}) {
	// Wall-clock times bookend the trace without adding relative-time labels to
	// the rows between them.
	const timestamp =
		previousTimestamp === undefined || isLast
			? formatClockTime(item.timestamp)
			: undefined;

	if (item.kind === "agent") {
		return (
			<AgentSection
				events={item.events}
				anchorId={anchorId}
				agentLabel={agentLabel}
				agentModel={agentModel}
				headerTrailing={agentHeaderTrailing}
				planMode={item.executionMode === "plan"}
				expandedSpeakerLayout={expandedSpeakerLayout}
				mode={agentSectionMode}
				focus={focus}
			/>
		);
	}

	if (item.kind === "summary") {
		const collapsedPreviewText = compactPreview(
			item.text,
			Number.POSITIVE_INFINITY,
		);
		return (
			<ConversationTraceRootNode
				continues={!isLast}
				layout={expandedSpeakerLayout}
			>
				<ExpandableTraceRow
					anchorId={anchorId}
					compact
					collapsedBody={
						<span className={previewClassName} data-trace-preview>
							{collapsedPreviewText}
						</span>
					}
					focus={focus}
					fullPreviewText={item.text}
					label={<span className={traceLabelClassName}>Summary</span>}
					leading={<TraceIcon icon={TraceFileIcon} tone="grass" />}
					body={
						<p className="whitespace-pre-wrap text-[0.8125rem] leading-6 text-[color:var(--dashboardy-heading)]">
							{item.text}
						</p>
					}
				/>
			</ConversationTraceRootNode>
		);
	}

	if (item.kind === "system") {
		const collapsedPreviewText = compactPreview(
			item.text,
			Number.POSITIVE_INFINITY,
		);
		return (
			<ConversationTraceRootNode
				continues={!isLast}
				layout={expandedSpeakerLayout}
			>
				<ExpandableTraceRow
					anchorId={anchorId}
					compact
					collapsedBody={
						<span className={previewClassName} data-trace-preview>
							{collapsedPreviewText}
						</span>
					}
					focus={focus}
					fullPreviewText={item.text}
					label={<span className={traceLabelClassName}>System</span>}
					leading={<TraceIcon icon={TraceSettingsIcon} tone="neutral" />}
					timestamp={timestamp}
					body={
						<p className="whitespace-pre-wrap font-mono text-[0.8125rem] leading-6 text-[color:var(--dashboardy-heading)]">
							{item.text}
						</p>
					}
				/>
			</ConversationTraceRootNode>
		);
	}

	const previewText = userContentText(item.content);
	const collapsedPreviewText = compactPreview(
		previewText,
		Number.POSITIVE_INFINITY,
	);

	return (
		<ConversationTraceRootNode
			continues={!isLast}
			layout={expandedSpeakerLayout}
		>
			<ExpandableTraceRow
				anchorId={anchorId}
				compact
				collapsedBody={
					collapsedPreviewText ? (
						<span className={previewClassName} data-trace-preview>
							{collapsedPreviewText}
						</span>
					) : undefined
				}
				focus={focus}
				fullPreviewText={undefined}
				label={<span className={speakerLabelClassName}>{userLabel}</span>}
				leading={
					<UserTraceAvatar
						expanded={false}
						expandable={false}
						imageUrl={userImageUrl}
					/>
				}
				timestamp={timestamp}
				className={cn(
					expandedSpeakerLayout !== "trace-tree" &&
						"overflow-clip rounded-[0.75rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]",
				)}
				body={<UserTraceContent content={item.content} />}
			/>
		</ConversationTraceRootNode>
	);
}

function toRenderedBranches(
	treeBranches: ReturnType<typeof buildAgentTraceTreeBranches>,
	trailing: ReactNode | undefined,
): AgentTraceTreeRenderedBranch[] {
	const renderedBranchCount = treeBranches.reduce(
		(count, branch) => count + (branch.root ? 1 : branch.children.length),
		0,
	);
	return treeBranches.flatMap<AgentTraceTreeRenderedBranch>((branch) =>
		branch.root
			? [
					{
						children: branch.children.map((event) => ({
							key: event.id,
							row: <EventRow event={event} />,
						})),
						key: branch.id,
						row: (
							<EventRow
								event={branch.root}
								trailing={renderedBranchCount === 1 ? trailing : undefined}
							/>
						),
					},
				]
			: branch.children.map((event) => ({
					children: [],
					key: event.id,
					row: (
						<EventRow
							event={event}
							trailing={renderedBranchCount === 1 ? trailing : undefined}
						/>
					),
				})),
	);
}

function ConversationTraceTurnTree({
	agentHeaderTrailing,
	agentLabel,
	agentModel,
	className,
	continuesAfter,
	defaultOpen,
	focus,
	items,
	requestUsage,
	requestUsagePlacement = "start",
	traceCallDisplayMode = "request",
	userImageUrl,
	userLabel,
}: {
	agentHeaderTrailing?: ReactNode;
	agentLabel: string;
	agentModel: string | undefined;
	className?: string;
	continuesAfter: boolean;
	defaultOpen: boolean;
	focus?: TraceFocusRequest;
	items: TraceItem[];
	requestUsage?: readonly AgentTraceRequestUsage[];
	requestUsagePlacement?: AgentTraceRequestUsagePlacement;
	traceCallDisplayMode?: TraceCallDisplayMode;
	userImageUrl: string | undefined;
	userLabel: string;
}) {
	const sections: AgentTraceTreeRenderedSection[] = [];
	const events: TraceEvent[] = [];
	const traceCallConfig = getTraceCallDisplayConfig(traceCallDisplayMode);
	// Subagent usage events are appended after the main transcript's, so the
	// pool is not globally time-ordered until sorted here.
	const usageQueue = [
		...(traceCallConfig.header === "none" ? [] : (requestUsage ?? [])),
	].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
	let cursor: string | undefined;
	let pendingAgentEvents: TraceEvent[] = [];
	let previousRequestInputTotal: number | undefined;
	let requestIndex = 0;
	const planMode = items.some(
		(item) => item.kind === "agent" && item.executionMode === "plan",
	);

	// Flushes accumulated agent events as one section per API request. Each
	// flush claims only the usage recorded before the interrupting row's
	// timestamp — later requests' usage stays queued for later flushes.
	// Without any usage, a single headerless section reproduces the flat tree.
	const flushAgentSections = (cutoffTimestamp: string | undefined) => {
		if (pendingAgentEvents.length === 0) {
			return;
		}
		const batchUsage = takeTraceRequestUsageBefore(usageQueue, cutoffTimestamp);
		for (const group of groupTraceEventsIntoRequests(
			pendingAgentEvents,
			batchUsage,
			requestUsagePlacement,
		)) {
			if (group.usage) {
				requestIndex += 1;
			}
			const currentRequestIndex = requestIndex;
			const inputTotal = group.usage
				? getTraceRequestInputTotal(group.usage)
				: undefined;
			const previousInputTotalForCall = previousRequestInputTotal;
			if (inputTotal !== undefined) {
				previousRequestInputTotal = inputTotal;
			}
			const treeBranches = buildAgentTraceTreeBranches(group.events);
			const branchCount = treeBranches.reduce(
				(count, branch) => count + (branch.root ? 1 : branch.children.length),
				0,
			);
			const skills = getTraceRequestSkills(group.events);
			const collapse = shouldCollapseTraceCall(traceCallConfig, branchCount);
			const inlineUsage =
				group.usage && collapse ? (
					<AgentTraceRequestDisplay
						agentModel={agentModel}
						config={traceCallConfig}
						index={currentRequestIndex}
						presentation="inline"
						previousInputTotal={previousInputTotalForCall}
						skills={skills}
						usage={group.usage}
					/>
				) : undefined;
			const showHeader =
				group.usage !== undefined &&
				shouldRenderTraceCallHeader(traceCallConfig, branchCount);
			const separator = isTraceCallSeparator(traceCallConfig);
			sections.push({
				branches: toRenderedBranches(treeBranches, inlineUsage),
				events: group.events,
				flatRequestRows: traceCallConfig.flatRequestRows,
				groupIndex: group.usage ? currentRequestIndex : undefined,
				groupTreatment: group.usage ? traceCallConfig.groupTreatment : "none",
				header: showHeader
					? (expanded, collapsedPreview) => (
							<AgentTraceRequestDisplay
								agentModel={agentModel}
								collapsedPreview={collapsedPreview}
								config={traceCallConfig}
								expanded={expanded}
								index={currentRequestIndex}
								presentation={
									traceCallConfig.flatRequestRows
										? "context-strip"
										: separator
											? "separator"
											: "header"
								}
								previousInputTotal={previousInputTotalForCall}
								skills={skills}
								usage={group.usage}
							/>
						)
					: undefined,
				key: group.usage
					? `request-${currentRequestIndex}`
					: `activity-${sections.length}`,
			});
		}
		pendingAgentEvents = [];
	};

	items.forEach((item, index) => {
		const previousTimestamp = cursor;

		if (item.kind === "agent") {
			cursor =
				item.events.at(-1)?.timestamp ?? previousTimestamp ?? item.timestamp;
			events.push(...item.events);
			pendingAgentEvents.push(...item.events);
			return;
		}

		flushAgentSections(item.timestamp);
		if (item.timestamp) {
			cursor = item.timestamp;
		}
		sections.push({
			branches: [
				{
					children: [],
					key: item.id,
					row: (
						<TraceRow
							agentHeaderTrailing={undefined}
							agentLabel={agentLabel}
							agentModel={agentModel}
							agentSectionMode="expanded"
							anchorId={`trace-tree-message-${index}`}
							expandedSpeakerLayout="inline"
							focus={focus}
							isLast={index === items.length - 1}
							item={item}
							previousTimestamp={previousTimestamp}
							userImageUrl={userImageUrl}
							userLabel={userLabel}
						/>
					),
					sticky: item.kind === "user",
				},
			],
			events: [],
			flatRequestRows: true,
			groupIndex: undefined,
			groupTreatment: "none",
			header: undefined,
			key: item.id,
		});
	});
	flushAgentSections(undefined);

	return (
		<ol className={cn("grid", className)}>
			<li className="min-w-0">
				<AgentTraceTreeSection
					agentLabel={agentLabel}
					agentModel={agentModel}
					anchorId="message-0"
					continuesAfter={continuesAfter}
					defaultOpen={defaultOpen}
					events={events}
					focus={focus}
					headerTrailing={agentHeaderTrailing}
					planMode={planMode}
					sections={sections}
				/>
			</li>
		</ol>
	);
}

export function ConversationTrace({
	items,
	userLabel = "User",
	userImageUrl,
	agentLabel = "Agent",
	agentModel,
	agentHeaderTrailing,
	agentSectionMode = "collapsible",
	expandedSpeakerLayout = "inline",
	focus,
	className,
	continuesAfter = false,
	defaultTraceTreeOpen = true,
	requestUsage,
	requestUsagePlacement,
	traceCallDisplayMode = "request",
}: {
	items: TraceItem[];
	userLabel?: string;
	userImageUrl?: string;
	agentLabel?: string;
	agentModel?: string;
	agentHeaderTrailing?: ReactNode;
	agentSectionMode?: "collapsible" | "expanded";
	expandedSpeakerLayout?: ConversationTraceSpeakerLayout;
	focus?: TraceFocusRequest;
	className?: string;
	continuesAfter?: boolean;
	defaultTraceTreeOpen?: boolean;
	requestUsage?: readonly AgentTraceRequestUsage[];
	requestUsagePlacement?: AgentTraceRequestUsagePlacement;
	traceCallDisplayMode?: TraceCallDisplayMode;
}) {
	if (expandedSpeakerLayout === "trace-tree") {
		return (
			<ConversationTraceTurnTree
				agentHeaderTrailing={agentHeaderTrailing}
				agentLabel={agentLabel}
				agentModel={agentModel}
				className={className}
				continuesAfter={continuesAfter}
				defaultOpen={defaultTraceTreeOpen}
				focus={focus}
				items={items}
				requestUsage={requestUsage}
				requestUsagePlacement={requestUsagePlacement}
				traceCallDisplayMode={traceCallDisplayMode}
				userImageUrl={userImageUrl}
				userLabel={userLabel}
			/>
		);
	}

	let cursor: string | undefined;

	return (
		<ol
			className={cn(
				"grid [--conversation-trace-sticky-offset:0rem]",
				expandedSpeakerLayout === "table-row" ? "gap-0" : "gap-1.5",
				className,
			)}
		>
			{items.map((item, index) => {
				const previousTimestamp = cursor;

				if (item.timestamp) {
					cursor =
						item.kind === "agent"
							? (item.events.at(-1)?.timestamp ?? item.timestamp)
							: item.timestamp;
				}

				return (
					<li key={item.id} className="min-w-0">
						<TraceRow
							item={item}
							anchorId={`message-${index}`}
							previousTimestamp={previousTimestamp}
							isLast={index === items.length - 1}
							userLabel={userLabel}
							userImageUrl={userImageUrl}
							agentLabel={agentLabel}
							agentModel={agentModel}
							agentHeaderTrailing={agentHeaderTrailing}
							agentSectionMode={agentSectionMode}
							expandedSpeakerLayout={expandedSpeakerLayout}
							focus={focus}
						/>
					</li>
				);
			})}
		</ol>
	);
}
