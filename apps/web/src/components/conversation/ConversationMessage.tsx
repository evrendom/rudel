import {
	Bot,
	ChevronRight,
	FileText,
	Settings,
	User,
	Wrench,
} from "lucide-react";
import { useState } from "react";
import type {
	Conversation,
	ToolResultContent,
} from "@/lib/conversation-schema";
import {
	isSlashCommandMessage,
	parseSlashCommand,
} from "@/lib/parse-slash-command";
import { cn } from "@/lib/utils";
import { MessageContent } from "./MessageContent";

interface ConversationMessageProps {
	entry: Conversation;
	messageIndex?: number;
	className?: string;
}

const variantStyles = {
	default: {
		shell:
			"border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)]",
		icon: "size-3.5 shrink-0 text-[color:var(--dashboardy-muted)]",
		summary: "text-[color:var(--dashboardy-muted)]",
		panelBorder: "border-[color:var(--dashboardy-divider)]",
	},
	error: {
		shell:
			"border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-danger-surface)]",
		icon:
			"size-3.5 shrink-0 text-[color:var(--dashboardy-danger-foreground)]",
		summary: "text-[color:var(--dashboardy-danger-foreground)]",
		panelBorder: "border-[color:var(--dashboardy-border)]",
	},
	success: {
		shell:
			"border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-success-surface)]",
		icon:
			"size-3.5 shrink-0 text-[color:var(--dashboardy-success-foreground)]",
		summary: "text-[color:var(--dashboardy-success-foreground)]",
		panelBorder: "border-[color:var(--dashboardy-border)]",
	},
} as const;

function formatMessageTime(timestamp: string): string {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return "Unknown time";
	}

	return date.toLocaleTimeString([], {
		hour: "numeric",
		minute: "2-digit",
	});
}

function CollapsedEntry({
	icon: Icon,
	label,
	summary,
	children,
	anchorId,
	className,
	variant = "default",
}: {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	summary: string;
	children: React.ReactNode;
	anchorId?: string;
	className?: string;
	variant?: "default" | "error" | "success";
}) {
	const [open, setOpen] = useState(false);
	const styles = variantStyles[variant];

	return (
		<div id={anchorId} className={cn("scroll-mt-6", className)}>
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className={cn(
					"w-full rounded-[1rem] border px-4 py-3 text-left transition-colors hover:bg-[color:var(--dashboardy-subsurface-strong)]",
					styles.shell,
				)}
			>
				<div className="flex min-w-0 flex-1 items-center gap-3">
					<div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]">
						<Icon className={styles.icon} />
					</div>
					<div className="grid min-w-0 gap-0.5">
						<p className="text-sm font-semibold text-[color:var(--dashboardy-heading)]">
							{label}
						</p>
						<p className={cn("truncate text-sm", styles.summary)}>{summary}</p>
					</div>
				</div>
				<ChevronRight
					className={cn(
						"ml-3 size-4 shrink-0 text-[color:var(--dashboardy-muted)] transition-transform",
						open && "rotate-90",
					)}
				/>
			</button>
			{open && (
				<div
					className={cn(
						"mt-3 ml-4 border-l pl-4",
						styles.panelBorder,
					)}
				>
					<div className="grid gap-3">{children}</div>
				</div>
			)}
		</div>
	);
}

function contentSummary(content: unknown): string {
	if (typeof content === "string") {
		return content.slice(0, 100);
	}

	if (Array.isArray(content)) {
		const first = content[0];
		if (typeof first === "object" && first) {
			if (first.type === "tool_result") {
				const text =
					typeof first.content === "string"
						? first.content
						: JSON.stringify(first.content);
				return `tool_result: ${text.slice(0, 80)}`;
			}
			if (first.type === "text" && "text" in first) {
				return String(first.text).slice(0, 100);
			}
		}
	}

	return "";
}

