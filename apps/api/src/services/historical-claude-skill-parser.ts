import type { ExtractedSkillUse } from "./skill-extraction.types.js";

type JsonRecord = Record<string, unknown>;

interface PendingSkillInvocation {
	readonly directoryName: string;
	readonly name: string;
	readonly usedAt: string;
}

interface MutableSkillUse {
	content: string | null;
	readonly name: string;
	readonly usedAt: string;
}

interface SkillMetaContent {
	readonly content: string;
	readonly directoryName: string;
}

export function extractHistoricalClaudeSkills(
	jsonl: string,
	fallbackUsedAt: string,
): readonly ExtractedSkillUse[] {
	const pending: PendingSkillInvocation[] = [];
	const usesByName = new Map<string, MutableSkillUse>();

	for (const rawLine of jsonl.split(/\r\n|\n|\r/u)) {
		const item = parseJsonRecord(stripBom(rawLine));
		if (!item) continue;

		if (isAssistantEntry(item)) {
			const message = getRecord(item, "message");
			const content = message?.content;
			if (!Array.isArray(content)) continue;

			for (const block of content) {
				if (!isRecord(block) || block.type !== "tool_use") continue;
				if (getString(block, "name") !== "Skill") continue;
				const input = getRecord(block, "input");
				const name = getString(input, "skill")?.trim();
				if (!name) continue;
				const usedAt = getTimestamp(item, fallbackUsedAt);
				pending.push({
					directoryName: name.split(":").at(-1) ?? name,
					name,
					usedAt,
				});
				if (!usesByName.has(name)) {
					usesByName.set(name, { content: null, name, usedAt });
				}
			}
			continue;
		}

		if (!isMetaUserEntry(item)) continue;
		const meta = parseSkillMetaContent(getUserText(item));
		if (!meta) continue;
		const pendingIndex = findPendingInvocation(pending, meta.directoryName);
		if (pendingIndex === -1) continue;
		const [invocation] = pending.splice(pendingIndex, 1);
		if (!invocation) continue;
		const existing = usesByName.get(invocation.name);
		if (existing) {
			existing.content = meta.content;
		}
	}

	return [...usesByName.values()].sort((left, right) =>
		left.name.localeCompare(right.name),
	);
}

function isAssistantEntry(item: JsonRecord): boolean {
	const message = getRecord(item, "message");
	return item.type === "assistant" && message?.role === "assistant";
}

function isMetaUserEntry(item: JsonRecord): boolean {
	const message = getRecord(item, "message");
	return (
		item.type === "user" && item.isMeta === true && message?.role === "user"
	);
}

function getUserText(item: JsonRecord): string {
	const message = getRecord(item, "message");
	const content = message?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	return content
		.flatMap((block) => {
			if (typeof block === "string") return block === "" ? [] : [block];
			if (!isRecord(block) || block.type !== "text") return [];
			const text = getString(block, "text");
			return text === null || text === "" ? [] : [text];
		})
		.join("\n");
}

function parseSkillMetaContent(text: string): SkillMetaContent | null {
	const withoutBom = stripBom(text);
	const lineBreak = /\r\n|\n|\r/u.exec(withoutBom);
	const header = lineBreak ? withoutBom.slice(0, lineBreak.index) : withoutBom;
	const prefix = "Base directory for this skill:";
	if (!header.startsWith(prefix)) return null;

	const baseDirectory = header
		.slice(prefix.length)
		.trim()
		.replace(/[\\/]+$/u, "");
	const directoryName = baseDirectory.replaceAll("\\", "/").split("/").at(-1);
	if (!directoryName || !lineBreak) return null;

	const rawBody = withoutBom.slice(lineBreak.index + lineBreak[0].length);
	const content = stripFrontmatter(stripLeadingBlankLines(rawBody));
	if (content === "") return null;
	return { content, directoryName };
}

function stripLeadingBlankLines(value: string): string {
	let result = value;
	while (/^[\t ]*(?:\r\n|\n|\r)/u.test(result)) {
		result = result.replace(/^[\t ]*(?:\r\n|\n|\r)/u, "");
	}
	return stripBom(result);
}

function stripFrontmatter(value: string): string {
	const opening = /^(---)(?:\r\n|\n|\r)/u.exec(value);
	if (!opening) return value;
	const afterOpening = value.slice(opening[0].length);
	const closing = /(?:^|\r\n|\n|\r)---(?:\r\n|\n|\r)/u.exec(afterOpening);
	if (!closing || closing.index === undefined) return value;
	const bodyStart = closing.index + closing[0].length;
	return stripLeadingBlankLines(afterOpening.slice(bodyStart));
}

function findPendingInvocation(
	pending: readonly PendingSkillInvocation[],
	directoryName: string,
): number {
	for (let index = pending.length - 1; index >= 0; index -= 1) {
		if (pending[index]?.directoryName === directoryName) return index;
	}
	return -1;
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

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
