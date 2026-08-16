import { type ReactNode, useId, useState } from "react";
import type {
	TextContent,
	ThinkingContent,
	ToolResultContent,
	ToolUseContent,
} from "@/lib/conversation-schema";
import { cn } from "@/lib/utils";
import { CodeBlock, InlineCode } from "./CodeBlock";
import { formatShellOutput } from "./conversation-tools";
import {
	TraceChevronDownIcon,
	TraceChevronRightIcon,
} from "./conversation-trace-hugeicons";
import { ToolInvocation } from "./ToolInvocation";

// Keep room for the formatted-part limit plus a plain-text fallback while
// bounding every message-level loop in this component.
export const MAX_RENDERED_MESSAGE_BLOCKS = 128;

type MessageBlock =
	| string
	| TextContent
	| ThinkingContent
	| ToolUseContent
	| ToolResultContent;

function getMessageBlockIdentity(block: MessageBlock): string {
	if (typeof block === "string") {
		return `string:${block}`;
	}

	switch (block.type) {
		case "text":
			return `text:${block.text}`;
		case "thinking":
			return `thinking:${block.thinking}`;
		case "tool_use":
			return `tool-use:${block.id}`;
		case "tool_result":
			return `tool-result:${block.tool_use_id}`;
	}
}

interface MessageContentProps {
	content: string | MessageBlock[];
	className?: string;
}

type TextPart =
	| { type: "text"; content: string }
	| { type: "code"; content: string; language?: string }
	| {
			type: "xml";
			tag: string;
			entries: Array<{ key: string; value: string }>;
	  };

/**
 * Format an XML tag name into a human-readable label.
 * e.g. "environment_context" -> "Environment Context"
 */
