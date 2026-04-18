import {
	ChevronRight,
	FileText,
	Settings,
	Wrench,
} from "lucide-react";
import { type ComponentType, type ReactNode, useId, useState } from "react";
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
	userLabel?: string;
}

type MessageSide = "left" | "right" | "full";

const frameStyles = {
	assistant: {
		card: "border-[color:color-mix(in_srgb,var(--dashboardy-border)_86%,white)] bg-[color:color-mix(in_srgb,var(--dashboardy-surface)_94%,white)]",
		bubble: "rounded-[1.5rem] rounded-bl-[0.55rem]",
		icon: "border-[color:color-mix(in_srgb,var(--dashboardy-border)_82%,white)] bg-[color:color-mix(in_srgb,var(--dashboardy-subsurface)_70%,white)] text-[color:var(--dashboardy-heading)]",
	},
	user: {
		card: "border-[color:color-mix(in_srgb,var(--dashboardy-chip-border)_78%,white)] bg-[color:color-mix(in_srgb,var(--dashboardy-chip-surface)_52%,white)]",
		bubble: "rounded-[1.5rem] rounded-br-[0.55rem]",
		icon: "border-[color:color-mix(in_srgb,var(--dashboardy-chip-border)_78%,white)] bg-[color:color-mix(in_srgb,var(--dashboardy-chip-surface)_88%,white)] text-[color:var(--dashboardy-chip-foreground)]",
	},
	summary: {
		card: "border-[color:var(--dashboardy-border)] bg-[color:color-mix(in_srgb,var(--dashboardy-subsurface)_84%,white)]",
		bubble: "rounded-[1.2rem]",
		icon: "border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-subsurface)] text-[color:var(--dashboardy-muted)]",
	},
} as const;

