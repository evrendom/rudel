import {
	Bot,
	Brain,
	FileText,
	Globe,
	List,
	MessageSquare,
	Pencil,
	Search,
	Settings,
	Sparkles,
	Terminal,
	Wrench,
} from "lucide-react";
import { type ComponentType, useId, useState } from "react";
import {
	isSlashCommandMessage,
	parseSlashCommand,
} from "@/lib/parse-slash-command";
import { cn } from "@/lib/utils";
import {
	formatToolInputPreview,
	getToolPresentation,
	getToolPrimaryArg,
	type ToolIconName,
} from "./conversation-tools";
import {
	compactPreview,
	formatClockTime,
	formatTimeDelta,
	type TraceEvent,
	type TraceItem,
	type TraceToolResult,
	toolResultText,
	type UserContent,
	userContentText,
} from "./conversation-trace";
import {
	ModelTraceIcon,
	TraceDisclosureIcon,
	TraceIcon,
	UserTraceAvatar,
} from "./conversation-trace-icons";
import {
	ExpandableTraceRow,
	type TraceFocusRequest,
	traceRowClassName,
	useTraceFocus,
} from "./expandable-trace-row";
import { MessageContent } from "./MessageContent";

export type { TraceFocusRequest } from "./expandable-trace-row";

const TOOL_ICONS: Record<
	ToolIconName,
	ComponentType<{ className?: string }>
> = {
	file: FileText,
	pencil: Pencil,
	terminal: Terminal,
	search: Search,
	bot: Bot,
	globe: Globe,
	sparkle: Sparkles,
	list: List,
	wrench: Wrench,
};

const chipClassName =
	"inline-flex max-w-[18rem] shrink-0 items-center truncate rounded-[0.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] px-1.5 py-0.5 font-mono text-[0.75rem] text-[color:var(--dashboardy-heading)]";

const previewClassName =
	"min-w-0 flex-1 truncate text-[color:var(--dashboardy-muted)] group-aria-expanded:invisible";

const speakerLabelClassName =
	"shrink-0 [font-family:var(--app-font-heading)] text-[0.8125rem]/[1.125rem] font-bold text-[color:var(--dashboardy-heading)]";

function ToolResultBody({ result }: { result: TraceToolResult }) {
	const text = toolResultText(result.content);

	return (
		<div className="grid gap-1.5">
			<p
				className={cn(
					"text-[0.75rem] font-semibold uppercase tracking-[0.04em]",
					result.isError
						? "text-[color:var(--dashboardy-danger-foreground)]"
						: "text-[color:var(--dashboardy-muted)]",
				)}
			>
				{result.isError ? "Error result" : "Result"}
			</p>
			{text ? (
				<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.75rem] leading-5 text-[color:var(--dashboardy-heading)]">
					{text}
				</pre>
			) : (
				<p className="text-[0.75rem] text-[color:var(--dashboardy-muted)]">
					No output
				</p>
			)}
		</div>
	);
}