function formatTagLabel(tag: string): string {
	return tag.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Parse an XML block's inner content into key-value entries.
 * Handles simple `<key>value</key>` pairs and produces a fallback
 * "content" entry for anything that doesn't match.
 */
function parseXmlEntries(
	innerContent: string,
): Array<{ key: string; value: string }> {
	const entries: Array<{ key: string; value: string }> = [];
	const leafTagRegex = /<([\w-]+)>([\s\S]*?)<\/\1>/g;
	let leafMatch = leafTagRegex.exec(innerContent);

	if (!leafMatch) {
		const trimmed = innerContent.trim();
		if (trimmed) {
			entries.push({ key: "content", value: trimmed });
		}
		return entries;
	}

	while (leafMatch !== null) {
		entries.push({
			key: leafMatch[1] as string,
			value: (leafMatch[2] as string).trim(),
		});
		leafMatch = leafTagRegex.exec(innerContent);
	}

	return entries;
}

// Parse code blocks and XML blocks from text content
function parseTextContent(text: string): Array<TextPart> {
	const parts: Array<TextPart> = [];

	// Combined regex: code blocks OR top-level XML blocks (inline or multiline)
	const combinedRegex =
		/```(\w+)?\n([\s\S]*?)```|<([\w-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\3>/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null = combinedRegex.exec(text);

	while (match !== null) {
		if (match.index > lastIndex) {
			const textContent = text.slice(lastIndex, match.index).trim();
			if (textContent) {
				parts.push({ type: "text", content: textContent });
			}
		}

		if (match[2] !== undefined) {
			// Code block match
			const language = match[1] || "text";
			parts.push({ type: "code", content: match[2], language });
		} else if (match[3] !== undefined && match[4] !== undefined) {
			// XML block match
			const tag = match[3];
			const entries = parseXmlEntries(match[4]);
			if (entries.length > 0) {
				parts.push({ type: "xml", tag, entries });
			}
		}

		lastIndex = match.index + match[0].length;
		match = combinedRegex.exec(text);
	}

	if (lastIndex < text.length) {
		const textContent = text.slice(lastIndex).trim();
		if (textContent) {
			parts.push({ type: "text", content: textContent });
		}
	}

	if (parts.length === 0 && text.trim()) {
		parts.push({ type: "text", content: text.trim() });
	}

	return parts;
}

function shouldCollapseXmlBlockByDefault(tag: string): boolean {
	return /instruction|context/i.test(tag);
}

function formatXmlBlockSummary(
	entries: Array<{ key: string; value: string }>,
): string {
	const [firstEntry] = entries;
	if (!firstEntry) {
		return "No fields";
	}

	const valuePreview = firstEntry.value
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 80);
	const suffix = entries.length > 1 ? `, +${entries.length - 1} more` : "";

	return `${formatTagLabel(firstEntry.key)}: ${valuePreview}${valuePreview.length === 80 ? "..." : ""}${suffix}`;
}

function XmlBlock({
	tag,
	entries,
}: {
	tag: string;
	entries: Array<{ key: string; value: string }>;
}) {
	const [isOpen, setIsOpen] = useState(!shouldCollapseXmlBlockByDefault(tag));
	const panelId = useId();

	return (
		<div className="overflow-hidden rounded-[1rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]">
			<button
				type="button"
				onClick={() => setIsOpen((current) => !current)}
				aria-expanded={isOpen}
				aria-controls={panelId}
				className="flex w-full items-start gap-3 border-b border-[color:var(--dashboardy-divider)] bg-[color:color-mix(in_srgb,var(--dashboardy-subsurface)_82%,white)] px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--dashboardy-border)]"
			>
				<div className="mt-0.5 shrink-0 text-[color:var(--dashboardy-muted)]">
					{isOpen ? (
						<TraceChevronDownIcon className="size-4" />
					) : (
						<TraceChevronRightIcon className="size-4" />
					)}
				</div>
				<div className="grid min-w-0 flex-1 gap-0.5">
					<p className="text-[0.8125rem] font-semibold text-[color:var(--dashboardy-heading)]">
						{formatTagLabel(tag)}
					</p>
					{isOpen ? null : (
						<p className="text-[0.8125rem] text-[color:var(--dashboardy-muted)] [overflow-wrap:anywhere]">
							{formatXmlBlockSummary(entries)}
						</p>
					)}
				</div>
			</button>
			{isOpen ? (
				<div
					id={panelId}
					className="divide-y divide-[color:var(--dashboardy-divider)]"
				>
					{entries.map((entry) => (
						<div key={entry.key} className="flex gap-4 px-4 py-3">
							<p className="min-w-[6.5rem] shrink-0 text-[0.8125rem] font-medium text-[color:var(--dashboardy-muted)]">
								{formatTagLabel(entry.key)}
							</p>
							<p className="break-all font-mono text-[0.8125rem] leading-5 text-[color:var(--dashboardy-heading)]">
								{entry.value}
							</p>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

function renderPlainText(text: string, key: string) {
	const parts = parseTextContent(text);
	return (
		<div key={key} className="space-y-3.5">
			{parts.map((part, partIdx) => {
				if (part.type === "code") {
					return (
						<CodeBlock
							// biome-ignore lint/suspicious/noArrayIndexKey: static parsed content blocks
							key={partIdx}
							code={part.content}
							language={part.language}
							showLineNumbers
						/>
					);
				}
				if (part.type === "xml") {
					return (
						<XmlBlock
							// biome-ignore lint/suspicious/noArrayIndexKey: static parsed content blocks
							key={partIdx}
							tag={part.tag}
							entries={part.entries}
						/>
					);
				}
				return (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: static parsed content blocks
						key={partIdx}
						className="max-w-none"
					>
						<p className="whitespace-pre-wrap break-words text-[0.8125rem] leading-5 text-[color:var(--dashboardy-heading)] text-pretty [overflow-wrap:anywhere]">
							{renderInlineCode(part.content)}
						</p>
					</div>
				);
			})}
		</div>
	);
}

function renderStrongText(text: string, keyPrefix: string): ReactNode[] {
	const strongPattern = /\*\*([^*\n]+?)\*\*/g;
	const content: ReactNode[] = [];
	let lastIndex = 0;
	let match = strongPattern.exec(text);

	while (match !== null) {
		if (match.index > lastIndex) {
			content.push(
				<span key={`${keyPrefix}-text-${lastIndex}`}>
					{text.slice(lastIndex, match.index)}
				</span>,
			);
		}

		const strongText = match[1];
		if (strongText?.trim()) {
			content.push(
				<strong
					key={`${keyPrefix}-strong-${match.index}`}
					className="font-semibold"
				>
					{strongText}
				</strong>,
			);
		} else {
			content.push(
				<span key={`${keyPrefix}-text-${match.index}`}>{match[0]}</span>,
			);
		}

		lastIndex = match.index + match[0].length;
		match = strongPattern.exec(text);
	}

	if (lastIndex === 0) {
		return [<span key={`${keyPrefix}-text`}>{text}</span>];
	}

	if (lastIndex < text.length) {
		content.push(
			<span key={`${keyPrefix}-text-${lastIndex}`}>
				{text.slice(lastIndex)}
			</span>,
		);
	}

	return content;
}

function renderInlineCode(text: string): ReactNode {
	const inlineCodePattern = /(`+)([^`\n]+?)\1/g;
	const content: ReactNode[] = [];
	let lastIndex = 0;
	let match = inlineCodePattern.exec(text);

	while (match !== null) {
		if (match.index > lastIndex) {
			content.push(
				...renderStrongText(
					text.slice(lastIndex, match.index),
					`inline-${lastIndex}`,
				),
			);
		}

		const code = match[2];
		if (code !== undefined) {
			content.push(<InlineCode key={`code-${match.index}`}>{code}</InlineCode>);
		}

		lastIndex = match.index + match[0].length;
		match = inlineCodePattern.exec(text);
	}

	if (lastIndex === 0) {
		return renderStrongText(text, "plain");
	}

	if (lastIndex < text.length) {
		content.push(
			...renderStrongText(text.slice(lastIndex), `inline-${lastIndex}`),
		);
	}

	return content;
}

export function MessageContent({ content, className }: MessageContentProps) {
	if (!content) {
		return (
			<div
				className={cn(
					"text-sm italic text-[color:var(--dashboardy-muted)]",
					className,
				)}
			>
				(No content)
			</div>
		);
	}

	if (typeof content === "string") {
		return (
			<div className={cn("space-y-3.5", className)}>
				{renderPlainText(content, "plain-content")}
			</div>
		);
	}

	if (!Array.isArray(content)) {
		return (
			<div
				className={cn(
					"text-sm italic text-[color:var(--dashboardy-muted)]",
					className,
				)}
			>
				(Invalid content format: {typeof content})
			</div>
		);
	}

	const visibleBlocks = content.slice(0, MAX_RENDERED_MESSAGE_BLOCKS);
	const toolUses = new Map<string, ToolUseContent>();
	const toolResults = new Map<string, ToolResultContent>();
	const blockIdentityCounts = new Map<string, number>();

	for (const block of visibleBlocks) {
		if (typeof block === "string") continue;
		if (block.type === "tool_use") {
			toolUses.set(block.id, block);
		} else if (block.type === "tool_result") {
			toolResults.set(block.tool_use_id, block);
		}
	}

	return (
		<div className={cn("space-y-3.5", className)}>
			{visibleBlocks.map((block) => {
				const blockIdentity = getMessageBlockIdentity(block);
				const identityOccurrence =
					(blockIdentityCounts.get(blockIdentity) ?? 0) + 1;
				blockIdentityCounts.set(blockIdentity, identityOccurrence);
				const blockKey = `${blockIdentity}:${identityOccurrence}`;

				if (typeof block === "string") {
					return renderPlainText(block, blockKey);
				}

				switch (block.type) {
					case "text":
						return renderPlainText(block.text, blockKey);

					case "thinking":
						return (
							<div
								key={blockKey}
								className="rounded-[1rem] border border-[color:var(--dashboardy-divider)] bg-[color:color-mix(in_srgb,var(--dashboardy-subsurface)_82%,white)] px-4 py-3.5"
							>
								<p className="mb-1 text-sm font-semibold text-[color:var(--dashboardy-heading)]">
									Thinking
								</p>
								<p className="whitespace-pre-wrap text-[0.8125rem] leading-5 text-[color:var(--dashboardy-muted)] italic text-pretty">
									{block.thinking}
								</p>
							</div>
						);

					case "tool_use": {
						const toolResult = toolResults.get(block.id);
						return (
							<ToolInvocation
								key={blockKey}
								toolName={block.name}
								input={block.input}
								result={
									toolResult
										? {
												content: toolResult.content,
												is_error: toolResult.is_error,
											}
										: undefined
								}
							/>
						);
					}

					case "tool_result": {
						if (toolUses.has(block.tool_use_id)) {
							return null;
						}

						const resultContent =
							typeof block.content === "string"
								? block.content
								: block.content
										.map((item) =>
											item.type === "text" && "text" in item
												? item.text
												: JSON.stringify(item),
										)
										.join("\n");
						const output = formatShellOutput(resultContent);

						return (
							<div
								key={blockKey}
								className={cn(
									"grid gap-2.5 rounded-[1rem] border p-3.5",
									block.is_error
										? "border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-danger-surface)]"
										: "border-[color:var(--dashboardy-divider)] bg-[color:color-mix(in_srgb,var(--dashboardy-subsurface)_82%,white)]",
								)}
							>
								<p
									className={cn(
										"text-sm font-semibold",
										block.is_error
											? "text-[color:var(--dashboardy-danger-foreground)]"
											: "text-[color:var(--dashboardy-heading)]",
									)}
								>
									{block.is_error ? "Tool Error" : "Tool Result"}
								</p>
								<CodeBlock
									code={output.text}
									filename={block.is_error ? "Error Output" : "Output"}
									language={output.language}
									showLineNumbers
								/>
							</div>
						);
					}

					default:
						return null;
				}
			})}
		</div>
	);
}
