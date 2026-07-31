import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useMemo, useState } from "react";
import type {
	TextContent,
	ThinkingContent,
	ToolResultContent,
	ToolUseContent,
} from "@/lib/conversation-schema";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./CodeBlock";
import {
	parseMessageTextBlocks,
	type TextPart,
} from "./message-content-parser";
import { ToolInvocation } from "./ToolInvocation";

type MessageBlock =
	| string
	| TextContent
	| ThinkingContent
	| ToolUseContent
	| ToolResultContent;

// Keep room for the formatted-part limit plus a plain-text fallback while
// bounding every message-level loop in this component.
export const MAX_RENDERED_MESSAGE_BLOCKS = 128;

function getMessageBlockKey(block: MessageBlock, blockIndex: number): string {
	// Parsed transcript blocks are immutable; their position is a bounded key
	// that does not copy arbitrarily large message text into React's key space.
	if (typeof block === "string") {
		return `string:${blockIndex}`;
	}

	return `${block.type}:${blockIndex}`;
}

interface MessageContentProps {
	content: string | MessageBlock[];
	className?: string;
}

interface MessageRenderPlan {
	readonly visibleBlocks: ReadonlyArray<MessageBlock>;
	readonly textPartsByBlock: ReadonlyArray<ReadonlyArray<TextPart> | null>;
}

/**
 * Format an XML tag name into a human-readable label.
 * e.g. "environment_context" -> "Environment Context"
 */
function formatTagLabel(tag: string): string {
	return tag.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function shouldCollapseXmlBlockByDefault(tag: string): boolean {
	return /instruction|context/i.test(tag);
}

function formatXmlBlockSummary(
	entries: ReadonlyArray<{ readonly key: string; readonly value: string }>,
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
	entries: ReadonlyArray<{ readonly key: string; readonly value: string }>;
}) {
	const [isOpen, setIsOpen] = useState(!shouldCollapseXmlBlockByDefault(tag));
	const panelId = useId();

	return (
		<div
			data-testid="message-xml-block"
			className="overflow-hidden rounded-[1rem] border border-[color:var(--dashboardy-border)] bg-[color:var(--dashboardy-surface)]"
		>
			<button
				type="button"
				onClick={() => setIsOpen((current) => !current)}
				aria-expanded={isOpen}
				aria-controls={panelId}
				className="flex w-full items-start gap-3 border-b border-[color:var(--dashboardy-divider)] bg-[color:color-mix(in_srgb,var(--dashboardy-subsurface)_82%,white)] px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--dashboardy-border)]"
			>
				<div className="mt-0.5 shrink-0 text-[color:var(--dashboardy-muted)]">
					{isOpen ? (
						<ChevronDown className="size-4" />
					) : (
						<ChevronRight className="size-4" />
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
					{entries.map((entry, entryIndex) => (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: parsed XML fields are static and may repeat names
							key={`${entry.key}:${entryIndex}`}
							className="flex gap-4 px-4 py-3"
						>
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

function renderTextParts(parts: ReadonlyArray<TextPart>, key: string) {
	return (
		<div key={key} data-testid="message-text-block" className="space-y-3.5">
			{parts.map((part, partIdx) => {
				if (part.type === "code") {
					return (
						<CodeBlock
							// biome-ignore lint/suspicious/noArrayIndexKey: static parsed content blocks
							key={partIdx}
							code={part.content}
							language={part.language}
							highlight={part.highlight}
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
				if (part.type === "notice") {
					return (
						<p
							// biome-ignore lint/suspicious/noArrayIndexKey: static parsed content blocks
							key={partIdx}
							data-testid="message-content-notice"
							className="whitespace-pre-wrap break-words text-[0.8125rem] leading-5 text-[color:var(--dashboardy-muted)] italic [overflow-wrap:anywhere]"
						>
							{part.content}
						</p>
					);
				}
				return (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: static parsed content blocks
						key={partIdx}
						className="max-w-none"
					>
						<p className="whitespace-pre-wrap break-words text-[0.8125rem] leading-5 text-[color:var(--dashboardy-heading)] text-pretty [overflow-wrap:anywhere]">
							{part.content}
						</p>
					</div>
				);
			})}
		</div>
	);
}

function getMessageBlockText(block: MessageBlock): string | null {
	if (typeof block === "string") {
		return block;
	}

	return block.type === "text" ? block.text : null;
}

export function MessageContent({ content, className }: MessageContentProps) {
	const renderPlan = useMemo<MessageRenderPlan>(() => {
		if (typeof content === "string") {
			return {
				visibleBlocks: [],
				textPartsByBlock: parseMessageTextBlocks([content]),
			};
		}

		if (!Array.isArray(content)) {
			return { visibleBlocks: [], textPartsByBlock: [] };
		}

		const visibleBlocks = content.slice(0, MAX_RENDERED_MESSAGE_BLOCKS);
		return {
			visibleBlocks,
			textPartsByBlock: parseMessageTextBlocks(
				visibleBlocks.map(getMessageBlockText),
			),
		};
	}, [content]);

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
				{renderTextParts(renderPlan.textPartsByBlock[0] ?? [], "plain-content")}
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

	const toolUses = new Map<string, ToolUseContent>();
	const toolResults = new Map<string, ToolResultContent>();
	const omittedBlockCount = content.length - renderPlan.visibleBlocks.length;

	for (const block of renderPlan.visibleBlocks) {
		if (typeof block === "string") continue;
		if (block.type === "tool_use") {
			toolUses.set(block.id, block);
		} else if (block.type === "tool_result") {
			toolResults.set(block.tool_use_id, block);
		}
	}

	return (
		<div className={cn("space-y-3.5", className)}>
			{renderPlan.visibleBlocks.map((block, blockIndex) => {
				const blockKey = getMessageBlockKey(block, blockIndex);

				if (typeof block === "string") {
					return renderTextParts(
						renderPlan.textPartsByBlock[blockIndex] ?? [],
						blockKey,
					);
				}

				switch (block.type) {
					case "text":
						return renderTextParts(
							renderPlan.textPartsByBlock[blockIndex] ?? [],
							blockKey,
						);

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
								<CodeBlock code={resultContent} language="text" />
							</div>
						);
					}

					default:
						return null;
				}
			})}
			{omittedBlockCount > 0 ? (
				<p
					data-testid="message-block-limit-notice"
					className="whitespace-pre-wrap break-words text-[0.8125rem] leading-5 text-[color:var(--dashboardy-muted)] italic [overflow-wrap:anywhere]"
				>
					Additional content not shown ({omittedBlockCount}{" "}
					{omittedBlockCount === 1 ? "block" : "blocks"} omitted).
				</p>
			) : null}
		</div>
	);
}
