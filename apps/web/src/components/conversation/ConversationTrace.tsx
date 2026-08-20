// biome-ignore-all lint/nursery/noExcessiveLinesPerFile: The shared trace entry point coordinates three render modes.
import { type ReactNode, useId, useState } from "react";
import {
	isSlashCommandMessage,
	parseSlashCommand,
} from "@/lib/parse-slash-command";
import { cn } from "@/lib/utils";
import { SignalText } from "../signal-text";
import {
	formatClockTime,
	type TraceEvent,
	type TraceItem,
	type UserContent,
	userContentText,
} from "./conversation-trace";
import {
	isTraceCallSeparator,
	type TraceCallDisplayMode,
} from "./conversation-trace-call-display";
import {
	conversationTraceSignalAwarePreviewClassName as previewClassName,
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
import type {
	AgentTraceRequestUsage,
	AgentTraceRequestUsagePlacement,
} from "./conversation-trace-requests";
import type { ConversationTraceDerivedSection } from "./conversation-trace-sections";
import { deriveConversationTraceSections } from "./conversation-trace-sections";
import { ConversationTraceTag } from "./conversation-trace-tag";
import { TraceTextCollapsedPreview } from "./conversation-trace-text-disclosure";
import { AgentToolStrip } from "./conversation-trace-tool-strip";
import {
	AgentTraceRequestDisplay,
	AgentTraceTreeContinuationSection,
	type AgentTraceTreeRenderedBranch,
	type AgentTraceTreeRenderedNode,
	type AgentTraceTreeRenderedSection,
	AgentTraceTreeSection,
	ConversationTraceRootNode,
	type ConversationTraceSpeakerLayout,
} from "./conversation-trace-tree";
import type { AgentTraceTreeBranch } from "./conversation-trace-tree-branches";
import {
	ExpandableTraceRow,
	TraceExpansionIdProvider,
	TraceExpansionStoreScope,
	type TraceFocusRequest,
	traceInteractiveRowClassName,
	traceRowClassName,
	useTraceExpansionState,
	useTraceFocus,
} from "./expandable-trace-row";
import { MessageContent } from "./MessageContent";

export type { TraceCallDisplayMode } from "./conversation-trace-call-display";
export type { ConversationTraceSpeakerLayout } from "./conversation-trace-tree";
export type ConversationTraceEventSubtreeReplacement = {
	content: ReactNode;
	kind: "replace-event";
};
export type ConversationTraceEventSubtreeRenderer = (
	event: TraceEvent,
) => ReactNode | ConversationTraceEventSubtreeReplacement | undefined;

function isEventSubtreeReplacement(
	value: ReactNode | ConversationTraceEventSubtreeReplacement | undefined,
): value is ConversationTraceEventSubtreeReplacement {
	return (
		typeof value === "object" &&
		value !== null &&
		"kind" in value &&
		value.kind === "replace-event"
	);
}

export {
	ConversationTraceCollapsiblePanel,
	ConversationTraceTreeConnectorStyleProvider,
	ConversationTraceTreeItem,
	ConversationTraceTreeNode,
} from "./conversation-trace-tree";
export type { ConversationTraceTreeConnectorStyle } from "./conversation-trace-tree-geometry";
export type { TraceFocusRequest } from "./expandable-trace-row";
export {
	createTraceExpansionStore,
	TraceExpansionNamespaceProvider,
	TraceExpansionStoreProvider,
	TraceTextDisclosureIcon,
} from "./expandable-trace-row";

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
		<TraceExpansionIdProvider key={event.id} expansionId={event.id}>
			<EventRow agentModel={agentModel} event={event} />
		</TraceExpansionIdProvider>
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

function UserTraceContent({ content }: { content: UserContent }) {
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
							<TraceTextCollapsedPreview text={item.text} />
						</span>
					}
					focus={focus}
					expansionId={item.id}
					fullPreviewText={item.text}
					label={<span className={traceLabelClassName}>Summary</span>}
					leading={<TraceIcon icon={TraceFileIcon} tone="grass" />}
					textDisclosure
					body={
						<p className="whitespace-pre-wrap text-[0.8125rem] leading-6 text-[color:var(--dashboardy-heading)]">
							<SignalText text={item.text} />
						</p>
					}
				/>
			</ConversationTraceRootNode>
		);
	}

	if (item.kind === "system") {
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
							<TraceTextCollapsedPreview text={item.text} />
						</span>
					}
					focus={focus}
					expansionId={item.id}
					fullPreviewText={item.text}
					label={<span className={traceLabelClassName}>System</span>}
					leading={<TraceIcon icon={TraceSettingsIcon} tone="neutral" />}
					timestamp={timestamp}
					textDisclosure
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

	return (
		<ConversationTraceRootNode
			continues={!isLast}
			layout={expandedSpeakerLayout}
		>
			<ExpandableTraceRow
				anchorId={anchorId}
				compact
				collapsedBody={
					previewText ? (
						<span className={previewClassName} data-trace-preview>
							<TraceTextCollapsedPreview text={previewText} />
						</span>
					) : undefined
				}
				focus={focus}
				expansionId={item.id}
				fullPreviewText={previewText}
				label={<span className={speakerLabelClassName}>{userLabel}</span>}
				leading={
					<UserTraceAvatar
						expanded={false}
						expandable={false}
						imageUrl={userImageUrl}
					/>
				}
				timestamp={timestamp}
				textDisclosure
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
	agentModel: string | undefined,
	treeBranches: readonly AgentTraceTreeBranch[],
	trailing: ReactNode | undefined,
	renderEventSubtree: ConversationTraceEventSubtreeRenderer | undefined,
): AgentTraceTreeRenderedBranch[] {
	const renderNode = (
		event: TraceEvent,
		trailingContent: ReactNode | undefined,
	): AgentTraceTreeRenderedNode => {
		const renderedSubtree = renderEventSubtree?.(event);
		if (isEventSubtreeReplacement(renderedSubtree)) {
			return {
				content: renderedSubtree.content,
				key: event.id,
				kind: "replacement",
			};
		}

		return {
			key: event.id,
			kind: "row",
			row: (
				<TraceExpansionIdProvider expansionId={event.id}>
					<EventRow
						agentModel={agentModel}
						event={event}
						trailing={trailingContent}
					/>
				</TraceExpansionIdProvider>
			),
			subtree: renderedSubtree,
		};
	};
	const renderedBranchCount = treeBranches.reduce(
		(count, branch) => count + (branch.root ? 1 : branch.children.length),
		0,
	);
	return treeBranches.map<AgentTraceTreeRenderedBranch>((branch) => ({
		childStartIndex: branch.childStartIndex,
		children: branch.children.map((event) =>
			renderNode(
				event,
				!branch.hasRoot && renderedBranchCount === 1 ? trailing : undefined,
			),
		),
		hasFollowingBranch: branch.hasFollowingBranch,
		hasRoot: branch.hasRoot,
		key: branch.id,
		root: branch.root
			? renderNode(
					branch.root,
					renderedBranchCount === 1 ? trailing : undefined,
				)
			: undefined,
		totalChildren: branch.totalChildren,
	}));
}

