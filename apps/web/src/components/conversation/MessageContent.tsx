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

function XmlBlock({
	tag,
	entries,
}: {
	tag: string;
	entries: Array<{ key: string; value: string }>;
}) {
	return (
		<div className="border border-border rounded-lg overflow-hidden text-sm">
			<div className="bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground tracking-wide">
				{formatTagLabel(tag)}
			</div>
			<div className="divide-y divide-border">
				{entries.map((entry) => (
					<div key={entry.key} className="flex px-3 py-1.5 gap-3">
						<span className="text-muted-foreground font-medium shrink-0 min-w-[100px]">
							{formatTagLabel(entry.key)}
						</span>
						<span className="text-foreground font-mono text-xs break-all">
							{entry.value}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function renderPlainText(text: string, key: number) {
	const parts = parseTextContent(text);
	return (
		<div key={key} className="space-y-3">
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
						className="prose prose-sm max-w-none"
					>
						<p className="whitespace-pre-wrap text-foreground leading-relaxed break-words [overflow-wrap:anywhere]">
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
			<div className={cn("text-muted-foreground text-sm italic", className)}>
				(No content)
			</div>
		);
	}

	if (typeof content === "string") {
		return (
			<div className={cn("space-y-3", className)}>
				{renderPlainText(content, 0)}
			</div>
		);
	}

	if (!Array.isArray(content)) {
		return (
			<div className={cn("text-muted-foreground text-sm italic", className)}>
				(Invalid content format: {typeof content})
			</div>
		);
	}

	const toolUses = new Map<string, ToolUseContent>();
	const toolResults = new Map<string, ToolResultContent>();

	for (const block of content) {
		if (typeof block === "string") continue;
		if (block.type === "tool_use") {
			toolUses.set(block.id, block);
		} else if (block.type === "tool_result") {
			toolResults.set(block.tool_use_id, block);
		}
	}

	return (
		<div className={cn("space-y-3", className)}>
			{content.map((block, idx) => {
				if (typeof block === "string") {
					return renderPlainText(block, idx);
				}

				switch (block.type) {
					case "text":
						return renderPlainText(block.text, idx);

					case "thinking":
						return (
							<div
								// biome-ignore lint/suspicious/noArrayIndexKey: content blocks have no stable id
								key={idx}
								className="border-l-4 border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-950 p-4 rounded-r"
							>
								<p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2">
									Internal Thinking
								</p>
								<p className="text-sm text-purple-900 dark:text-purple-100 whitespace-pre-wrap leading-relaxed italic">
									{block.thinking}
								</p>
							</div>
						);

					case "tool_use": {
						const toolResult = toolResults.get(block.id);
						return (
							<ToolInvocation
								// biome-ignore lint/suspicious/noArrayIndexKey: content blocks have no stable id
								key={idx}
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
								// biome-ignore lint/suspicious/noArrayIndexKey: content blocks have no stable id
								key={idx}
								className={cn(
									"border rounded-lg p-4",
									block.is_error
										? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950"
										: "border-border bg-muted/30",
								)}
							>
								<p
									className={cn(
										"text-xs font-semibold mb-2",
										block.is_error
											? "text-red-700 dark:text-red-300"
											: "text-muted-foreground",
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
