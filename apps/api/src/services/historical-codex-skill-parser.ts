import type { ExtractedSkillUse } from "./skill-extraction.types.js";

type JsonRecord = Record<string, unknown>;

type SkillReadCommand =
	| { kind: "complete"; target: string }
	| { kind: "line-limited"; lineLimit: number; target: string };

interface CodexCall {
	readonly command: string;
	readonly order: number;
	readonly usedAt: string;
}

interface CodexSkillAttempt {
	readonly content: string | null;
	readonly name: string;
	readonly order: number;
	readonly usedAt: string;
}

interface MutableCodexSkillUse {
	content: string | null;
	contentOrder: number;
	readonly name: string;
	readonly usedAt: string;
}

type ToolOutput = { content: string; wasTruncated: boolean };

export function extractHistoricalCodexSkills(
	jsonl: string,
	fallbackUsedAt: string,
): readonly ExtractedSkillUse[] {
	const usesByName = new Map<string, MutableCodexSkillUse>();
	for (const attempt of readCodexSkillAttempts(jsonl, fallbackUsedAt)) {
		const existing = usesByName.get(attempt.name);
		if (!existing) {
			usesByName.set(attempt.name, {
				content: attempt.content,
				contentOrder: attempt.content === null ? -1 : attempt.order,
				name: attempt.name,
				usedAt: attempt.usedAt,
			});
			continue;
		}
		if (attempt.content !== null && attempt.order >= existing.contentOrder) {
			existing.content = attempt.content;
			existing.contentOrder = attempt.order;
		}
	}

	return [...usesByName.values()]
		.map(({ content, name, usedAt }) => ({ content, name, usedAt }))
		.sort((left, right) => left.name.localeCompare(right.name));
}

export function extractHistoricalCodexSkillBodies(
	jsonl: string,
	skillName: string,
): readonly string[] {
	const bodies = new Set<string>();
	for (const attempt of readCodexSkillAttempts(
		jsonl,
		"1970-01-01T00:00:00.000Z",
	)) {
		if (attempt.name === skillName && attempt.content !== null) {
			bodies.add(attempt.content);
		}
	}
	return [...bodies];
}

