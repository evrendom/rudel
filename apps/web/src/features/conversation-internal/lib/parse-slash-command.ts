/**
 * Parses slash command XML tags from a user message content.
 *
 * User messages containing slash commands have this format:
 * <command-message>code:research_codebase</command-message>
 * <command-name>/code:research_codebase</command-name>
 * <command-args>argument text here</command-args>
 *
 * The expanded slash command content may be in a separate text block within the same message.
 */

export interface ParsedSlashCommand {
	/** The command message (e.g., "code:research_codebase") */
	commandMessage: string;
	/** The command name with leading slash (e.g., "/code:research_codebase") */
	commandName: string;
	/** The command arguments/prompt text */
	commandArgs: string;
	/** The expanded slash command content (from a separate text block) */
	expandedContent?: string;
}

type MessageContent =
	| string
	| Array<string | { type: "text"; text: string } | { type: string }>;

/**
 * Extract all text content from a user message, returning an array of text strings.
 */
function extractTextBlocks(content: MessageContent): Array<string> {
	if (typeof content === "string") {
		return [content];
	}

	return content
		.filter(
			(block): block is string | { type: "text"; text: string } =>
				typeof block === "string" ||
				(typeof block === "object" && block.type === "text"),
		)
		.map((block) => (typeof block === "string" ? block : block.text));
}

/**
 * Parse slash command from a user message.
 * Handles both string content and array content with multiple text blocks.
 * Returns the parsed command if found, otherwise null.
 */
export function parseSlashCommand(
	content: MessageContent,
): ParsedSlashCommand | null {
	const textBlocks = extractTextBlocks(content);
	if (textBlocks.length === 0) return null;

	// Find the block that contains command tags
	const commandBlockIndex = textBlocks.findIndex((block) =>
		/<command-name>/.test(block),
	);
	if (commandBlockIndex === -1) return null;

	const commandBlock = textBlocks[commandBlockIndex];

	const commandMessageMatch = commandBlock.match(
		/<command-message>([^<]*)<\/command-message>/,
	);
	const commandNameMatch = commandBlock.match(
		/<command-name>([^<]*)<\/command-name>/,
	);
	const commandArgsMatch = commandBlock.match(
		/<command-args>([\s\S]*?)<\/command-args>/,
	);

	if (!commandNameMatch) return null;

	// Collect expanded content from other text blocks (those without command tags)
	const expandedBlocks = textBlocks.filter(
		(_, index) => index !== commandBlockIndex,
	);
	const expandedContent =
		expandedBlocks.length > 0 ? expandedBlocks.join("\n") : undefined;

	return {
		commandMessage: commandMessageMatch?.[1] ?? "",
		commandName: commandNameMatch[1],
		commandArgs: commandArgsMatch?.[1] ?? "",
		expandedContent,
	};
}

/**
 * Check if a user message content contains slash command tags.
 */
export function isSlashCommandMessage(content: MessageContent): boolean {
	const textBlocks = extractTextBlocks(content);
	return textBlocks.some((block) => /<command-name>/.test(block));
}