function toRenderedSection(input: {
	agentLabel: string;
	agentModel: string | undefined;
	focus?: TraceFocusRequest;
	renderEventSubtree: ConversationTraceEventSubtreeRenderer | undefined;
	section: ConversationTraceDerivedSection;
	userImageUrl: string | undefined;
	userLabel: string;
}): AgentTraceTreeRenderedSection {
	const {
		agentLabel,
		agentModel,
		focus,
		renderEventSubtree,
		section,
		userImageUrl,
		userLabel,
	} = input;
	if (section.kind === "agent") {
		const inlineUsage =
			section.usage && section.inlineUsage ? (
				<AgentTraceRequestDisplay
					key={`${section.key}:inline-usage`}
					agentModel={agentModel}
					config={section.config}
					index={section.groupIndex ?? 0}
					presentation="inline"
					previousInputTotal={section.previousInputTotal}
					skills={section.skills}
					usage={section.usage}
				/>
			) : undefined;
		const separator = isTraceCallSeparator(section.config);
		return {
			branchDepth: section.branchDepth,
			branches: toRenderedBranches(
				agentModel,
				section.branches,
				inlineUsage,
				renderEventSubtree,
			),
			continuesFromPrevious: section.continuesFromPrevious,
			continuesToNext: section.continuesToNext,
			events: [...section.events],
			flatRequestRows: section.config.flatRequestRows,
			groupIndex: section.groupIndex,
			groupTreatment: section.groupTreatment,
			header: section.showHeader
				? (expanded, collapsedPreview) => (
						<AgentTraceRequestDisplay
							agentModel={agentModel}
							collapsedPreview={collapsedPreview}
							config={section.config}
							expanded={expanded}
							index={section.groupIndex ?? 0}
							presentation={
								section.config.flatRequestRows
									? "context-strip"
									: separator
										? "separator"
										: "header"
							}
							previousInputTotal={section.previousInputTotal}
							skills={section.skills}
							usage={section.usage}
						/>
					)
				: undefined,
			key: section.key,
		};
	}
	return {
		branchDepth: 2,
		branches: [
			{
				childStartIndex: 0,
				children: [],
				hasFollowingBranch: false,
				hasRoot: true,
				key: section.item.id,
				root: {
					key: section.item.id,
					kind: "row",
					row: (
						<TraceRow
							agentHeaderTrailing={undefined}
							agentLabel={agentLabel}
							agentModel={agentModel}
							agentSectionMode="expanded"
							anchorId={`trace-tree-message-${section.itemIndex}`}
							expandedSpeakerLayout="inline"
							focus={focus}
							isLast={section.isLast}
							item={section.item}
							previousTimestamp={section.previousTimestamp}
							userImageUrl={userImageUrl}
							userLabel={userLabel}
						/>
					),
					subtree: undefined,
				},
				sticky: section.item.kind === "user",
				totalChildren: 0,
			},
		],
		continuesFromPrevious: false,
		continuesToNext: false,
		events: [],
		flatRequestRows: true,
		groupIndex: undefined,
		groupTreatment: "none",
		header: undefined,
		key: section.key,
	};
}

