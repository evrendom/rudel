import { Brain, MessageSquare, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
	formatToolInputPreview,
	getToolPresentation,
	getToolPrimaryArg,
} from "./conversation-tools";
import {
	compactPreview,
	type TraceEvent,
	type TraceToolResult,
	toolResultText,
} from "./conversation-trace";
import {
	conversationTraceChipClassName,
	conversationTracePreviewClassName,
} from "./conversation-trace-class-names";
import { TraceDisclosureIcon } from "./conversation-trace-icons";
import { CONVERSATION_TOOL_ICONS } from "./conversation-trace-tool-icons";
import { ExpandableTraceRow } from "./expandable-trace-row";
import { MessageContent } from "./MessageContent";

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

export function ConversationTraceEventRow({
	delta,
	event,
	trailing,
}: {
	delta?: string;
	event: TraceEvent;
	trailing?: ReactNode;
}) {
	if (event.kind === "reasoning") {
		return (
			<ExpandableTraceRow
				delta={delta}
				fullPreviewText={event.text}
				trailing={trailing}
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
						<span
							className={conversationTracePreviewClassName}
							data-trace-preview
						>
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
				trailing={trailing}
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
						<span
							className={conversationTracePreviewClassName}
							data-trace-preview
						>
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
				trailing={trailing}
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
						<span
							className={conversationTracePreviewClassName}
							data-trace-preview
						>
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
			trailing={trailing}
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
						className={
							isError
								? "border-[color:var(--dashboardy-danger-foreground)] text-[color:var(--dashboardy-danger-foreground)]"
								: undefined
						}
						expanded={expanded}
						expandable={expandable}
						icon={CONVERSATION_TOOL_ICONS[icon]}
					/>
					<span className="shrink-0 font-semibold text-[color:var(--dashboardy-heading)]">
						{verb}
					</span>
					{primaryArg ? (
						<span className={conversationTraceChipClassName}>{primaryArg}</span>
					) : null}
					{inputPreview ? (
						<span
							className={cn(
								conversationTracePreviewClassName,
								"font-mono text-[0.75rem]",
							)}
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