function EventRow({ event, delta }: { event: TraceEvent; delta?: string }) {
	if (event.kind === "reasoning") {
		return (
			<ExpandableTraceRow
				delta={delta}
				fullPreviewText={event.text}
				body={
					<p className="whitespace-pre-wrap text-[0.8125rem] leading-6 text-[color:var(--dashboardy-heading)]">
						{event.text}
					</p>
				}
			>
				{(expanded, expandable) => (
					<>
						<TraceDisclosureIcon
							expanded={expanded}
							expandable={expandable}
							icon={Brain}
						/>
						<span className="shrink-0 font-semibold text-[color:var(--dashboardy-heading)]">
							Reasoning
						</span>
						<span className={previewClassName} data-trace-preview>
							{compactPreview(event.text)}
						</span>
					</>
				)}
			</ExpandableTraceRow>
		);
	}

	if (event.kind === "message") {
		return (
			<ExpandableTraceRow
				delta={delta}
				fullPreviewText={event.text || undefined}
				body={<MessageContent content={event.content} />}
			>
				{(expanded, expandable) => (
					<>
						<TraceDisclosureIcon
							expanded={expanded}
							expandable={expandable}
							icon={MessageSquare}
						/>
						<span className="shrink-0 font-semibold text-[color:var(--dashboardy-heading)]">
							Message:
						</span>
						<span className={previewClassName} data-trace-preview>
							{compactPreview(event.text)}
						</span>
					</>
				)}
			</ExpandableTraceRow>
		);
	}

	if (event.kind === "orphan-result") {
		const resultText = toolResultText(event.result.content);
		return (
			<ExpandableTraceRow
				delta={delta}
				fullPreviewText={resultText}
				body={<ToolResultBody result={event.result} />}
				className={
					event.result.isError
						? "bg-[color:var(--dashboardy-danger-surface)]"
						: undefined
				}
			>
				{(expanded, expandable) => (
					<>
						<TraceDisclosureIcon
							expanded={expanded}
							expandable={expandable}
							icon={Wrench}
						/>
						<span className="shrink-0 font-semibold text-[color:var(--dashboardy-heading)]">
							Result
						</span>
						<span className={previewClassName} data-trace-preview>
							{compactPreview(resultText)}
						</span>
					</>
				)}
			</ExpandableTraceRow>
		);
	}

	const { verb, icon } = getToolPresentation(event.toolName);
	const primaryArg = getToolPrimaryArg(event.toolName, event.input);
	const inputPreview = formatToolInputPreview(event.input);
	const isError = event.result?.isError === true;

	return (
		<ExpandableTraceRow
			delta={delta}
			fullPreviewText={undefined}
			className={
				isError ? "bg-[color:var(--dashboardy-danger-surface)]" : undefined
			}
			body={
				event.result ? (
					<ToolResultBody result={event.result} />
				) : (
					<p className="text-[0.75rem] text-[color:var(--dashboardy-muted)]">
						No result recorded for this call.
					</p>
				)
			}
		>
			{(expanded, expandable) => (
				<>
					<TraceDisclosureIcon
						icon={TOOL_ICONS[icon]}
						expanded={expanded}
						expandable={expandable}
						className={
							isError
								? "border-[color:var(--dashboardy-danger-foreground)] text-[color:var(--dashboardy-danger-foreground)]"
								: undefined
						}
					/>
					<span className="shrink-0 font-semibold text-[color:var(--dashboardy-heading)]">
						{verb}
					</span>
					{primaryArg ? (
						<span className={chipClassName}>{primaryArg}</span>
					) : null}
					{inputPreview ? (
						<span
							className={cn(previewClassName, "font-mono text-[0.75rem]")}
							data-trace-preview
						>
							{inputPreview}
						</span>
					) : (
						<span className="min-w-0 flex-1" />
					)}
				</>
			)}
		</ExpandableTraceRow>
	);
}

/** Collapsed agent turns advertise which tools ran so the trace stays scannable. */
function AgentToolStrip({ events }: { events: TraceEvent[] }) {
	// Keyed by event id, since the same tool usually runs several times a turn.
	const tools: { id: string; icon: ToolIconName }[] = [];

	for (const event of events) {
		if (event.kind === "tool") {
			tools.push({
				id: event.id,
				icon: getToolPresentation(event.toolName).icon,
			});
		}
	}

	if (tools.length === 0) {
		return null;
	}

	return (
		<span className="flex min-w-0 items-center gap-1">
			{tools.slice(0, 8).map((tool) => (
				<TraceIcon key={tool.id} icon={TOOL_ICONS[tool.icon]} />
			))}
			{tools.length > 8 ? (
				<span className="text-[0.75rem] text-[color:var(--dashboardy-muted)]">
					+{tools.length - 8}
				</span>
			) : null}
		</span>
	);
}

function AgentSection({
	events,
	anchorId,
	previousTimestamp,
	agentLabel,
	agentModel,
	focus,
}: {
	events: TraceEvent[];
	anchorId?: string;
	previousTimestamp: string | undefined;
	agentLabel: string;
	agentModel: string | undefined;
	focus?: TraceFocusRequest;
}) {
	const [open, setOpen] = useState(false);
	const panelId = useId();

	useTraceFocus(anchorId, focus, setOpen);
	// The turn is the model's, so it wears the model's mark; unrecognized
	// vendors fall back to the generic agent glyph.
	let cursor = previousTimestamp;

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
						"sticky top-0 z-20 bg-[color:var(--dashboardy-surface-opaque)]",
				)}
			>
				<button
					type="button"
					onClick={() => setOpen(!open)}
					aria-expanded={open}
					aria-controls={panelId}
					className={cn(
						traceRowClassName,
						"group gap-2",
						open &&
							"rounded-t-[0.75rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface-opaque)] [border-bottom-color:var(--dashboardy-divider)]",
					)}
				>
					<ModelTraceIcon expanded={open} model={agentModel} />
					<span className={speakerLabelClassName}>{agentLabel}</span>
					{!open ? <AgentToolStrip events={events} /> : null}
					<span className="min-w-0 flex-1" />
				</button>
			</div>
			{open ? (
				<div
					id={panelId}
					className="grid divide-y divide-[color:var(--dashboardy-divider)] rounded-b-[0.75rem] border-x border-b border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] [--conversation-trace-sticky-offset:2.375rem]"
				>
					{events.map((event) => {
						const delta = formatTimeDelta(cursor, event.timestamp);
						cursor = event.timestamp;

						return <EventRow key={event.id} event={event} delta={delta} />;
					})}
				</div>
			) : null}
		</div>
	);
}