function toRenderedIntroSection(
	row: ReactNode,
	key = "agent-intro-row",
): AgentTraceTreeRenderedSection {
	return {
		branchDepth: 2,
		branches: [
			{
				childStartIndex: 0,
				children: [],
				hasFollowingBranch: false,
				hasRoot: true,
				key,
				root: {
					key,
					kind: "row",
					row,
					subtree: undefined,
				},
				totalChildren: 0,
			},
		],
		continuesFromPrevious: false,
		continuesToNext: false,
		events: [],
		flatRequestRows: true,
		groupIndex: undefined,
		groupTreatment: "none",
		header: undefined,
		key,
	};
}

export function ConversationTraceDerivedSectionRow({
	agentLabel = "Agent",
	agentModel,
	allEvents,
	continuesAfter,
	focus,
	introRow,
	isFirst,
	modelDisclosureId,
	modelExpandable = true,
	modelHeaderHeight,
	modelHeaderTrailing,
	modelHeaderTerminal,
	modelSetting,
	planMode,
	renderEventSubtree,
	section,
	stickyModelHeader = true,
	userImageUrl,
	userLabel = "User",
}: {
	agentLabel?: string;
	agentModel?: string;
	allEvents: readonly TraceEvent[];
	continuesAfter: boolean;
	focus?: TraceFocusRequest;
	introRow?: ReactNode;
	isFirst: boolean;
	modelDisclosureId?: string;
	modelExpandable?: boolean;
	modelHeaderHeight?: number;
	modelHeaderTrailing?: ReactNode;
	modelHeaderTerminal?: boolean;
	modelSetting?: string;
	planMode: boolean;
	renderEventSubtree?: ConversationTraceEventSubtreeRenderer;
	section?: ConversationTraceDerivedSection;
	stickyModelHeader?: boolean;
	userImageUrl?: string;
	userLabel?: string;
}) {
	const fallbackDisclosureId = useId();
	const { open: collapsed, setOpen: setCollapsed } = useTraceExpansionState(
		`${modelDisclosureId ?? fallbackDisclosureId}:model-collapsed`,
	);
	const modelOpen = modelExpandable
		? modelDisclosureId === undefined
			? undefined
			: !collapsed
		: true;
	const onModelOpenChange =
		!modelExpandable || modelDisclosureId === undefined
			? undefined
			: (nextOpen: boolean) => setCollapsed(!nextOpen);
	const renderedSection = section
		? toRenderedSection({
				agentLabel,
				agentModel,
				focus,
				renderEventSubtree,
				section,
				userImageUrl,
				userLabel,
			})
		: undefined;
	if (!isFirst) {
		if (modelOpen === false || !renderedSection) {
			return null;
		}
		return (
			<AgentTraceTreeContinuationSection
				continuesAfter={continuesAfter}
				section={renderedSection}
			/>
		);
	}
	const renderedSections = [
		...(introRow ? [toRenderedIntroSection(introRow, "model-intro-row")] : []),
		...(renderedSection ? [renderedSection] : []),
	];
	return (
		<ol className="grid">
			<li className="min-w-0">
				<AgentTraceTreeSection
					agentLabel={agentLabel}
					agentModel={agentModel}
					anchorId="message-0"
					continuesAfter={continuesAfter}
					defaultOpen
					events={[...allEvents]}
					expandable={modelExpandable}
					focus={focus}
					headerHeight={modelHeaderHeight}
					headerTrailing={modelHeaderTrailing}
					modelSetting={modelSetting}
					onOpenChange={onModelOpenChange}
					open={modelOpen}
					planMode={planMode}
					sections={renderedSections}
					stickyHeader={stickyModelHeader}
					terminal={modelHeaderTerminal}
				/>
			</li>
		</ol>
	);
}