export function ConversationMessage({
	entry,
	messageIndex,
	className,
}: ConversationMessageProps) {
	const anchorId =
		messageIndex !== undefined ? `message-${messageIndex}` : undefined;
	const messageLabel =
		messageIndex !== undefined ? `#${messageIndex + 1}` : undefined;

	if (entry.type === "summary") {
		return (
			<div
				id={anchorId}
				className={cn(
					"scroll-mt-6 rounded-[1.1rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-4 py-4",
					className,
				)}
			>
				<div className="flex items-start gap-3">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]">
						<FileText className="size-4 text-[color:var(--dashboardy-muted)]" />
					</div>
					<div className="flex-1">
						<div className="mb-2 flex flex-wrap items-center gap-2">
							<div className="dashboardy-inline-badge rounded-full border px-3 py-1">
								<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-heading)]">
									Session summary
								</p>
							</div>
							{messageLabel ? (
								<p className="font-mono text-[0.8125rem] text-[color:var(--dashboardy-muted)]">
									{messageLabel}
								</p>
							) : null}
						</div>
						<p className="mt-2 text-base leading-7 text-[color:var(--dashboardy-heading)] whitespace-pre-wrap">
							{entry.summary}
						</p>
					</div>
				</div>
			</div>
		);
	}

	if (entry.type === "system") {
		return (
			<CollapsedEntry
				icon={Settings}
				label="System"
				summary={entry.message.content.slice(0, 100)}
				anchorId={anchorId}
				className={className}
			>
				<p className="font-mono text-[0.875rem] leading-6 text-[color:var(--dashboardy-heading)] whitespace-pre-wrap">
					{entry.message.content}
				</p>
			</CollapsedEntry>
		);
	}

	if (entry.type === "user") {
		const { content } = entry.message;

		if (Array.isArray(content)) {
			const toolResults = content.filter(
				(item): item is ToolResultContent =>
					typeof item === "object" &&
					item !== null &&
					item.type === "tool_result",
			);
			if (toolResults.length === content.length && content.length > 0) {
				return (
					<CollapsedEntry
						icon={Wrench}
						label={`Tool Results (${content.length})`}
						summary={contentSummary(content)}
						variant={
							toolResults.some((item) => item.is_error) ? "error" : "success"
						}
						anchorId={anchorId}
						className={className}
					>
						<div className="py-2">
							<MessageContent content={content} />
						</div>
					</CollapsedEntry>
				);
			}
		}

		const isSlashCommand =
			typeof content === "string" && isSlashCommandMessage(content);
		const slashCommandInfo = isSlashCommand ? parseSlashCommand(content) : null;

		return (
			<div
				id={anchorId}
				className={cn(
					"grid gap-3 scroll-mt-6 md:grid-cols-[auto_minmax(0,1fr)] md:gap-4",
					className,
				)}
			>
				<div className="flex items-center gap-3 md:w-[4.5rem] md:flex-col md:items-start md:gap-2">
					<div className="flex size-9 shrink-0 items-center justify-center rounded-[1rem] border border-[color:var(--dashboardy-chip-border)] bg-[color:var(--dashboardy-chip-surface)]">
						<User className="size-4 text-[color:var(--dashboardy-chip-foreground)]" />
					</div>
					{messageLabel ? (
						<p className="font-mono text-[0.75rem] text-[color:var(--dashboardy-muted)]">
							{messageLabel}
						</p>
					) : null}
				</div>
				<div className="min-w-0 rounded-[1.15rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] px-4 py-4">
					<div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[color:var(--dashboardy-divider)] pb-3">
						<div className="dashboardy-inline-badge rounded-full border px-3 py-1">
							<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-heading)]">
								User
							</p>
						</div>
						<p className="text-[0.8125rem] text-[color:var(--dashboardy-muted)]">
							{formatMessageTime(entry.timestamp)}
						</p>
					</div>

					{isSlashCommand && slashCommandInfo ? (
						<div className="grid gap-3">
							{slashCommandInfo.commandMessage && (
								<div className="dashboardy-inline-badge w-fit rounded-full border px-3 py-1.5">
									<p className="font-mono text-[0.875rem] text-[color:var(--dashboardy-heading)]">
										{slashCommandInfo.commandMessage}
									</p>
								</div>
							)}
							{slashCommandInfo.commandName && (
								<div className="grid gap-1">
									<p className="text-sm font-medium text-[color:var(--dashboardy-muted)]">
										Command
									</p>
									<code className="w-fit rounded-full border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] px-3 py-1 font-mono text-[0.875rem] text-[color:var(--dashboardy-heading)]">
										{slashCommandInfo.commandName}
									</code>
								</div>
							)}
							{slashCommandInfo.commandArgs && (
								<div className="grid gap-1">
									<p className="text-sm font-medium text-[color:var(--dashboardy-muted)]">
										Args
									</p>
									<code className="w-fit rounded-full border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] px-3 py-1 font-mono text-[0.875rem] text-[color:var(--dashboardy-heading)]">
										{slashCommandInfo.commandArgs}
									</code>
								</div>
							)}
						</div>
					) : (
						<MessageContent content={content} />
					)}
				</div>
			</div>
		);
	}

	return (
		<div
			id={anchorId}
			className={cn(
				"grid gap-3 scroll-mt-6 md:grid-cols-[auto_minmax(0,1fr)] md:gap-4",
				className,
			)}
		>
			<div className="flex items-center gap-3 md:w-[4.5rem] md:flex-col md:items-start md:gap-2">
				<div className="flex size-9 shrink-0 items-center justify-center rounded-[1rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]">
					<Bot className="size-4 text-[color:var(--dashboardy-heading)]" />
				</div>
				{messageLabel ? (
					<p className="font-mono text-[0.75rem] text-[color:var(--dashboardy-muted)]">
						{messageLabel}
					</p>
				) : null}
			</div>
			<div className="min-w-0 rounded-[1.15rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] px-4 py-4">
				<div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[color:var(--dashboardy-divider)] pb-3">
					<div className="dashboardy-inline-badge rounded-full border px-3 py-1">
						<p className="text-[0.8125rem] font-medium text-[color:var(--dashboardy-heading)]">
							Assistant
						</p>
					</div>
					<p className="text-[0.8125rem] text-[color:var(--dashboardy-muted)]">
						{formatMessageTime(entry.timestamp)}
					</p>
				</div>
				<MessageContent content={entry.message.content} />
			</div>
		</div>
	);
}
