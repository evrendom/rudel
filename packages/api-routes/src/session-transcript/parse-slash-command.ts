export interface ParsedSlashCommand {
	commandArgs: string;
	commandMessage: string;
	commandName: string;
	expandedContent?: string;
}

type MessageContent =
	| string
	| Array<string | { type: "text"; text: string } | { type: string }>;

function extractTextBlocks(content: MessageContent): string[] {
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

export function parseSlashCommand(
	content: MessageContent,
): ParsedSlashCommand | null {
	const textBlocks = extractTextBlocks(content);
	const commandBlockIndex = textBlocks.findIndex((block) =>
		/<command-name>/.test(block),
	);
	if (commandBlockIndex === -1) {
		return null;
	}

	const commandBlock = textBlocks[commandBlockIndex];
	if (!commandBlock) {
		return null;
	}

	const commandMessageMatch = commandBlock.match(
		/<command-message>([^<]*)<\/command-message>/,
	);
	const commandNameMatch = commandBlock.match(
		/<command-name>([^<]*)<\/command-name>/,
	);
	const commandArgsMatch = commandBlock.match(
		/<command-args>([\s\S]*?)<\/command-args>/,
	);
	if (!commandNameMatch?.[1]) {
		return null;
	}

	const expandedBlocks = textBlocks.filter(
		(_, index) => index !== commandBlockIndex,
	);

	return {
		commandArgs: commandArgsMatch?.[1] ?? "",
		commandMessage: commandMessageMatch?.[1] ?? "",
		commandName: commandNameMatch[1],
		expandedContent:
			expandedBlocks.length > 0 ? expandedBlocks.join("\n") : undefined,
	};
}

export function isSlashCommandMessage(content: MessageContent): boolean {
	return extractTextBlocks(content).some((block) =>
		/<command-name>/.test(block),
	);
}