function getConversationTraceModelSetting(items: readonly TraceItem[]) {
	for (const item of items) {
		if (item.kind === "agent" && item.modelSetting) {
			return item.modelSetting;
		}
	}
	return undefined;
}

function ConversationTraceTurnTree({
	agentIntroRow,
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
	renderEventSubtree,
	traceCallDisplayMode = "request",
	userImageUrl,
	userLabel,
}: {
	agentIntroRow?: ReactNode;
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
	renderEventSubtree?: ConversationTraceEventSubtreeRenderer;
	traceCallDisplayMode?: TraceCallDisplayMode;
	userImageUrl: string | undefined;
	userLabel: string;
}) {
	const modelSetting = getConversationTraceModelSetting(items);
	const derivation = deriveConversationTraceSections({
		items,
		requestUsage,
		requestUsagePlacement,
		traceCallDisplayMode,
	});
	const derivedSections =
		derivation.sections.map<AgentTraceTreeRenderedSection>((section) =>
			toRenderedSection({
				agentLabel,
				agentModel,
				focus,
				renderEventSubtree,
				section,
				userImageUrl,
				userLabel,
			}),
		);
	const introSection = agentIntroRow
		? toRenderedIntroSection(agentIntroRow)
		: undefined;
	const sections = introSection
		? [introSection, ...derivedSections]
		: derivedSections;

	return (
		<ol className={cn("grid", className)}>
			<li className="min-w-0">
				<AgentTraceTreeSection
					agentLabel={agentLabel}
					agentModel={agentModel}
					anchorId="message-0"
					continuesAfter={continuesAfter}
					defaultOpen={defaultOpen}
					events={[...derivation.events]}
					focus={focus}
					headerTrailing={agentHeaderTrailing}
					modelSetting={modelSetting}
					planMode={derivation.planMode}
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
	agentIntroRow,
	agentHeaderTrailing,
	agentSectionMode = "collapsible",
	expandedSpeakerLayout = "inline",
	focus,
	className,
	continuesAfter = false,
	defaultTraceTreeOpen = true,
	requestUsage,
	requestUsagePlacement,
	renderEventSubtree,
	traceCallDisplayMode = "request",
}: {
	items: TraceItem[];
	userLabel?: string;
	userImageUrl?: string;
	agentLabel?: string;
	agentModel?: string;
	agentIntroRow?: ReactNode;
	agentHeaderTrailing?: ReactNode;
	agentSectionMode?: "collapsible" | "expanded";
	expandedSpeakerLayout?: ConversationTraceSpeakerLayout;
	focus?: TraceFocusRequest;
	className?: string;
	continuesAfter?: boolean;
	defaultTraceTreeOpen?: boolean;
	requestUsage?: readonly AgentTraceRequestUsage[];
	requestUsagePlacement?: AgentTraceRequestUsagePlacement;
	renderEventSubtree?: ConversationTraceEventSubtreeRenderer;
	traceCallDisplayMode?: TraceCallDisplayMode;
}) {
	if (expandedSpeakerLayout === "trace-tree") {
		return (
			<TraceExpansionStoreScope>
				<ConversationTraceTurnTree
					agentIntroRow={agentIntroRow}
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
					renderEventSubtree={renderEventSubtree}
					traceCallDisplayMode={traceCallDisplayMode}
					userImageUrl={userImageUrl}
					userLabel={userLabel}
				/>
			</TraceExpansionStoreScope>
		);
	}

	let cursor: string | undefined;

	return (
		<TraceExpansionStoreScope>
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
		</TraceExpansionStoreScope>
	);
}
