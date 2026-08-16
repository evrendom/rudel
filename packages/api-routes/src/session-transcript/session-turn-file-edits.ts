// Shared by browser and server transcript derivation.
type ClaudeToolBlock = {
	input?: Record<string, unknown> | null;
	name?: string | null;
	type?: string;
};

const CLAUDE_MUTATION_TOOL_NAMES: ReadonlySet<string> = new Set([
	"edit",
	"multiedit",
	"notebookedit",
	"write",
]);

export function addUniqueEditedFiles(
	editedFiles: string[],
	files: readonly string[],
) {
	for (const file of files) {
		const normalizedFile = file.trim();
		if (!normalizedFile || editedFiles.includes(normalizedFile)) {
			continue;
		}

		editedFiles.push(normalizedFile);
	}
}

export function getClaudeMutationFiles(block: ClaudeToolBlock) {
	if (
		block.type !== "tool_use" ||
		!block.name ||
		!CLAUDE_MUTATION_TOOL_NAMES.has(block.name.toLowerCase()) ||
		!block.input
	) {
		return [];
	}

	for (const key of ["file_path", "notebook_path", "path"] as const) {
		const value = block.input[key];
		if (typeof value === "string") {
			return [value];
		}
	}

	return [];
}

function parseJson(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return undefined;
	}
}

function getCodexPatchText(
	argumentsJson: string | undefined,
	input: string | undefined,
) {
	const encodedPatch = argumentsJson ?? input;
	if (!encodedPatch) {
		return undefined;
	}

	const parsed = parseJson(encodedPatch);
	if (typeof parsed === "string") {
		return parsed;
	}
	if (typeof parsed === "object" && parsed !== null) {
		const patch = Reflect.get(parsed, "patch");
		const parsedInput = Reflect.get(parsed, "input");
		if (typeof patch === "string") {
			return patch;
		}
		if (typeof parsedInput === "string") {
			return parsedInput;
		}
	}

	return encodedPatch;
}

export function getCodexMutationFiles(
	name: string | undefined,
	argumentsJson: string | undefined,
	input: string | undefined,
) {
	if (name?.split(".").at(-1)?.toLowerCase() !== "apply_patch") {
		return [];
	}

	const patch = getCodexPatchText(argumentsJson, input);
	return patch
		? Array.from(
				patch.matchAll(/^\*\*\* (?:Add|Delete|Update) File: (.+)$/gmu),
			).flatMap((match) => (match[1] ? [match[1]] : []))
		: [];
}
