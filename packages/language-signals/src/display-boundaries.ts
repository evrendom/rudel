import type { DisplayTextPart } from "./types.js";

const BLOCK_PATTERN =
	/```([\w-]*)\n([\s\S]*?)```|<([\w-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\3>/g;
const INLINE_CODE_PATTERN = /(`+)([^`\n]+?)\1/g;
const STRONG_PATTERN = /\*\*([^*\n]+?)\*\*/g;

export function splitDisplayTextParts(
	text: string,
): ReadonlyArray<DisplayTextPart> {
	const parts: DisplayTextPart[] = [];
	let cursor = 0;

	BLOCK_PATTERN.lastIndex = 0;
	let match = BLOCK_PATTERN.exec(text);
	while (match !== null) {
		appendProseParts(parts, text.slice(cursor, match.index));

		const fencedCode = match[2];
		if (fencedCode !== undefined) {
			parts.push({
				type: "fenced-code",
				content: fencedCode,
				language: match[1] || "text",
			});
		} else {
			const tag = match[3];
			const xmlContent = match[4];
			if (tag !== undefined && xmlContent !== undefined) {
				parts.push({ type: "xml", tag, content: xmlContent });
			}
		}

		cursor = match.index + match[0].length;
		match = BLOCK_PATTERN.exec(text);
	}

	appendProseParts(parts, text.slice(cursor));
	return parts;
}

function appendProseParts(parts: DisplayTextPart[], prose: string): void {
	let cursor = 0;

	INLINE_CODE_PATTERN.lastIndex = 0;
	let match = INLINE_CODE_PATTERN.exec(prose);
	while (match !== null) {
		appendStrongParts(parts, prose.slice(cursor, match.index));
		const inlineCode = match[2];
		if (inlineCode !== undefined) {
			parts.push({ type: "inline-code", content: inlineCode });
		}
		cursor = match.index + match[0].length;
		match = INLINE_CODE_PATTERN.exec(prose);
	}

	appendStrongParts(parts, prose.slice(cursor));
}

function appendStrongParts(parts: DisplayTextPart[], text: string): void {
	let cursor = 0;

	STRONG_PATTERN.lastIndex = 0;
	let match = STRONG_PATTERN.exec(text);
	while (match !== null) {
		appendTextPart(parts, text.slice(cursor, match.index));
		const strongText = match[1];
		if (strongText !== undefined) {
			parts.push({ type: "strong", content: strongText });
		}
		cursor = match.index + match[0].length;
		match = STRONG_PATTERN.exec(text);
	}

	appendTextPart(parts, text.slice(cursor));
}

function appendTextPart(parts: DisplayTextPart[], text: string): void {
	if (text.length > 0) {
		parts.push({ type: "text", content: text });
	}
}
