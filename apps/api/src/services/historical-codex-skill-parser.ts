type JsonRecord = Record<string, unknown>;

type SkillReadCommand =
	| {
			kind: "complete";
			target: string;
	  }
	| {
			kind: "line-limited";
			lineLimit: number;
			target: string;
	  };

type ToolOutput = {
	content: string;
	wasTruncated: boolean;
};

export function extractHistoricalCodexSkillBodies(
	jsonl: string,
	skillName: string,
): readonly string[] {
	const callsById = new Map<string, string>();
	const outputsById = new Map<string, string>();
	const ambiguousCallIds = new Set<string>();

	for (const line of jsonl.split("\n")) {
		const item = parseJsonRecord(line);
		const payload = getRecord(item, "payload");
		if (item?.type !== "response_item" || !payload) {
			continue;
		}

		const callId = getString(payload, "call_id");
		if (!callId) {
			continue;
		}

		if (payload.type === "function_call" && payload.name === "exec_command") {
			const command = parseExecCommandArguments(
				getString(payload, "arguments"),
			);
			if (command) {
				addUniquePair(callsById, ambiguousCallIds, callId, command);
			}
			continue;
		}

		if (payload.type === "function_call_output") {
			const output = getString(payload, "output");
			if (output !== null) {
				addUniquePair(outputsById, ambiguousCallIds, callId, output);
			}
		}
	}

	const bodies = new Set<string>();
	for (const [callId, command] of callsById) {
		if (ambiguousCallIds.has(callId)) {
			continue;
		}

		const output = outputsById.get(callId);
		if (output === undefined) {
			continue;
		}

		const read = parseSkillReadCommand(command);
		if (!read || !targetsSkill(read.target, skillName)) {
			continue;
		}

		const toolOutput = parseToolOutput(output);
		if (
			!toolOutput ||
			toolOutput.wasTruncated ||
			!hasSkillFrontmatter(toolOutput.content)
		) {
			continue;
		}

		if (
			read.kind === "line-limited" &&
			countLines(toolOutput.content) >= read.lineLimit
		) {
			continue;
		}

		bodies.add(toolOutput.content);
	}

	return [...bodies];
}

function parseExecCommandArguments(
	argumentsJson: string | null,
): string | null {
	if (!argumentsJson) {
		return null;
	}

	const parsed = parseJsonRecord(argumentsJson);
	return getString(parsed, "cmd");
}

function parseSkillReadCommand(command: string): SkillReadCommand | null {
	const tokens = tokenizeSingleShellCommand(command);
	if (!tokens || tokens.length < 2) {
		return null;
	}

	const executable = tokens[0]?.split("/").pop();
	if (executable === "cat") {
		return parseCatCommand(tokens);
	}
	if (executable === "sed") {
		return parseSedCommand(tokens);
	}
	if (executable === "head") {
		return parseHeadCommand(tokens);
	}

	return null;
}

function parseCatCommand(tokens: readonly string[]): SkillReadCommand | null {
	const target =
		tokens.length === 2
			? tokens[1]
			: tokens.length === 3 && tokens[1] === "--"
				? tokens[2]
				: undefined;
	if (!target || target.startsWith("-")) {
		return null;
	}

	return { kind: "complete", target };
}

function parseSedCommand(tokens: readonly string[]): SkillReadCommand | null {
	if (tokens.length !== 4 || tokens[1] !== "-n") {
		return null;
	}

	const scriptMatch = tokens[2]?.match(/^1,([1-9]\d*)p$/u);
	const target = tokens[3];
	if (!scriptMatch || !target || target.startsWith("-")) {
		return null;
	}

	const lineLimit = Number(scriptMatch[1]);
	if (!Number.isSafeInteger(lineLimit)) {
		return null;
	}

	return { kind: "line-limited", lineLimit, target };
}

function parseHeadCommand(tokens: readonly string[]): SkillReadCommand | null {
	let lineLimitText: string | undefined;
	let target: string | undefined;

	if (tokens.length === 4 && tokens[1] === "-n") {
		lineLimitText = tokens[2];
		target = tokens[3];
	} else if (tokens.length === 3) {
		const compactMatch = tokens[1]?.match(/^-n?([1-9]\d*)$/u);
		lineLimitText = compactMatch?.[1];
		target = tokens[2];
	}

	if (!lineLimitText || !target || target.startsWith("-")) {
		return null;
	}

	const lineLimit = Number(lineLimitText);
	if (!Number.isSafeInteger(lineLimit)) {
		return null;
	}

	return { kind: "line-limited", lineLimit, target };
}

