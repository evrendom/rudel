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
		row: "text-muted",
		icon: "w-3.5 h-3.5 shrink-0",
		border: "border-border",
	},
	error: {
		row: "text-red-400",
		icon: "w-3.5 h-3.5 shrink-0 text-red-400",
		border: "border-red-300",
	},
	success: {
		row: "text-green-500",
		icon: "w-3.5 h-3.5 shrink-0 text-green-500",
		border: "border-green-300",
	},
} as const;

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
					"flex items-center gap-2 w-full text-left px-3 py-1.5 rounded-md hover:bg-hover transition-colors text-xs",
					styles.row,
				)}
			>
				<Icon className={styles.icon} />
				<span className="font-medium">{label}</span>
				<span className="truncate opacity-60">{summary}</span>
				<ChevronRight
					className={cn(
						"w-3 h-3 ml-auto shrink-0 transition-transform",
						open && "rotate-90",
					)}
				/>
			</button>
			{open && (
				<div className={cn("mt-1 ml-5 pl-3 border-l-2", styles.border)}>
					{children}
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

	if (entry.type === "summary") {
		return (
			<div
				id={anchorId}
				className={cn(
					"border-l-4 border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950 p-4 rounded-r scroll-mt-6",
					className,
				)}
			>
				<div className="flex items-start gap-3">
					<FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
					<div className="flex-1">
						<p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">
							Session Summary
						</p>
						<p className="text-sm text-blue-900 dark:text-blue-100 whitespace-pre-wrap leading-relaxed">
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
				<p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed font-mono py-2">
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
			<div id={anchorId} className={cn("flex gap-4 scroll-mt-6", className)}>
				<div className="flex-shrink-0">
					<div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
						<User className="w-5 h-5 text-white" />
					</div>
				</div>
				<div className="flex-1 min-w-0 bg-card border border-border rounded-lg p-4 shadow-sm">
					<div className="flex items-center gap-2 mb-3">
						<span className="text-sm font-semibold text-foreground">User</span>
						<span className="text-xs text-muted-foreground">
							{new Date(entry.timestamp).toLocaleTimeString()}
						</span>
					</div>

					{isSlashCommand && slashCommandInfo ? (
						<div className="space-y-2">
							{slashCommandInfo.commandMessage && (
								<div className="inline-block px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-md text-sm font-mono">
									{slashCommandInfo.commandMessage}
								</div>
							)}
							{slashCommandInfo.commandName && (
								<div className="text-sm text-muted-foreground">
									<span className="font-semibold">Command:</span>{" "}
									<code className="bg-muted px-2 py-0.5 rounded">
										{slashCommandInfo.commandName}
									</code>
								</div>
							)}
							{slashCommandInfo.commandArgs && (
								<div className="text-sm text-muted-foreground">
									<span className="font-semibold">Args:</span>{" "}
									<code className="bg-muted px-2 py-0.5 rounded">
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
		<div id={anchorId} className={cn("flex gap-4 scroll-mt-6", className)}>
			<div className="flex-shrink-0">
				<div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
					<Bot className="w-5 h-5 text-white" />
				</div>
			</div>
			<div className="flex-1 min-w-0 bg-card border border-border rounded-lg p-4 shadow-sm">
				<div className="flex items-center gap-2 mb-3">
					<span className="text-sm font-semibold text-foreground">
						Assistant
					</span>
					<span className="text-xs text-muted-foreground">
						{new Date(entry.timestamp).toLocaleTimeString()}
					</span>
				</div>
				<MessageContent content={entry.message.content} />
			</div>
		</div>
	);
}