function UserRowBody({ content }: { content: UserContent }) {
	const isSlashCommand =
		typeof content === "string" && isSlashCommandMessage(content);
	const slashCommandInfo = isSlashCommand ? parseSlashCommand(content) : null;

	if (slashCommandInfo) {
		return (
			<div className="grid gap-2">
				<div className="flex flex-wrap gap-2">
					{slashCommandInfo.commandName ? (
						<span className={chipClassName}>
							{slashCommandInfo.commandName}
						</span>
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
	focus?: TraceFocusRequest;
}) {
	// Wall-clock times bookend the trace so its start and end are readable at a
	// glance; every row between them reads better as a gap from the one before.
	const delta =
		previousTimestamp === undefined || isLast
			? formatClockTime(item.timestamp)
			: formatTimeDelta(previousTimestamp, item.timestamp);

	if (item.kind === "agent") {
		return (
			<AgentSection
				events={item.events}
				anchorId={anchorId}
				previousTimestamp={previousTimestamp ?? item.timestamp}
				agentLabel={agentLabel}
				agentModel={agentModel}
				focus={focus}
			/>
		);
	}

	if (item.kind === "summary") {
		return (
			<ExpandableTraceRow
				anchorId={anchorId}
				focus={focus}
				fullPreviewText={item.text}
				body={
					<p className="whitespace-pre-wrap text-[0.8125rem] leading-6 text-[color:var(--dashboardy-heading)]">
						{item.text}
					</p>
				}
			>
				{(expanded, expandable) => (
					<>
						<TraceDisclosureIcon
							expanded={expanded}
							expandable={expandable}
							icon={FileText}
						/>
						<span className="shrink-0 font-semibold text-[color:var(--dashboardy-heading)]">
							Summary
						</span>
						<span className={previewClassName} data-trace-preview>
							{compactPreview(item.text)}
						</span>
					</>
				)}
			</ExpandableTraceRow>
		);
	}

	if (item.kind === "system") {
		return (
			<ExpandableTraceRow
				anchorId={anchorId}
				delta={delta}
				focus={focus}
				fullPreviewText={item.text}
				body={
					<p className="whitespace-pre-wrap font-mono text-[0.8125rem] leading-6 text-[color:var(--dashboardy-heading)]">
						{item.text}
					</p>
				}
			>
				{(expanded, expandable) => (
					<>
						<TraceDisclosureIcon
							expanded={expanded}
							expandable={expandable}
							icon={Settings}
						/>
						<span className="shrink-0 font-semibold text-[color:var(--dashboardy-heading)]">
							System
						</span>
						<span className={previewClassName} data-trace-preview>
							{compactPreview(item.text)}
						</span>
					</>
				)}
			</ExpandableTraceRow>
		);
	}

	const previewText = userContentText(item.content);

	return (
		<ExpandableTraceRow
			anchorId={anchorId}
			delta={delta}
			focus={focus}
			fullPreviewText={previewText || undefined}
			className="overflow-clip rounded-[0.75rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]"
			body={<UserRowBody content={item.content} />}
		>
			{(expanded, expandable) => (
				<>
					<UserTraceAvatar
						expanded={expanded}
						expandable={expandable}
						imageUrl={userImageUrl}
					/>
					<span className={speakerLabelClassName}>{userLabel}</span>
					<span className={previewClassName} data-trace-preview>
						{compactPreview(previewText)}
					</span>
				</>
			)}
		</ExpandableTraceRow>
	);
}

export function ConversationTrace({
	items,
	userLabel = "User",
	userImageUrl,
	agentLabel = "Agent",
	agentModel,
	focus,
	className,
}: {
	items: TraceItem[];
	userLabel?: string;
	userImageUrl?: string;
	agentLabel?: string;
	agentModel?: string;
	focus?: TraceFocusRequest;
	className?: string;
}) {
	let cursor: string | undefined;

	return (
		<ol
			className={cn(
				"grid gap-1.5 [--conversation-trace-sticky-offset:0rem]",
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
							focus={focus}
						/>
					</li>
				);
			})}
		</ol>
	);
}
