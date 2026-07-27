import {
	Bot,
	Brain,
	ChevronDown,
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
import {
	type ComponentType,
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	useId,
	useState,
} from "react";
import { getModelIconComponent } from "@/features/dashboard/components/DashboardModelBadges";
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
import { MessageContent } from "./MessageContent";

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

const rowClassName =
	"flex w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left text-[0.8125rem] transition-colors hover:bg-[color:var(--dashboardy-subsurface-strong)] focus-visible:outline-none focus-visible:bg-[color:var(--dashboardy-subsurface-strong)]";

const iconShellClassName =
	"flex size-5 shrink-0 items-center justify-center rounded-[0.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] text-[color:var(--dashboardy-muted)]";

const chipClassName =
	"inline-flex max-w-[18rem] shrink-0 items-center truncate rounded-[0.4rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] px-1.5 py-0.5 font-mono text-[0.75rem] text-[color:var(--dashboardy-heading)]";

const previewClassName =
	"min-w-0 flex-1 truncate text-[color:var(--dashboardy-muted)]";

const deltaClassName =
	"shrink-0 tabular-nums text-[0.75rem] text-[color:var(--dashboardy-muted)]";

const expandedBodyClassName =
	"border-t border-[color:var(--dashboardy-divider)] bg-[color:var(--dashboardy-surface)] px-3 py-3";

/**
 * A request to reveal one row. The id repeats on every click of the same chip,
 * so it carries a counter to make each request distinct.
 */
export type TraceFocusRequest = { anchorId: string; requestId: number };

/**
 * Opens the targeted row — including a collapsed agent turn hiding it — as soon
 * as a jump names it. Derived during render rather than in an effect, so the
 * caller can flush the open state and scroll to the row in one go.
 */
function useTraceFocus(
	anchorId: string | undefined,
	focus: TraceFocusRequest | undefined,
	setOpen: Dispatch<SetStateAction<boolean>>,
) {
	const requestId =
		anchorId !== undefined && focus?.anchorId === anchorId
			? focus.requestId
			: undefined;
	const [handledRequestId, setHandledRequestId] = useState<number>();

	if (requestId !== undefined && requestId !== handledRequestId) {
		setHandledRequestId(requestId);
		setOpen(true);
	}
}

function TraceIcon({
	icon: Icon,
	className,
}: {
	icon: ComponentType<{ className?: string }>;
	className?: string;
}) {
	return (
		<span className={cn(iconShellClassName, className)}>
			<Icon className="size-3" />
		</span>
	);
}

/**
 * One slim row that can open to reveal its full body. Rows without a body stay
 * inert so a click does not produce an empty panel.
 */
function ExpandableRow({
	children,
	body,
	delta,
	className,
	anchorId,
	focus,
}: {
	children: ReactNode;
	body?: ReactNode;
	delta?: string;
	className?: string;
	anchorId?: string;
	focus?: TraceFocusRequest;
}) {
	const [open, setOpen] = useState(false);
	const panelId = useId();
	const hasBody = body !== undefined && body !== null;

	useTraceFocus(anchorId, focus, setOpen);

	return (
		<div id={anchorId} className={cn("min-w-0 scroll-mt-6", className)}>
			{hasBody ? (
				<button
					type="button"
					onClick={() => setOpen(!open)}
					aria-expanded={open}
					aria-controls={panelId}
					className={rowClassName}
				>
					{children}
					{delta ? <span className={deltaClassName}>{delta}</span> : null}
				</button>
			) : (
				<div className={cn(rowClassName, "hover:bg-transparent")}>
					{children}
					{delta ? <span className={deltaClassName}>{delta}</span> : null}
				</div>
			)}
			{hasBody && open ? (
				<div id={panelId} className={expandedBodyClassName}>
					{body}
				</div>
			) : null}
		</div>
	);
}

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
			<ExpandableRow
				delta={delta}
				body={
					<p className="whitespace-pre-wrap text-[0.8125rem] leading-6 text-[color:var(--dashboardy-heading)]">
						{event.text}
					</p>
				}
			>
				<TraceIcon icon={Brain} />
				<span className="shrink-0 font-semibold text-[color:var(--dashboardy-heading)]">
					Reasoning
				</span>
				<span className={previewClassName}>{compactPreview(event.text)}</span>
			</ExpandableRow>
		);
	}

	if (event.kind === "message") {
		return (
			<ExpandableRow
				delta={delta}
				body={<MessageContent content={event.content} />}
			>
				<TraceIcon icon={MessageSquare} />
				<span className="shrink-0 font-semibold text-[color:var(--dashboardy-heading)]">
					Message:
				</span>
				<span className={previewClassName}>{compactPreview(event.text)}</span>
			</ExpandableRow>
		);
	}

	if (event.kind === "orphan-result") {
		return (
			<ExpandableRow
				delta={delta}
				body={<ToolResultBody result={event.result} />}
				className={
					event.result.isError
						? "bg-[color:var(--dashboardy-danger-surface)]"
						: undefined
				}
			>
				<TraceIcon icon={Wrench} />
				<span className="shrink-0 font-semibold text-[color:var(--dashboardy-heading)]">
					Result
				</span>
				<span className={previewClassName}>
					{compactPreview(toolResultText(event.result.content))}
				</span>
			</ExpandableRow>
		);
	}

	const { verb, icon } = getToolPresentation(event.toolName);
	const primaryArg = getToolPrimaryArg(event.toolName, event.input);
	const inputPreview = formatToolInputPreview(event.input);
	const isError = event.result?.isError === true;

	return (
		<ExpandableRow
			delta={delta}
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
			<TraceIcon
				icon={TOOL_ICONS[icon]}
				className={
					isError
						? "border-[color:var(--dashboardy-danger-foreground)] text-[color:var(--dashboardy-danger-foreground)]"
						: undefined
				}
			/>
			<span className="shrink-0 font-semibold text-[color:var(--dashboardy-heading)]">
				{verb}
			</span>
			{primaryArg ? <span className={chipClassName}>{primaryArg}</span> : null}
			{inputPreview ? (
				<span className={cn(previewClassName, "font-mono text-[0.75rem]")}>
					{inputPreview}
				</span>
			) : (
				<span className="min-w-0 flex-1" />
			)}
		</ExpandableRow>
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
	const ModelIcon = getModelIconComponent(agentModel) ?? Bot;
	let cursor = previousTimestamp;

	return (
		<div
			id={anchorId}
			className="min-w-0 scroll-mt-6 overflow-hidden rounded-[0.75rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)]"
		>
			<button
				type="button"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
				aria-controls={panelId}
				className={cn(rowClassName, "gap-2")}
			>
				<ChevronDown
					className={cn(
						"size-3.5 shrink-0 text-[color:var(--dashboardy-muted)] transition-transform",
						!open && "-rotate-90",
					)}
				/>
				<TraceIcon icon={ModelIcon} />
				<span className="shrink-0 font-semibold text-[color:var(--dashboardy-heading)]">
					{agentLabel}
				</span>
				{!open ? <AgentToolStrip events={events} /> : null}
				<span className="min-w-0 flex-1" />
			</button>
			{open ? (
				<div
					id={panelId}
					className="grid divide-y divide-[color:var(--dashboardy-divider)] border-t border-[color:var(--dashboardy-divider)] bg-[color:var(--dashboardy-surface)]"
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
	agentLabel,
	agentModel,
	focus,
}: {
	item: TraceItem;
	anchorId?: string;
	previousTimestamp: string | undefined;
	isLast: boolean;
	userLabel: string;
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
			<ExpandableRow
				anchorId={anchorId}
				focus={focus}
				body={
					<p className="whitespace-pre-wrap text-[0.8125rem] leading-6 text-[color:var(--dashboardy-heading)]">
						{item.text}
					</p>
				}
			>
				<TraceIcon icon={FileText} />
				<span className="shrink-0 font-semibold text-[color:var(--dashboardy-heading)]">
					Summary
				</span>
				<span className={previewClassName}>{compactPreview(item.text)}</span>
			</ExpandableRow>
		);
	}

	if (item.kind === "system") {
		return (
			<ExpandableRow
				anchorId={anchorId}
				delta={delta}
				focus={focus}
				body={
					<p className="whitespace-pre-wrap font-mono text-[0.8125rem] leading-6 text-[color:var(--dashboardy-heading)]">
						{item.text}
					</p>
				}
			>
				<TraceIcon icon={Settings} />
				<span className="shrink-0 font-semibold text-[color:var(--dashboardy-heading)]">
					System
				</span>
				<span className={previewClassName}>{compactPreview(item.text)}</span>
			</ExpandableRow>
		);
	}

	const previewText = userContentText(item.content);

	return (
		<ExpandableRow
			anchorId={anchorId}
			delta={delta}
			focus={focus}
			className="rounded-[0.75rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]"
			body={<UserRowBody content={item.content} />}
		>
			<TraceIcon icon={MessageSquare} />
			<span className="shrink-0 font-semibold text-[color:var(--dashboardy-heading)]">
				{userLabel}:
			</span>
			<span className={previewClassName}>{compactPreview(previewText)}</span>
		</ExpandableRow>
	);
}

export function ConversationTrace({
	items,
	userLabel = "User",
	agentLabel = "Agent",
	agentModel,
	focus,
	className,
}: {
	items: TraceItem[];
	userLabel?: string;
	agentLabel?: string;
	agentModel?: string;
	focus?: TraceFocusRequest;
	className?: string;
}) {
	let cursor: string | undefined;

	return (
		<ol className={cn("grid gap-1.5", className)}>
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