function readCodexSkillAttempts(
	jsonl: string,
	fallbackUsedAt: string,
): readonly CodexSkillAttempt[] {
	const callsById = new Map<string, CodexCall>();
	const outputsById = new Map<string, string>();
	const ambiguousCallIds = new Set<string>();
	let order = 0;

	for (const rawLine of jsonl.split(/\r\n|\n|\r/u)) {
		const item = parseJsonRecord(stripBom(rawLine));
		const payload = getRecord(item, "payload");
		if (item?.type !== "response_item" || !payload) continue;
		const callId = getString(payload, "call_id");
		if (!callId) continue;

		if (payload.type === "function_call" && payload.name === "exec_command") {
			const command = parseExecCommandArguments(
				getString(payload, "arguments"),
			);
			if (command) {
				addUniquePair(callsById, ambiguousCallIds, callId, {
					command,
					order,
					usedAt: getTimestamp(item, fallbackUsedAt),
				});
				order += 1;
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

	const attempts: CodexSkillAttempt[] = [];
	for (const [callId, call] of callsById) {
		if (ambiguousCallIds.has(callId)) continue;
		const read = parseSkillReadCommand(call.command);
		const names = read
			? getTargetSkillName(read.target)
				? [getTargetSkillName(read.target)]
				: []
			: findReferencedSkillNames(call.command);
		for (const name of names) {
			if (!name) continue;
			attempts.push({
				content: read ? recoverBody(read, outputsById.get(callId)) : null,
				name,
				order: call.order,
				usedAt: call.usedAt,
			});
		}
	}
	return attempts;
}

function recoverBody(
	read: SkillReadCommand,
	output: string | undefined,
): string | null {
	if (output === undefined) return null;
	const toolOutput = parseToolOutput(output);
	if (
		!toolOutput ||
		toolOutput.wasTruncated ||
		!hasSkillFrontmatter(toolOutput.content)
	) {
		return null;
	}
	if (
		read.kind === "line-limited" &&
		countLines(toolOutput.content) >= read.lineLimit
	) {
		return null;
	}
	return toolOutput.content;
}

function parseExecCommandArguments(
	argumentsJson: string | null,
): string | null {
	if (!argumentsJson) return null;
	return getString(parseJsonRecord(argumentsJson), "cmd");
}

function parseSkillReadCommand(command: string): SkillReadCommand | null {
	const tokens = tokenizeSingleShellCommand(command);
	if (!tokens || tokens.length < 2) return null;
	const executable = tokens[0]?.split("/").pop();
	if (executable === "cat") return parseCatCommand(tokens);
	if (executable === "sed") return parseSedCommand(tokens);
	if (executable === "head") return parseHeadCommand(tokens);
	return null;
}

function parseCatCommand(tokens: readonly string[]): SkillReadCommand | null {
	const target =
		tokens.length === 2
			? tokens[1]
			: tokens.length === 3 && tokens[1] === "--"
				? tokens[2]
				: undefined;
	if (!target || target.startsWith("-")) return null;
	return { kind: "complete", target };
}

function parseSedCommand(tokens: readonly string[]): SkillReadCommand | null {
	if (tokens.length !== 4 || tokens[1] !== "-n") return null;
	const scriptMatch = tokens[2]?.match(/^1,([1-9]\d*)p$/u);
	const target = tokens[3];
	if (!scriptMatch || !target || target.startsWith("-")) return null;
	const lineLimit = Number(scriptMatch[1]);
	if (!Number.isSafeInteger(lineLimit)) return null;
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
	if (!lineLimitText || !target || target.startsWith("-")) return null;
	const lineLimit = Number(lineLimitText);
	if (!Number.isSafeInteger(lineLimit)) return null;
	return { kind: "line-limited", lineLimit, target };
}

function tokenizeSingleShellCommand(command: string): readonly string[] | null {
	const tokens: string[] = [];
	let current = "";
	let quote: "'" | '"' | null = null;
	let escaping = false;
	if (command.includes("$(") || command.includes("`")) return null;

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
			if (character === quote) quote = null;
			else current += character;
			continue;
		}
		if (character === "'" || character === '"') {
			quote = character;
			continue;
		}
		if (/[;&|<>\r\n]/u.test(character)) return null;
		if (/\s/u.test(character)) {
			if (current.length > 0) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += character;
	}
	if (escaping || quote) return null;
	if (current.length > 0) tokens.push(current);
	return tokens;
}

function getTargetSkillName(target: string): string | null {
	const segments = target.replaceAll("\\", "/").split("/");
	const fileName = segments.at(-1);
	const skillName = segments.at(-2);
	const skillsDirectory = segments.at(-3);
	return fileName === "SKILL.md" && skillsDirectory === "skills" && skillName
		? skillName
		: null;
}

function findReferencedSkillNames(command: string): readonly string[] {
	const names = new Set<string>();
	for (const match of command
		.replaceAll("\\", "/")
		.matchAll(
			/(?:^|[\s'"])[^\s'";|<>]*\/skills\/([a-zA-Z0-9_-]+)\/SKILL\.md(?:[\s'";|<>]|$)/gu,
		)) {
		const name = match[1];
		if (name) names.add(name);
	}
	return [...names];
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
	if (!markerMatch || markerMatch.index === undefined) return null;
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
		wasTruncated: /\btruncat(?:ed|ion)\b/iu.test(header),
	};
}

function hasSkillFrontmatter(content: string): boolean {
	const normalized = stripBom(content);
	const lines = normalized.split(/\r\n|\n|\r/u);
	return lines[0] === "---" && lines.slice(1).some((line) => line === "---");
}

function countLines(content: string): number {
	if (content.length === 0) return 0;
	const lines = content.split(/\r\n|\n|\r/u);
	return /(?:\r\n|\n|\r)$/u.test(content) ? lines.length - 1 : lines.length;
}

function addUniquePair<TValue>(
	valuesByCallId: Map<string, TValue>,
	ambiguousCallIds: Set<string>,
	callId: string,
	value: TValue,
): void {
	if (valuesByCallId.has(callId)) {
		ambiguousCallIds.add(callId);
		return;
	}
	valuesByCallId.set(callId, value);
}

function getTimestamp(item: JsonRecord, fallback: string): string {
	const timestamp = getString(item, "timestamp");
	if (!timestamp || Number.isNaN(new Date(timestamp).getTime()))
		return fallback;
	return timestamp;
}

function stripBom(value: string): string {
	return value.startsWith("\uFEFF") ? value.slice(1) : value;
}

function parseJsonRecord(value: string): JsonRecord | null {
	if (value.trim().length === 0) return null;
	try {
		const parsed: unknown = JSON.parse(value);
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function getRecord(record: JsonRecord | null, key: string): JsonRecord | null {
	if (!record) return null;
	const value = record[key];
	return isRecord(value) ? value : null;
}

function getString(record: JsonRecord | null, key: string): string | null {
	if (!record) return null;
	const value = record[key];
	return typeof value === "string" ? value : null;
}

function getNumber(record: JsonRecord | null, key: string): number | null {
	if (!record) return null;
	const value = record[key];
	return typeof value === "number" ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