const collapsedVariantStyles = {
	default: {
		card: "border-[color:var(--dashboardy-border)] bg-[color:color-mix(in_srgb,var(--dashboardy-subsurface)_84%,white)]",
		bubble: "rounded-[1.2rem]",
		iconShell:
			"border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]",
		icon: "text-[color:var(--dashboardy-muted)]",
		summary: "text-[color:var(--dashboardy-muted)]",
		button:
			"hover:bg-[color:var(--dashboardy-subsurface-strong)] focus-visible:bg-[color:var(--dashboardy-subsurface-strong)]",
		panelBorder: "border-[color:var(--dashboardy-divider)]",
	},
	error: {
		card: "border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-danger-surface)]",
		bubble: "rounded-[1.35rem] rounded-br-[0.45rem]",
		iconShell:
			"border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]",
		icon: "text-[color:var(--dashboardy-danger-foreground)]",
		summary: "text-[color:var(--dashboardy-danger-foreground)]",
		button:
			"hover:bg-[color:color-mix(in_srgb,var(--dashboardy-danger-surface)_82%,white)] focus-visible:bg-[color:color-mix(in_srgb,var(--dashboardy-danger-surface)_82%,white)]",
		panelBorder: "border-[color:var(--dashboardy-border)]",
	},
	success: {
		card: "border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-success-surface)]",
		bubble: "rounded-[1.35rem] rounded-br-[0.45rem]",
		iconShell:
			"border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]",
		icon: "text-[color:var(--dashboardy-success-foreground)]",
		summary: "text-[color:var(--dashboardy-success-foreground)]",
		button:
			"hover:bg-[color:color-mix(in_srgb,var(--dashboardy-success-surface)_82%,white)] focus-visible:bg-[color:color-mix(in_srgb,var(--dashboardy-success-surface)_82%,white)]",
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

function compactPreview(text: string, maxLength = 140): string {
	const normalized = text.replace(/\s+/g, " ").trim();
	if (normalized.length <= maxLength) {
		return normalized;
	}

	return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function MessageMetaTag({ value }: { value: string }) {
	return (
		<div className="rounded-full border border-[color:var(--dashboardy-divider)] bg-[color:color-mix(in_srgb,var(--dashboardy-surface)_92%,white)] px-2.5 py-1 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
			<p className="text-[0.75rem] font-medium tabular-nums text-[color:var(--dashboardy-muted)]">
				{value}
			</p>
		</div>
	);
}

function MessageFrame({
	icon: Icon,
	iconNode,
	label,
	timestamp,
	side,
	anchorId,
	className,
	cardClassName,
	bubbleClassName,
	iconShellClassName,
	iconClassName,
	children,
}: {
	icon?: ComponentType<{ className?: string }>;
	iconNode?: ReactNode;
	label: string;
	timestamp?: string;
	side: MessageSide;
	anchorId?: string;
	className?: string;
	cardClassName: string;
	bubbleClassName: string;
	iconShellClassName: string;
	iconClassName: string;
	children: ReactNode;
}) {
	const isRight = side === "right";

	if (side === "full") {
		return (
			<div
				id={anchorId}
				className={cn("grid max-w-[56rem] scroll-mt-6 gap-2.5", className)}
			>
				<div className="flex flex-wrap items-center gap-2">
					<div
						className={cn(
							"flex size-8 shrink-0 items-center justify-center rounded-full border",
							iconShellClassName,
						)}
					>
						{iconNode ?? (Icon ? <Icon className={cn("size-4", iconClassName)} /> : null)}
					</div>
					<p className="text-sm font-semibold text-[color:var(--dashboardy-heading)]">
						{label}
					</p>
					{timestamp ? (
						<MessageMetaTag value={formatMessageTime(timestamp)} />
					) : null}
				</div>
				<div
					className={cn(
						"min-w-0 border px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.03)] sm:px-5",
						cardClassName,
						bubbleClassName,
					)}
				>
					{children}
				</div>
			</div>
		);
	}

	return (
		<div
			id={anchorId}
			className={cn(
				"flex w-full scroll-mt-6",
				isRight ? "justify-end" : "justify-start",
				className,
			)}
		>
			<div
				className={cn(
					"grid w-full max-w-[60rem]",
					isRight ? "justify-items-end" : "justify-items-start",
				)}
			>
				<div
					className={cn(
						"w-full max-w-[46rem] min-w-0 border px-4 py-3.5 sm:px-5",
						cardClassName,
						bubbleClassName,
						isRight ? "ml-auto" : "mr-auto",
					)}
				>
					{children}
					<p
						className={cn(
							"mt-3 max-w-[14rem] truncate text-[0.75rem] font-medium text-[color:var(--dashboardy-muted)]",
							isRight && "text-right",
						)}
					>
						{label}
					</p>
				</div>
			</div>
		</div>
	);
}

function CollapsedEntry({
	icon: Icon,
	label,
	summary,
	children,
	timestamp,
	side,
	anchorId,
	className,
	variant = "default",
}: {
	icon: ComponentType<{ className?: string }>;
	label: string;
	summary: string;
	children: ReactNode;
	timestamp?: string;
	side: MessageSide;
	anchorId?: string;
	className?: string;
	variant?: "default" | "error" | "success";
}) {
	const [open, setOpen] = useState(false);
	const panelId = useId();
	const styles = collapsedVariantStyles[variant];

	return (
		<MessageFrame
			icon={Icon}
			label={label}
			timestamp={timestamp}
			side={side}
			anchorId={anchorId}
			className={className}
			cardClassName={styles.card}
			bubbleClassName={styles.bubble}
			iconShellClassName={styles.iconShell}
			iconClassName={styles.icon}
		>
			<button
				type="button"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
				aria-controls={panelId}
				className={cn(
					"flex w-full min-w-0 items-start gap-3 rounded-[1rem] px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--dashboardy-border)]",
					styles.button,
				)}
			>
				<div className="grid min-w-0 flex-1 gap-1">
					<p
						className={cn(
							"text-sm leading-6 [overflow-wrap:anywhere]",
							styles.summary,
						)}
					>
						{summary}
					</p>
				</div>
				<ChevronRight
					className={cn(
						"mt-0.5 size-4 shrink-0 text-[color:var(--dashboardy-muted)] transition-transform",
						open && "rotate-90",
					)}
				/>
			</button>
			{open ? (
				<div
					id={panelId}
					className={cn("grid gap-3 border-t px-3 pt-4", styles.panelBorder)}
				>
					{children}
				</div>
			) : null}
		</MessageFrame>
	);
}

function contentSummary(content: unknown): string {
	if (typeof content === "string") {
		return compactPreview(content);
	}

	if (Array.isArray(content)) {
		const first = content[0];
		if (typeof first === "object" && first) {
			if (first.type === "tool_result") {
				const text =
					typeof first.content === "string"
						? first.content
						: JSON.stringify(first.content);
				return compactPreview(`Tool result: ${text}`, 120);
			}
			if (first.type === "text" && "text" in first) {
				return compactPreview(String(first.text));
			}
		}
	}

	return "";
}

function formatToolResultSummary(
	toolResults: ToolResultContent[],
	content: unknown,
): string {
	const count = toolResults.length;
	const resultLabel = `${count} result${count === 1 ? "" : "s"}`;
	const prefix = toolResults.some((item) => item.is_error)
		? `${resultLabel} with errors`
		: resultLabel;
	const summary = contentSummary(content);

	return summary ? `${prefix}. ${summary}` : prefix;
}

export function ConversationMessage({
	entry,
	messageIndex,
	className,
	userLabel = "User",
}: ConversationMessageProps) {
	const anchorId =
		messageIndex !== undefined ? `message-${messageIndex}` : undefined;

	if (entry.type === "summary") {
		const styles = frameStyles.summary;

		return (
			<MessageFrame
				icon={FileText}
				label="Summary"
				side="full"
				anchorId={anchorId}
				className={className}
				cardClassName={styles.card}
				bubbleClassName={styles.bubble}
				iconShellClassName={styles.icon}
				iconClassName="text-current"
			>
				<p className="whitespace-pre-wrap text-base leading-7 text-[color:var(--dashboardy-heading)] text-pretty">
					{entry.summary}
				</p>
			</MessageFrame>
		);
	}

	if (entry.type === "system") {
		return (
			<CollapsedEntry
				icon={Settings}
				label="System"
				summary={compactPreview(entry.message.content, 180)}
				timestamp={entry.timestamp}
				side="full"
				anchorId={anchorId}
				className={className}
			>
				<p className="whitespace-pre-wrap font-mono text-[0.875rem] leading-6 text-[color:var(--dashboardy-heading)]">
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
						label="Tool results"
						summary={formatToolResultSummary(toolResults, content)}
						variant={
							toolResults.some((item) => item.is_error) ? "error" : "success"
						}
						timestamp={entry.timestamp}
						side="right"
						anchorId={anchorId}
						className={className}
					>
						<MessageContent content={content} />
					</CollapsedEntry>
				);
			}
		}

		const isSlashCommand =
			typeof content === "string" && isSlashCommandMessage(content);
		const slashCommandInfo = isSlashCommand ? parseSlashCommand(content) : null;
		const styles = frameStyles.user;

		return (
			<MessageFrame
				label={userLabel}
				timestamp={entry.timestamp}
				side="right"
				anchorId={anchorId}
				className={className}
				cardClassName={styles.card}
				bubbleClassName={styles.bubble}
				iconShellClassName={styles.icon}
				iconClassName="text-current"
			>
				{isSlashCommand && slashCommandInfo ? (
					<div className="grid gap-3">
						<p className="text-sm font-medium text-[color:var(--dashboardy-muted)]">
							Slash command
						</p>
						<div className="flex flex-wrap gap-2">
							{slashCommandInfo.commandMessage ? (
								<div className="dashboardy-inline-badge w-fit rounded-full border px-3 py-1.5">
									<p className="font-mono text-[0.875rem] text-[color:var(--dashboardy-heading)]">
										{slashCommandInfo.commandMessage}
									</p>
								</div>
							) : null}
							{slashCommandInfo.commandName ? (
								<div className="rounded-full border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] px-3 py-1.5">
									<p className="font-mono text-[0.875rem] text-[color:var(--dashboardy-heading)]">
										{slashCommandInfo.commandName}
									</p>
								</div>
							) : null}
						</div>
						{slashCommandInfo.commandArgs ? (
							<div className="rounded-[1rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)] px-3 py-3">
								<p className="text-sm font-medium text-[color:var(--dashboardy-muted)]">
									Args
								</p>
								<p className="mt-1 whitespace-pre-wrap break-words font-mono text-[0.875rem] leading-6 text-[color:var(--dashboardy-heading)]">
									{slashCommandInfo.commandArgs}
								</p>
							</div>
						) : null}
					</div>
				) : (
					<MessageContent content={content} />
				)}
			</MessageFrame>
		);
	}

	const styles = frameStyles.assistant;

	return (
		<MessageFrame
			label="Assistant"
			timestamp={entry.timestamp}
			side="left"
			anchorId={anchorId}
			className={className}
			cardClassName={styles.card}
			bubbleClassName={styles.bubble}
			iconShellClassName={styles.icon}
			iconClassName="text-current"
		>
			<MessageContent content={entry.message.content} />
		</MessageFrame>
	);
}