function tokenizeSingleShellCommand(command: string): readonly string[] | null {
	const tokens: string[] = [];
	let current = "";
	let quote: "'" | '"' | null = null;
	let escaping = false;

	if (command.includes("$(") || command.includes("`")) {
		return null;
	}

	for (const character of command.trim()) {
		if (escaping) {
			current += character;
			escaping = false;
			continue;
		}

		if (character === "\\" && quote !== "'") {
			escaping = true;
			continue;
		}

		if (quote) {
			if (character === quote) {
				quote = null;
			} else {
				current += character;
			}
			continue;
		}

		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}

		if (/[;&|<>\r\n]/u.test(character)) {
			return null;
		}

		if (/\s/u.test(character)) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
			continue;
		}

		current += character;
	}

	if (escaping || quote) {
		return null;
	}
	if (current.length > 0) {
		tokens.push(current);
	}

	return tokens;
}

function targetsSkill(target: string, skillName: string): boolean {
	const normalizedTarget = target.replaceAll("\\", "/");
	const segments = normalizedTarget.split("/");
	const fileName = segments.at(-1);
	const targetSkillName = segments.at(-2);
	const skillsDirectory = segments.at(-3);

	return (
		fileName === "SKILL.md" &&
		skillsDirectory === "skills" &&
		targetSkillName === skillName
	);
}

function parseToolOutput(output: string): ToolOutput | null {
	const jsonEnvelope = parseJsonRecord(output);
	if (jsonEnvelope) {
		const content = getString(jsonEnvelope, "output");
		const metadata = getRecord(jsonEnvelope, "metadata");
		const exitCode = getNumber(metadata, "exit_code");
		if (content !== null && exitCode === 0) {
			return {
				content,
				wasTruncated:
					metadata?.truncated === true || metadata?.output_truncated === true,
			};
		}
	}

	const markerMatch = /(?:^|\r?\n)(?:Final output|Output):\r?\n/u.exec(output);
	if (!markerMatch || markerMatch.index === undefined) {
		return null;
	}

	const headerEnd = markerMatch.index + markerMatch[0].length;
	const header = output.slice(0, headerEnd);
	if (
		!header.startsWith("Chunk ID:") ||
		!/Process exited with code 0(?:\r?\n|$)/u.test(header)
	) {
		return null;
	}

	return {
		content: output.slice(headerEnd),
		wasTruncated: containsTruncationNotice(header),
	};
}

function containsTruncationNotice(value: string): boolean {
	return /\btruncat(?:ed|ion)\b/iu.test(value);
}

function hasSkillFrontmatter(content: string): boolean {
	const normalized = content.startsWith("\uFEFF") ? content.slice(1) : content;
	const lines = normalized.split(/\r\n|\n|\r/u);
	if (lines[0] !== "---") {
		return false;
	}

	return lines.slice(1).some((line) => line === "---");
}

function countLines(content: string): number {
	if (content.length === 0) {
		return 0;
	}

	const lines = content.split(/\r\n|\n|\r/u);
	return /(?:\r\n|\n|\r)$/u.test(content) ? lines.length - 1 : lines.length;
}

function addUniquePair(
	valuesByCallId: Map<string, string>,
	ambiguousCallIds: Set<string>,
	callId: string,
	value: string,
): void {
	if (valuesByCallId.has(callId)) {
		ambiguousCallIds.add(callId);
		return;
	}

	valuesByCallId.set(callId, value);
}

function parseJsonRecord(value: string): JsonRecord | null {
	if (value.trim().length === 0) {
		return null;
	}

	try {
		const parsed: unknown = JSON.parse(value);
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function getRecord(record: JsonRecord | null, key: string): JsonRecord | null {
	if (!record) {
		return null;
	}

	const value = record[key];
	return isRecord(value) ? value : null;
}

function getString(record: JsonRecord | null, key: string): string | null {
	if (!record) {
		return null;
	}

	const value = record[key];
	return typeof value === "string" ? value : null;
}

function getNumber(record: JsonRecord | null, key: string): number | null {
	if (!record) {
		return null;
	}

	const value = record[key];
	return typeof value === "number" ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
