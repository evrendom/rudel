/**
 * Presentation for a tool call in the invocation trace: the verb that reads as
 * a past-tense action, and the single argument worth showing inline.
 */

export type ToolIconName =
	| "file"
	| "pencil"
	| "terminal"
	| "search"
	| "bot"
	| "globe"
	| "sparkle"
	| "list"
	| "wrench";

type ToolPresentation = {
	verb: string;
	icon: ToolIconName;
	/** Input keys tried in order for the inline chip. */
	primaryKeys: string[];
	/** Show only the last path segment in the chip. */
	basename?: boolean;
};

const TOOL_PRESENTATION: Record<string, ToolPresentation> = {
	Read: {
		verb: "Read",
		icon: "file",
		primaryKeys: ["file_path"],
		basename: true,
	},
	Write: {
		verb: "Wrote",
		icon: "pencil",
		primaryKeys: ["file_path"],
		basename: true,
	},
	Edit: {
		verb: "Edited",
		icon: "pencil",
		primaryKeys: ["file_path"],
		basename: true,
	},
	NotebookEdit: {
		verb: "Edited",
		icon: "pencil",
		primaryKeys: ["notebook_path"],
		basename: true,
	},
	Bash: { verb: "Ran", icon: "terminal", primaryKeys: ["command"] },
	BashOutput: {
		verb: "Read output",
		icon: "terminal",
		primaryKeys: ["bash_id"],
	},
	Glob: { verb: "Searched", icon: "search", primaryKeys: ["pattern"] },
	Grep: { verb: "Searched", icon: "search", primaryKeys: ["pattern"] },
	Task: {
		verb: "Delegated",
		icon: "bot",
		primaryKeys: ["description", "subagent_type"],
	},
	Agent: {
		verb: "Delegated",
		icon: "bot",
		primaryKeys: ["description", "subagent_type"],
	},
	WebFetch: { verb: "Fetched", icon: "globe", primaryKeys: ["url"] },
	WebSearch: { verb: "Searched", icon: "globe", primaryKeys: ["query"] },
	Skill: { verb: "Used", icon: "sparkle", primaryKeys: ["command", "skill"] },
	TodoWrite: { verb: "Updated todos", icon: "list", primaryKeys: [] },
};

const FALLBACK: ToolPresentation = {
	verb: "Used",
	icon: "wrench",
	primaryKeys: [],
};

function basenameOf(value: string): string {
	const segments = value.split("/").filter(Boolean);
	return segments.at(-1) ?? value;
}

/** First string-ish input value, for tools with no declared primary key. */
function firstStringInput(input: Record<string, unknown>): string | undefined {
	for (const value of Object.values(input)) {
		if (typeof value === "string" && value.trim() !== "") {
			return value;
		}
	}

	return undefined;
}

export function getToolPresentation(toolName: string): {
	verb: string;
	icon: ToolIconName;
} {
	const presentation = TOOL_PRESENTATION[toolName] ?? FALLBACK;
	return { verb: presentation.verb, icon: presentation.icon };
}

export function getToolPrimaryArg(
	toolName: string,
	input: Record<string, unknown>,
): string | undefined {
	const presentation = TOOL_PRESENTATION[toolName] ?? FALLBACK;

	for (const key of presentation.primaryKeys) {
		const value = input[key];

		if (typeof value === "string" && value.trim() !== "") {
			return presentation.basename ? basenameOf(value) : value;
		}
	}

	if (presentation === FALLBACK) {
		return firstStringInput(input);
	}

	return undefined;
}

/** Raw arguments, shown dimmed after the chip so nothing is hidden outright. */
export function formatToolInputPreview(
	input: Record<string, unknown>,
): string | undefined {
	if (Object.keys(input).length === 0) {
		return undefined;
	}

	try {
		return JSON.stringify(input);
	} catch {
		return undefined;
	}
}
