import type { IngestSessionInput } from "@rudel/api-routes";

export const INGEST_SHRINK_MAX_RELATIVE_BYTE_LOSS = 0.05;
export const INGEST_SHRINK_MIN_BYTE_TOLERANCE = 4 * 1024;
export const INGEST_SHRINK_MAX_RELATIVE_LINE_LOSS = 0.05;
export const INGEST_SHRINK_MIN_LINE_TOLERANCE = 1;

export interface IngestContentComponentShape {
	assistantLineCount: number;
	contentBytes: number;
}

export interface IngestContentShape extends IngestContentComponentShape {
	main: IngestContentComponentShape;
	subagents: Readonly<Record<string, IngestContentComponentShape>>;
	version: 1;
}

export function resolvePreviousIngestContentShape(input: {
	lastAssistantLineCount: number | null;
	lastContentBytes: number | null;
	lastContentShape: IngestContentShape | null;
}): IngestContentShape | null {
	if (input.lastContentShape !== null) {
		return input.lastContentShape;
	}
	if (
		input.lastAssistantLineCount === null ||
		input.lastContentBytes === null
	) {
		return null;
	}

	const main = {
		assistantLineCount: input.lastAssistantLineCount,
		contentBytes: input.lastContentBytes,
	};
	return {
		...main,
		main,
		subagents: {},
		version: 1,
	};
}

export function getIngestContentShape(
	input: IngestSessionInput,
): IngestContentShape {
	const main = getContentComponentShape(input.content, input.source);
	const subagents =
		input.source === "claude_code"
			? Object.fromEntries(
					(input.subagents ?? []).map((subagent) => [
						subagent.agentId,
						getContentComponentShape(subagent.content, input.source),
					]),
				)
			: {};
	const subagentShapes = Object.values(subagents);

	return {
		assistantLineCount: subagentShapes.reduce(
			(total, shape) => total + shape.assistantLineCount,
			main.assistantLineCount,
		),
		contentBytes: subagentShapes.reduce(
			(total, shape) => total + shape.contentBytes,
			main.contentBytes,
		),
		main,
		subagents,
		version: 1,
	};
}

export function isUnexpectedIngestShrink(
	previous: IngestContentShape,
	current: IngestContentShape,
	options: { compareTotalsOnly?: boolean } = {},
): boolean {
	if (options.compareTotalsOnly) {
		return isComponentShrink(previous, current);
	}
	if (isComponentShrink(previous.main, current.main)) {
		return true;
	}
	for (const [agentId, previousSubagent] of Object.entries(
		previous.subagents,
	)) {
		const currentSubagent = current.subagents[agentId];
		if (
			!currentSubagent ||
			isComponentShrink(previousSubagent, currentSubagent)
		) {
			return true;
		}
	}
	return false;
}

function isComponentShrink(
	previous: IngestContentComponentShape,
	current: IngestContentComponentShape,
): boolean {
	const allowedLineLoss = Math.max(
		INGEST_SHRINK_MIN_LINE_TOLERANCE,
		Math.floor(
			previous.assistantLineCount * INGEST_SHRINK_MAX_RELATIVE_LINE_LOSS,
		),
	);
	if (
		current.assistantLineCount <
		previous.assistantLineCount - allowedLineLoss
	) {
		return true;
	}
	const allowedByteLoss = Math.max(
		INGEST_SHRINK_MIN_BYTE_TOLERANCE,
		Math.floor(previous.contentBytes * INGEST_SHRINK_MAX_RELATIVE_BYTE_LOSS),
	);
	return current.contentBytes < previous.contentBytes - allowedByteLoss;
}

function getContentComponentShape(
	content: string,
	source: IngestSessionInput["source"],
): IngestContentComponentShape {
	return {
		assistantLineCount: countAssistantLines(content, source),
		contentBytes: Buffer.byteLength(content, "utf8"),
	};
}

function countAssistantLines(
	content: string,
	source: IngestSessionInput["source"],
): number {
	let count = 0;
	let start = 0;
	while (start <= content.length) {
		const newline = content.indexOf("\n", start);
		const end = newline === -1 ? content.length : newline;
		const line = content.slice(start, end);
		if (
			(source === "claude_code" &&
				hasJsonStringField(line, "type", "assistant")) ||
			(source === "codex" &&
				hasJsonStringField(line, "type", "response_item") &&
				hasJsonStringField(line, "type", "message") &&
				hasJsonStringField(line, "role", "assistant"))
		) {
			count += 1;
		}
		if (newline === -1) break;
		start = newline + 1;
	}
	return count;
}

function hasJsonStringField(line: string, key: string, value: string): boolean {
	return (
		line.includes(`"${key}":"${value}"`) ||
		line.includes(`"${key}": "${value}"`)
	);
}
