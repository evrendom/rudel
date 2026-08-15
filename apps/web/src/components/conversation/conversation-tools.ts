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
	exec_command: { verb: "Ran", icon: "terminal", primaryKeys: ["cmd"] },
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

const SHELL_COMMAND_INPUT_KEYS: Record<string, readonly string[]> = {
	Bash: ["command"],
	exec_command: ["cmd"],
};

const FALLBACK: ToolPresentation = {
	verb: "Used",
	icon: "wrench",
	primaryKeys: [],
};

type FormattedShellOutput = {
	language: "json" | "text";
	text: string;
};

const DELEGATION_TOOL_NAMES = new Set(["Agent", "Task"]);
const CLAUDE_MODEL_FAMILY_PATTERN = /^(?:haiku|opus|sonnet)(?:[-_. ].*)?$/i;
const CLAUDE_READ_LINE_PREFIX_PATTERN = /^\s*\d+(?:→|\t)\s?/;

function hasStringBody(value: unknown): value is { body: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		"body" in value &&
		typeof value.body === "string"
	);
}

/** Turns machine-shaped shell results into the content a person meant to read. */
export function formatShellOutput(output: string): FormattedShellOutput {
	const text = output.trim();
	if (!text.startsWith("{") && !text.startsWith("[") && !text.startsWith('"')) {
		return { language: "text", text };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return { language: "text", text };
	}

	if (hasStringBody(parsed)) {
		return { language: "text", text: parsed.body.trim() };
	}

	if (typeof parsed === "string") {
		return { language: "text", text: parsed.trim() };
	}

	return {
		language: "json",
		text: JSON.stringify(parsed, null, 2) ?? text,
	};
}

/**
 * Claude's Read result includes its own `line→source` gutter. The code card
 * supplies the visible gutter, so remove only that tool-specific transport
 * prefix before syntax highlighting.
 */
export function normalizeToolOutput(toolName: string, output: string): string {
	if (toolName !== "Read") {
		return output;
	}

	return output
		.split("\n")
		.map((line) => line.replace(CLAUDE_READ_LINE_PREFIX_PATTERN, ""))
		.join("\n");
}

/** Model id requested by a delegation tool, normalized for brand resolution. */
export function getDelegatedModel(
	toolName: string,
	input: Record<string, unknown>,
): string | undefined {
	if (!DELEGATION_TOOL_NAMES.has(toolName)) {
		return undefined;
	}

	const model = input.model;
	if (typeof model !== "string" || model.trim() === "") {
		return undefined;
	}

	const normalizedModel = model.trim();
	if (
		normalizedModel.toLowerCase() === "inherit" ||
		normalizedModel.toLowerCase() === "default"
	) {
		return undefined;
	}

	return CLAUDE_MODEL_FAMILY_PATTERN.test(normalizedModel)
		? `claude-${normalizedModel}`
		: normalizedModel;
}

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

// Claude and Codex name their shell tools and command fields differently.
// Normalize only those known carriers so the trace can give both formats the
// same compact command treatment without mistaking arbitrary tool input for a
// shell invocation.
export function getShellCommand(
	toolName: string,
	input: Record<string, unknown>,
): string | undefined {
	const inputKeys = SHELL_COMMAND_INPUT_KEYS[toolName];
	if (!inputKeys) {
		return undefined;
	}

	for (const key of inputKeys) {
		const value = input[key];
		if (typeof value === "string" && value.trim() !== "") {
			return value.trim();
		}
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
