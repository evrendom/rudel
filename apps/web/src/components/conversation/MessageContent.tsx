import { ChevronDown, ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import type {
	TextContent,
	ThinkingContent,
	ToolResultContent,
	ToolUseContent,
} from "@/lib/conversation-schema";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./CodeBlock";
import { ToolInvocation } from "./ToolInvocation";

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

export const MAX_RENDERED_MESSAGE_CODE_UNITS = 256 * 1024;

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
	let cursor = 0;

	while (cursor < innerContent.length) {
		if (innerContent[cursor] !== "<") {
			cursor += 1;
			continue;
		}

		const openingTagEnd = innerContent.indexOf(">", cursor + 1);
		if (openingTagEnd === -1) {
			break;
		}

		const tag = readXmlTagName(innerContent, cursor + 1, openingTagEnd, false);
		if (!tag) {
			cursor = openingTagEnd + 1;
			continue;
		}

		const closingTag = `</${tag}>`;
		const closingTagStart = innerContent.indexOf(closingTag, openingTagEnd + 1);
		if (closingTagStart === -1) {
			break;
		}

		entries.push({
			key: tag,
			value: innerContent.slice(openingTagEnd + 1, closingTagStart).trim(),
		});
		cursor = closingTagStart + closingTag.length;
	}

	if (entries.length === 0) {
		const trimmedContent = innerContent.trim();
		if (trimmedContent) {
			entries.push({ key: "content", value: trimmedContent });
		}
	}

	return entries;
}

export function parseMessageText(text: string): Array<TextPart> {
	if (text.length > MAX_RENDERED_MESSAGE_CODE_UNITS) {
		const visibleText = text
			.slice(0, MAX_RENDERED_MESSAGE_CODE_UNITS)
			.trimEnd();
		const omittedCodeUnits = text.length - MAX_RENDERED_MESSAGE_CODE_UNITS;

		return [
			{
				type: "text",
				content: `${visibleText}\n\n[Message truncated: ${omittedCodeUnits} code units omitted]`,
			},
		];
	}

	const parts: Array<TextPart> = [];
	let plainTextStart = 0;
	let cursor = 0;

	while (cursor < text.length) {
		if (text.startsWith("```", cursor)) {
			const codeBlock = readCodeBlockStart(text, cursor);
			if (!codeBlock) {
				cursor += 3;
				continue;
			}

			const closingFenceStart = text.indexOf("```", codeBlock.contentStart);
			if (closingFenceStart === -1) {
				cursor = codeBlock.contentStart;
				continue;
			}

			appendTextPart(parts, text.slice(plainTextStart, cursor));
			parts.push({
				type: "code",
				content: text.slice(codeBlock.contentStart, closingFenceStart),
				language: codeBlock.language,
			});
			cursor = closingFenceStart + 3;
			plainTextStart = cursor;
			continue;
		}

		if (text[cursor] !== "<") {
			cursor += 1;
			continue;
		}

		const openingTagEnd = text.indexOf(">", cursor + 1);
		if (openingTagEnd === -1) {
			break;
		}

		const tag = readXmlTagName(text, cursor + 1, openingTagEnd, true);
		if (!tag) {
			cursor = openingTagEnd + 1;
			continue;
		}

		const closingTag = `</${tag}>`;
		const closingTagStart = text.indexOf(closingTag, openingTagEnd + 1);
		if (closingTagStart === -1) {
			break;
		}

		appendTextPart(parts, text.slice(plainTextStart, cursor));
		const entries = parseXmlEntries(
			text.slice(openingTagEnd + 1, closingTagStart),
		);
		if (entries.length > 0) {
			parts.push({ type: "xml", tag, entries });
		}

		cursor = closingTagStart + closingTag.length;
		plainTextStart = cursor;
	}

	appendTextPart(parts, text.slice(plainTextStart));

	if (parts.length === 0 && text.trim()) {
		parts.push({ type: "text", content: text.trim() });
	}

	return parts;
}

function appendTextPart(parts: TextPart[], text: string) {
	const content = text.trim();
	if (content) {
		parts.push({ type: "text", content });
	}
}

function readCodeBlockStart(
	text: string,
	fenceStart: number,
): { contentStart: number; language: string } | null {
	const languageStart = fenceStart + 3;
	let cursor = languageStart;

	while (
		cursor < text.length &&
		isCodeLanguageCharacter(text.charCodeAt(cursor))
	) {
		cursor += 1;
	}

	if (text[cursor] !== "\n") {
		return null;
	}

	return {
		contentStart: cursor + 1,
		language: text.slice(languageStart, cursor) || "text",
	};
}

function readXmlTagName(
	text: string,
	nameStart: number,
	tagEnd: number,
	allowAttributes: boolean,
): string | null {
	let cursor = nameStart;

	while (cursor < tagEnd && isTagNameCharacter(text.charCodeAt(cursor))) {
		cursor += 1;
	}

	if (cursor === nameStart) {
		return null;
	}

	if (cursor < tagEnd) {
		if (!allowAttributes || text[cursor]?.trim() !== "") {
			return null;
		}
	}

	return text.slice(nameStart, cursor);
}

function isTagNameCharacter(characterCode: number) {
	return isCodeLanguageCharacter(characterCode) || characterCode === 45;
}

function isCodeLanguageCharacter(characterCode: number) {
	return (
		(characterCode >= 48 && characterCode <= 57) ||
		(characterCode >= 65 && characterCode <= 90) ||
		characterCode === 95 ||
		(characterCode >= 97 && characterCode <= 122)
	);
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
	const parts = parseMessageText(text);
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
							{part.content}
						</p>
					</div>
				);
			})}
		</div>
	);
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

	const toolUses = new Map<string, ToolUseContent>();
	const toolResults = new Map<string, ToolResultContent>();
	const blockIdentityCounts = new Map<string, number>();

	for (const block of content) {
		if (typeof block === "string") continue;
		if (block.type === "tool_use") {
			toolUses.set(block.id, block);
		} else if (block.type === "tool_result") {
			toolResults.set(block.tool_use_id, block);
		}
	}

	return (
		<div className={cn("space-y-3.5", className)}>
			{content.map((block) => {
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
		</div>
	);
}
